const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
async function body(req){try{return await req.json()}catch{return {}}}
async function auth(request,env){const h=request.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;return await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first()}
function clean(v=''){return String(v??'').trim()}
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
const STATUSES=new Set(['pending','delivered','delivered_adjusted','partial','refused_fee_paid','refused_no_fee','canceled_before_arrival']);
async function addCol(env,sql){try{await env.DB.prepare(sql).run()}catch{}}
async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS direct_orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,direct_code INTEGER NOT NULL UNIQUE,store_id INTEGER NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',area TEXT NOT NULL DEFAULT '',detailed_address TEXT NOT NULL DEFAULT '',
  pieces INTEGER NOT NULL DEFAULT 1,weight REAL NOT NULL DEFAULT 0,amount REAL NOT NULL DEFAULT 0,order_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',printed INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN delivered_amount REAL NOT NULL DEFAULT 0");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN delivery_fee REAL NOT NULL DEFAULT 2");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN cash_collected REAL NOT NULL DEFAULT 0");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN cost_of_goods REAL NOT NULL DEFAULT 0");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN delivered_pieces INTEGER NOT NULL DEFAULT 0");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN returned_pieces INTEGER NOT NULL DEFAULT 0");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN settlement_note TEXT NOT NULL DEFAULT ''");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN first_printed_at TEXT");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN last_printed_at TEXT");
 await addCol(env,"ALTER TABLE direct_orders ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0");
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS direct_returns(
  id INTEGER PRIMARY KEY AUTOINCREMENT,direct_order_id INTEGER NOT NULL UNIQUE,return_type TEXT NOT NULL DEFAULT 'full',
  returned_pieces INTEGER NOT NULL DEFAULT 1,reason TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_direct_orders_store ON direct_orders(store_id)').run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_direct_orders_created ON direct_orders(created_at)').run();
}
const select=`SELECT d.*,s.name store_name,u.display_name created_by_name FROM direct_orders d LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN users u ON u.id=d.created_by`;
async function one(env,id){return await env.DB.prepare(select+' WHERE d.id=?').bind(id).first()}
async function returnRows(env){const q=await env.DB.prepare(`SELECT r.*,d.direct_code,d.recipient_name,d.phone,d.pieces,d.amount,d.order_notes,d.status,s.name store_name,u.display_name created_by_name FROM direct_returns r JOIN direct_orders d ON d.id=r.direct_order_id LEFT JOIN stores s ON s.id=d.store_id LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 1000`).all();return q.results||[]}
function codeNum(v=''){const m=String(v).match(/(\d+)\s*$/);return m?Number(m[1]):0}
export async function onRequest({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);await ensure(env);
 const url=new URL(request.url),method=request.method.toUpperCase(),action=clean(url.searchParams.get('action'));
 if(action==='returns'){
  if(method==='GET')return json({returns:await returnRows(env)});
  if(method==='POST'){
   const b=await body(request),code=codeNum(b.code||b.direct_code),id=n(b.id);let o=null;
   if(id)o=await env.DB.prepare('SELECT * FROM direct_orders WHERE id=?').bind(id).first();else if(code)o=await env.DB.prepare('SELECT * FROM direct_orders WHERE direct_code=?').bind(code).first();
   if(!o)return json({error:'طلب المباشر غير موجود'},404);
   const returned=Math.max(1,Math.min(n(b.returned_pieces,o.pieces),n(o.pieces,1)));
   const ex=await env.DB.prepare('SELECT id FROM direct_returns WHERE direct_order_id=?').bind(o.id).first();
   if(ex){await env.DB.prepare(`UPDATE direct_returns SET return_type=?,returned_pieces=?,reason=?,notes=?,updated_at=datetime('now') WHERE direct_order_id=?`).bind(b.return_type==='partial'?'partial':'full',returned,clean(b.reason||'مرتجع مباشر'),clean(b.notes||o.order_notes),o.id).run()}
   else{await env.DB.prepare(`INSERT INTO direct_returns(direct_order_id,return_type,returned_pieces,reason,notes,created_by) VALUES(?,?,?,?,?,?)`).bind(o.id,b.return_type==='partial'?'partial':'full',returned,clean(b.reason||'مرتجع مباشر'),clean(b.notes||o.order_notes),me.id).run()}
   await env.DB.prepare(`UPDATE direct_orders SET returned_pieces=?,updated_at=datetime('now') WHERE id=?`).bind(returned,o.id).run();
   return json({ok:true,returns:await returnRows(env)});
  }
  if(method==='DELETE'){
   const id=n(url.searchParams.get('id'));if(!id)return json({error:'رقم المرتجع مطلوب'},400);const r=await env.DB.prepare('SELECT direct_order_id FROM direct_returns WHERE id=?').bind(id).first();if(!r)return json({error:'المرتجع غير موجود'},404);
   await env.DB.prepare('DELETE FROM direct_returns WHERE id=?').bind(id).run();await env.DB.prepare("UPDATE direct_orders SET returned_pieces=0,updated_at=datetime('now') WHERE id=?").bind(r.direct_order_id).run();return json({ok:true,returns:await returnRows(env)});
  }
 }
 if(action==='print'&&method==='POST'){
  const b=await body(request),ids=(Array.isArray(b.ids)?b.ids:[]).map(Number).filter(Boolean);if(!ids.length)return json({error:'اختر طلبات للطباعة'},400);
  for(const id of ids)await env.DB.prepare(`UPDATE direct_orders SET printed=1,first_printed_at=COALESCE(first_printed_at,datetime('now')),last_printed_at=datetime('now'),print_count=COALESCE(print_count,0)+1 WHERE id=?`).bind(id).run();return json({ok:true});
 }
 if(method==='GET'){
  const id=n(url.searchParams.get('id'));if(id){const row=await one(env,id);return row?json({order:row}):json({error:'الطلب المباشر غير موجود'},404)}
  const store=n(url.searchParams.get('store_id')),from=clean(url.searchParams.get('from_date')),to=clean(url.searchParams.get('to_date')),q=clean(url.searchParams.get('q')),status=clean(url.searchParams.get('status'));
  const where=[],bind=[];if(store){where.push('d.store_id=?');bind.push(store)}if(from){where.push("date(d.created_at)>=date(?)");bind.push(from)}if(to){where.push("date(d.created_at)<=date(?)");bind.push(to)}if(status){if(status==='cancelled')where.push("d.status IN ('refused_fee_paid','refused_no_fee','canceled_before_arrival')");else{where.push('d.status=?');bind.push(status)}}if(q){where.push('(CAST(d.direct_code AS TEXT) LIKE ? OR d.recipient_name LIKE ? OR d.phone LIKE ? OR d.detailed_address LIKE ? OR d.order_notes LIKE ?)');bind.push(...Array(5).fill('%'+q+'%'))}
  const rows=await env.DB.prepare(select+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY d.id DESC LIMIT 3000').bind(...bind).all();return json({orders:rows.results||[]});
 }
 if(method==='POST'){
  const b=await body(request),storeId=n(b.store_id);if(!storeId)return json({error:'اختر المتجر'},400);const store=await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();if(!store)return json({error:'المتجر غير موجود'},400);
  const max=await env.DB.prepare('SELECT COALESCE(MAX(direct_code),999) n FROM direct_orders').first(),code=Math.max(1000,n(max?.n)+1);
  const pieces=Math.max(1,n(b.pieces,1));const r=await env.DB.prepare(`INSERT INTO direct_orders(direct_code,store_id,recipient_name,phone,area,detailed_address,pieces,weight,amount,order_notes,status,delivered_amount,delivery_fee,cash_collected,cost_of_goods,delivered_pieces,returned_pieces,settlement_note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(code,storeId,clean(b.recipient_name),clean(b.phone),clean(b.area),clean(b.detailed_address),pieces,Math.max(0,n(b.weight)),n(b.amount),clean(b.order_notes),'pending',0,n(b.delivery_fee,2),0,0,0,0,'',me.id).run();return json({order:await one(env,r.meta.last_row_id)});
 }
 if(method==='PUT'){
  const b=await body(request),id=n(b.id);if(!id)return json({error:'رقم الطلب مطلوب'},400);const old=await env.DB.prepare('SELECT * FROM direct_orders WHERE id=?').bind(id).first();if(!old)return json({error:'الطلب غير موجود'},404);
  const status=STATUSES.has(b.status)?b.status:old.status,pieces=Math.max(1,n(b.pieces,old.pieces));
  await env.DB.prepare(`UPDATE direct_orders SET store_id=?,recipient_name=?,phone=?,area=?,detailed_address=?,pieces=?,weight=?,amount=?,order_notes=?,status=?,delivered_amount=?,delivery_fee=?,cash_collected=?,cost_of_goods=?,delivered_pieces=?,returned_pieces=?,settlement_note=?,updated_at=datetime('now') WHERE id=?`).bind(n(b.store_id,old.store_id),clean(b.recipient_name??old.recipient_name),clean(b.phone??old.phone),clean(b.area??old.area),clean(b.detailed_address??old.detailed_address),pieces,Math.max(0,n(b.weight,old.weight)),n(b.amount,old.amount),clean(b.order_notes??old.order_notes),status,n(b.delivered_amount,old.delivered_amount),n(b.delivery_fee,old.delivery_fee),n(b.cash_collected,old.cash_collected),n(b.cost_of_goods,old.cost_of_goods),Math.max(0,n(b.delivered_pieces,old.delivered_pieces)),Math.max(0,n(b.returned_pieces,old.returned_pieces)),clean(b.settlement_note??old.settlement_note),id).run();return json({order:await one(env,id)});
 }
 if(method==='DELETE'){
  const id=n(url.searchParams.get('id'));if(!id)return json({error:'رقم الطلب مطلوب'},400);if(me.role!=='admin')return json({error:'الحذف للمدير فقط'},403);await env.DB.prepare('DELETE FROM direct_returns WHERE direct_order_id=?').bind(id).run();await env.DB.prepare('DELETE FROM direct_orders WHERE id=?').bind(id).run();return json({ok:true});
 }
 return json({error:'طلب غير معروف'},404);
}
