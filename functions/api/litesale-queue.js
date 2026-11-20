// LiteSale review queue. Explicit approval only; no automatic order insertion.
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=x=>String(x??'').trim();
const norm=x=>{let s=clean(x).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');if(s.startsWith('00962'))s=s.slice(2);if(s.startsWith('962')&&s.length>=12)s='0'+s.slice(3);if(s.length===9&&s.startsWith('7'))s='0'+s;return s};
async function init(env){await env.DB.prepare(`CREATE TABLE IF NOT EXISTS litesale_review_queue(source_id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','dismissed')),corvex_order_id INTEGER,reviewed_by INTEGER,reviewed_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_litesale_queue_state ON litesale_review_queue(state,created_at)').run();await env.DB.prepare('CREATE TABLE IF NOT EXISTS litesale_approval_lock(source_id TEXT PRIMARY KEY,approved_at TEXT NOT NULL DEFAULT (datetime(\'now\')))').run()}
export async function onRequest({request,env}){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'invalid_origin'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(token).first();
 if(!user||user.role!=='admin')return json({error:'admin_required'},403);
 await init(env);
 if(request.method==='GET'){
  const rows=await env.DB.prepare("SELECT source_id,payload,created_at FROM litesale_review_queue WHERE state='pending' ORDER BY COALESCE(json_extract(payload,'$.source_created_at'),created_at) DESC, created_at DESC LIMIT 500").all();
  const stores=await env.DB.prepare('SELECT id,name FROM stores WHERE is_active=1 ORDER BY name').all();
  return json({orders:(rows.results||[]).map(r=>({source_id:r.source_id,...JSON.parse(r.payload),queued_at:r.created_at})),stores:stores.results||[],approval_requires_click:true});
 }
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 let b;try{b=await request.json()}catch{return json({error:'invalid_json'},400)}
 if(b.action==='stage'){
  if(!Array.isArray(b.orders)||b.orders.length>50)return json({error:'invalid_batch'},400);
  let added=0;
  for(const o of b.orders){
   const id=clean(o.source_id);if(!/^[-\w]{1,100}$/.test(id))continue;
   const data={name:clean(o.name).slice(0,180),phone:clean(o.phone).slice(0,45),product:clean(o.product).slice(0,200),color:clean(o.color).slice(0,100),size:clean(o.size).slice(0,80),weight_kg:o.weight_kg==null?null:Number(o.weight_kg),weight_text:clean(o.weight_text).slice(0,100),quantity:Number(o.quantity)||1,amount:o.amount==null?null:Number(o.amount),address:clean(o.address).slice(0,500),city:clean(o.city).slice(0,120),notes:clean(o.notes).slice(0,700),status:clean(o.status).slice(0,50),source_created_at:clean(o.source_created_at).slice(0,80)};
   if(!data.name||!data.phone||!Number.isFinite(data.amount)||data.amount<0||!Number.isInteger(data.quantity)||data.quantity<1||data.quantity>500|| (data.weight_kg!=null&&(!Number.isFinite(data.weight_kg)||data.weight_kg<20||data.weight_kg>300)))continue;
   const r=await env.DB.prepare("INSERT INTO litesale_review_queue(source_id,payload) VALUES(?,?) ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now') WHERE litesale_review_queue.state='pending'").bind(id,JSON.stringify(data)).run();added+=r.meta?.changes||0;
  }
  return json({ok:true,added,imported:0});
 }
 const id=clean(b.source_id);if(!/^[-\w]{1,100}$/.test(id))return json({error:'invalid_id'},400);
 if(b.action==='dismiss'){
  const r=await env.DB.prepare("UPDATE litesale_review_queue SET state='dismissed',reviewed_by=?,reviewed_at=datetime('now'),updated_at=datetime('now') WHERE source_id=? AND state='pending'").bind(user.id,id).run();
  return r.meta?.changes?json({ok:true}):json({error:'not_pending'},409);
 }
 if(b.action!=='approve')return json({error:'invalid_action'},400);
 const storeId=Number(b.store_id);if(!Number.isSafeInteger(storeId)||storeId<=0)return json({error:'choose_store'},400);
 const store=await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();if(!store)return json({error:'invalid_store'},400);
 const row=await env.DB.prepare("SELECT payload FROM litesale_review_queue WHERE source_id=? AND state='pending'").bind(id).first();if(!row)return json({error:'already_reviewed'},409);
 const d=JSON.parse(row.payload),phone=norm(d.phone);if(!phone)return json({error:'missing_phone'},422);
 if(d.amount==null||!Number.isFinite(Number(d.amount)))return json({error:'missing_amount'},422);
 const existing=await env.DB.prepare("SELECT id,order_code FROM orders WHERE store_id=? AND phone=? AND created_at>=datetime('now','-48 hours') LIMIT 1").bind(storeId,phone).first();
 if(existing)return json({error:'possible_duplicate_phone',existing_order_code:existing.order_code},409);
 const codeRow=await env.DB.prepare('SELECT COALESCE(MAX(order_code),4400)+1 AS code FROM orders').first();
 const courier=await env.DB.prepare("SELECT id FROM couriers WHERE name='مندوب' AND is_active=1 ORDER BY id LIMIT 1").first();
 const spec=[d.product,d.color&&'اللون: '+d.color,d.size&&'المقاس: '+d.size,(d.weight_text?'الوزن/المقاس: '+d.weight_text:(d.weight_kg!=null?'الوزن: '+d.weight_kg+' كغ':null)),'الكمية: '+d.quantity].filter(Boolean).join(' | ');
 const notes=[spec,d.notes,'LiteSale: '+id].filter(Boolean).join('\n');
 const insert=env.DB.prepare("INSERT INTO orders(order_code,recipient_name,phone,area,detailed_address,amount,order_notes,raw_text,cost_of_goods,created_by,store_id,courier_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(Number(codeRow.code),d.name,phone,d.city,d.address,Number(d.amount),notes,notes,0,user.id,storeId,courier?.id||null);
 const update=env.DB.prepare("UPDATE litesale_review_queue SET state='approved',corvex_order_id=(SELECT id FROM orders WHERE order_code=?),reviewed_by=?,reviewed_at=datetime('now'),updated_at=datetime('now') WHERE source_id=? AND state='pending'").bind(Number(codeRow.code),user.id,id);
 try{await env.DB.batch([env.DB.prepare('INSERT INTO litesale_approval_lock(source_id) VALUES(?)').bind(id),insert,update]);return json({ok:true,order_code:Number(codeRow.code)})}catch(e){return json({error:'approval_failed',detail:clean(e.message).slice(0,130)},409)}
}
