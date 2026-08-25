const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
async function body(req){try{return await req.json()}catch{return {}}}
async function auth(request,env){const h=request.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;return await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first()}
function clean(v=''){return String(v||'').trim()}
async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS direct_orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direct_code INTEGER NOT NULL UNIQUE,
  store_id INTEGER NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  detailed_address TEXT NOT NULL DEFAULT '',
  pieces INTEGER NOT NULL DEFAULT 1,
  weight REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  order_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  printed INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_direct_orders_store ON direct_orders(store_id)').run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_direct_orders_created ON direct_orders(created_at)').run();
}
const select=`SELECT d.*,s.name store_name,u.display_name created_by_name FROM direct_orders d LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN users u ON u.id=d.created_by`;
export async function onRequest({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);await ensure(env);
 const url=new URL(request.url),method=request.method.toUpperCase();
 if(method==='GET'){
  const id=Number(url.searchParams.get('id')||0);if(id){const row=await env.DB.prepare(select+' WHERE d.id=?').bind(id).first();return row?json({order:row}):json({error:'الطلب المباشر غير موجود'},404)}
  const store=Number(url.searchParams.get('store_id')||0),from=clean(url.searchParams.get('from_date')),to=clean(url.searchParams.get('to_date')),q=clean(url.searchParams.get('q'));
  const where=[],bind=[];if(store){where.push('d.store_id=?');bind.push(store)}if(from){where.push("date(d.created_at)>=date(?)");bind.push(from)}if(to){where.push("date(d.created_at)<=date(?)");bind.push(to)}if(q){where.push('(CAST(d.direct_code AS TEXT) LIKE ? OR d.recipient_name LIKE ? OR d.phone LIKE ?)');bind.push('%'+q+'%','%'+q+'%','%'+q+'%')}
  const rows=await env.DB.prepare(select+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY d.id DESC LIMIT 2000').bind(...bind).all();return json({orders:rows.results||[]});
 }
 if(method==='POST'){
  const b=await body(request),storeId=Number(b.store_id||0);if(!storeId)return json({error:'اختر المتجر'},400);const store=await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();if(!store)return json({error:'المتجر غير موجود'},400);
  const max=await env.DB.prepare('SELECT COALESCE(MAX(direct_code),0) n FROM direct_orders').first(),code=Math.max(1000,Number(max?.n||0)+1);
  const r=await env.DB.prepare(`INSERT INTO direct_orders(direct_code,store_id,recipient_name,phone,area,detailed_address,pieces,weight,amount,order_notes,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(code,storeId,clean(b.recipient_name),clean(b.phone),clean(b.area),clean(b.detailed_address),Math.max(1,Number(b.pieces||1)),Math.max(0,Number(b.weight||0)),Number(b.amount||0),clean(b.order_notes),'pending',me.id).run();const row=await env.DB.prepare(select+' WHERE d.id=?').bind(r.meta.last_row_id).first();return json({order:row});
 }
 if(method==='PUT'){
  const b=await body(request),id=Number(b.id||0);if(!id)return json({error:'رقم الطلب مطلوب'},400);const old=await env.DB.prepare('SELECT * FROM direct_orders WHERE id=?').bind(id).first();if(!old)return json({error:'الطلب غير موجود'},404);
  await env.DB.prepare(`UPDATE direct_orders SET store_id=?,recipient_name=?,phone=?,area=?,detailed_address=?,pieces=?,weight=?,amount=?,order_notes=?,status=?,updated_at=datetime('now') WHERE id=?`).bind(Number(b.store_id||old.store_id),clean(b.recipient_name??old.recipient_name),clean(b.phone??old.phone),clean(b.area??old.area),clean(b.detailed_address??old.detailed_address),Math.max(1,Number(b.pieces??old.pieces)),Math.max(0,Number(b.weight??old.weight)),Number(b.amount??old.amount),clean(b.order_notes??old.order_notes),['pending','delivered','cancelled'].includes(b.status)?b.status:old.status,id).run();const row=await env.DB.prepare(select+' WHERE d.id=?').bind(id).first();return json({order:row});
 }
 if(method==='DELETE'){
  const id=Number(url.searchParams.get('id')||0);if(!id)return json({error:'رقم الطلب مطلوب'},400);if(me.role!=='admin')return json({error:'الحذف للمدير فقط'},403);await env.DB.prepare('DELETE FROM direct_orders WHERE id=?').bind(id).run();return json({ok:true});
 }
 return json({error:'طلب غير معروف'},404);
}
