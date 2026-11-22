const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const phone=x=>{let s=String(x??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');if(s.startsWith('00962'))s=s.slice(2);if(s.startsWith('962'))s='0'+s.slice(3);if(s.length===9&&s.startsWith('7'))s='0'+s;return s};
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'admin_required'},403);
 let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
 const rows=body.rows;
 if(!Array.isArray(rows)||!rows.length||rows.length>500)return json({error:'invalid_rows'},400);
 const unique=new Set(),accepted=[],skipped=[];
 for(const row of rows){
  const id=Number(row.order_id),code=String(row.shipment_code||'').trim(),p=phone(row.phone);
  if(!Number.isSafeInteger(id)||id<=0||!code||!p||unique.has(id)){skipped.push({order_id:id,reason:'بيانات ناقصة أو طلب مكرر'});continue}
  unique.add(id);
  const o=await env.DB.prepare("SELECT id,order_code,phone,delivery_status FROM orders WHERE id=?").bind(id).first();
  if(!o||phone(o.phone)!==p){skipped.push({order_id:id,shipment_code:code,reason:'رقم الهاتف لا يطابق الطلب'});continue}
  if(o.delivery_status==='partial'||o.delivery_status==='delivered_adjusted'){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'تسليم جزئي يحتاج مراجعة منفصلة'});continue}
  if(o.delivery_status==='returned'){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'مرتجع مسبقًا'});continue}
  if(o.delivery_status!=='pending'){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'الطلب ليس قيد التوصيل؛ يحتاج مراجعة ولا يتم تغييره تلقائيًا'});continue}
  accepted.push({id,code});
 }
 if(!accepted.length)return json({ok:true,updated:0,skipped});
 // Only update status: never alter settlement, inventory, or collected cash.
 const result=await env.DB.batch(accepted.map(x=>env.DB.prepare("UPDATE orders SET delivery_status='returned',updated_at=datetime('now') WHERE id=? AND delivery_status='pending'").bind(x.id)));
 const updated=result.reduce((n,x)=>n+Number(x.meta?.changes||0),0);
 return json({ok:true,updated,skipped});
}