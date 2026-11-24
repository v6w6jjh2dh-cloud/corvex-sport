import {ensureInventorySchema,classifyInventoryItems,loadInventoryModels,restockStatements} from './_inventory.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function onRequest({request,env}){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'صلاحية المدير مطلوبة'},403);
 await ensureInventorySchema(env);
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS cargo_return_receipts(
 shipment_code TEXT PRIMARY KEY,order_id INTEGER NOT NULL,received_by INTEGER NOT NULL,
 received_at TEXT NOT NULL DEFAULT(datetime('now')),items_json TEXT NOT NULL)`).run();
 if(request.method==='GET'){
  const rows=(await env.DB.prepare('SELECT shipment_code,order_id,received_at,items_json FROM cargo_return_receipts ORDER BY received_at DESC LIMIT 500').all()).results||[];
  return json({receipts:rows});
 }
 if(request.method!=='POST')return json({error:'طريقة غير مدعومة'},405);
 const b=await request.json().catch(()=>({})),code=String(b.shipment_code||'').trim().slice(0,80),orderId=Number(b.order_id||0);
 if(!code||!Number.isInteger(orderId)||orderId<1)return json({error:'بيانات الشحنة أو الطلب غير صحيحة'},400);
 const existing=await env.DB.prepare('SELECT shipment_code FROM cargo_return_receipts WHERE shipment_code=?').bind(code).first();
 if(existing)return json({error:'تم استلام هذه الشحنة سابقًا، لا يمكن إضافتها مرتين'},409);
 const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
 if(!order||!order.first_printed_at)return json({error:'الطلب غير موجود أو لم تُطبع بوليصته'},422);
 const models=await loadInventoryModels(env);
 const parsed=await classifyInventoryItems(env,order.raw_text||order.order_notes||'',models);
 if(!parsed.length)return json({error:'لم يتم التعرف على موديل الطلب؛ يلزم مراجعة يدوية'},422);
 const allocated=(await env.DB.prepare('SELECT model_id,quantity FROM inventory_order_items WHERE order_id=?').bind(orderId).all()).results||[];
 if(!allocated.length)return json({error:'لا يوجد خصم مسجل لهذا الطلب في الجرد؛ لا يمكن إرجاعه تلقائيًا'},422);
 let partialExpected=null;
 if(order.delivery_status==='partial'){
  let delivered=[];
  try{delivered=JSON.parse(order.partial_received_items||'[]')}catch{}
  if(!Array.isArray(delivered)||!delivered.length)return json({error:'التسليم الجزئي غير مفصل؛ لا يمكن استلام المرتجع تلقائيًا'},422);
  const deliveredMap=new Map(delivered.map(x=>[Number(x.model_id),Number(x.received??x.quantity??0)]));
  partialExpected=new Map(parsed.map(x=>[x.model_id,Math.max(0,x.quantity-(deliveredMap.get(x.model_id)||0))]));
 }
 // Everything already added back for this order — by earlier receipts or by closing a
 // returns statement — so the same pieces can never be added twice.
 const already=new Map(((await env.DB.prepare("SELECT model_id,SUM(quantity_delta) q FROM inventory_movements WHERE order_id=? AND quantity_delta>0 AND movement_type='cargo_return' GROUP BY model_id").bind(orderId).all()).results||[]).map(r=>[Number(r.model_id),Number(r.q||0)]));
 const allocation=new Map(allocated.map(x=>[Number(x.model_id),Number(x.quantity)]));
 const items=Array.isArray(b.items)?b.items.map(x=>({model_id:Number(x.model_id),quantity:Number(x.quantity)})):[];
 if(!items.length||items.some(x=>!Number.isInteger(x.model_id)||!Number.isInteger(x.quantity)||x.quantity<1)||new Set(items.map(x=>x.model_id)).size!==items.length)return json({error:'حدد كميات مرتجع صحيحة'},422);
 for(const item of items)if(!allocation.has(item.model_id)||item.quantity+(already.get(item.model_id)||0)>Math.min(allocation.get(item.model_id),partialExpected?partialExpected.get(item.model_id)||0:allocation.get(item.model_id)))return json({error:'كمية المرتجع تتجاوز الكمية المخصومة لهذا الطلب'},422);
 const statements=[env.DB.prepare('INSERT INTO cargo_return_receipts(shipment_code,order_id,received_by,items_json) VALUES(?,?,?,?)').bind(code,orderId,user.id,JSON.stringify(items))];
 statements.push(...restockStatements(env,orderId,items.map(i=>({...i,limit:Math.min(allocation.get(i.model_id),partialExpected?partialExpected.get(i.model_id)||0:allocation.get(i.model_id))})),user.id,'استلام مرتجع Cargo Box '+code,{sourceRef:'receipt:'+code}));
 try{await env.DB.batch(statements)}catch(error){
  if(/UNIQUE|constraint/i.test(String(error)))return json({error:'المرتجع مسجل سابقًا'},409);
  throw error;
 }
 return json({ok:true,shipment_code:code,items});
}
