const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

async function auth(request,env){
  const h=request.headers.get('authorization')||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token)return null;
  return await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

export async function onRequestGet({request,env}){
  const user=await auth(request,env);
  if(!user)return json({error:'غير مصرح'},401);
  try{
    const rows=(await env.DB.prepare(`
      SELECT
        o.id,o.order_code,o.recipient_name,o.phone,o.area,o.detailed_address,
        o.amount,o.delivery_status,o.first_printed_at,o.created_at,
        s.name AS store_name,
        CAST(julianday('now')-julianday(o.first_printed_at) AS INTEGER) AS days_waiting
      FROM orders o
      LEFT JOIN stores s ON s.id=o.store_id
      WHERE COALESCE(NULLIF(TRIM(o.delivery_status),''),'pending')='pending'
        AND o.printed=1
        AND o.first_printed_at IS NOT NULL
        AND date(o.first_printed_at,'+3 hours')>=date('2026-09-08')
        AND julianday('now')-julianday(o.first_printed_at)>=4
        AND NOT EXISTS (SELECT 1 FROM deleted_orders d WHERE d.original_order_id=o.id)
      ORDER BY o.first_printed_at ASC,o.id ASC
      LIMIT 500
    `).all()).results||[];
    return json({orders:rows,count:rows.length,monitoring_from:'2026-09-08',minimum_days:4});
  }catch(error){
    return json({error:'تعذر تحميل طلبات التنبيه',details:String(error?.message||error)},500);
  }
}
