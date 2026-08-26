const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

async function auth(request,env){
  const h=request.headers.get('authorization')||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token)return null;
  return await env.DB.prepare(`SELECT s.token,u.id,u.username,u.display_name,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

const STATUS_LABELS={
  pending:'قيد التوصيل',delivered:'تم التسليم',delivered_adjusted:'تم التسليم وتعديل قيمة',partial:'تسليم جزئي',
  refused_fee_paid:'رفض ودفع أجور',refused_no_fee:'رفض وعدم دفع أجور',canceled_before_arrival:'ملغي قبل الوصول'
};

export async function onRequestGet({request,env}){
  const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS deleted_orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,original_order_id INTEGER NOT NULL,order_code INTEGER,order_json TEXT NOT NULL,
    deleted_by INTEGER,deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  const active=`NOT EXISTS (SELECT 1 FROM deleted_orders d WHERE d.original_order_id=o.id)`;
  const stats=await env.DB.prepare(`SELECT
    COUNT(*) total,
    SUM(CASE WHEN o.printed=0 THEN 1 ELSE 0 END) unprinted,
    SUM(CASE WHEN o.printed=1 THEN 1 ELSE 0 END) printed,
    SUM(CASE WHEN date(o.created_at,'+3 hours')=date('now','+3 hours') THEN 1 ELSE 0 END) today,
    COUNT(DISTINCT CASE WHEN date(o.first_printed_at,'+3 hours')=date('now','+3 hours') THEN o.id END) outgoing_today,
    SUM(CASE WHEN o.delivery_status='delivered' THEN 1 ELSE 0 END) delivered,
    SUM(CASE WHEN o.delivery_status='delivered_adjusted' THEN 1 ELSE 0 END) delivered_adjusted,
    SUM(CASE WHEN o.delivery_status='partial' THEN 1 ELSE 0 END) partial,
    SUM(CASE WHEN o.delivery_status='refused_fee_paid' THEN 1 ELSE 0 END) refused_fee_paid,
    SUM(CASE WHEN o.delivery_status='refused_no_fee' THEN 1 ELSE 0 END) refused_no_fee,
    SUM(CASE WHEN o.delivery_status='canceled_before_arrival' THEN 1 ELSE 0 END) canceled_before_arrival,
    SUM(CASE WHEN o.delivery_status='pending' THEN 1 ELSE 0 END) pending,
    COALESCE(SUM(o.cash_collected),0) cash_collected,
    COALESCE(SUM(o.cost_of_goods),0) cost_of_goods,
    COALESCE(SUM(o.cash_collected-o.cost_of_goods),0) net_profit,
    COALESCE(SUM(o.delivered_pieces),0) delivered_pieces,
    COALESCE(SUM(o.returned_pieces),0) returned_pieces
    FROM orders o WHERE ${active}`).first();

  const batchCount=await env.DB.prepare('SELECT COUNT(*) c FROM print_batches').first();
  const storeRows=await env.DB.prepare(`SELECT s.id store_id,s.name store_name,COUNT(DISTINCT o.id) outgoing_count
    FROM stores s
    LEFT JOIN orders o ON o.store_id=s.id
      AND date(o.first_printed_at,'+3 hours')=date('now','+3 hours')
      AND NOT EXISTS (SELECT 1 FROM deleted_orders d WHERE d.original_order_id=o.id)
    WHERE s.is_active=1
    GROUP BY s.id,s.name
    HAVING COUNT(DISTINCT o.id)>0
    ORDER BY outgoing_count DESC,s.name ASC`).all();

  return json({...stats,batches:Number(batchCount?.c||0),outgoing_by_store:storeRows.results||[],status_labels:STATUS_LABELS});
}
