const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{'content-type':'application/json; charset=utf-8'}
});

async function user(request,env){
  const header=request.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return null;
  return await env.DB.prepare(`SELECT u.id,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`)
    .bind(token).first();
}

const normalizePhone=value=>String(value||'').replace(/\D/g,'').slice(-9);

async function recentOrders(env){
  const result=await env.DB.prepare(`SELECT id,order_code,phone,store_id,delivery_fee,created_at
    FROM orders
    WHERE created_at>=datetime('now','-24 hours')
    ORDER BY id DESC`).all();
  return result.results||[];
}

function sharedOrderIds(rows){
  const groups=new Map();
  for(const row of rows){
    const phone=normalizePhone(row.phone);
    if(!phone)continue;
    if(!groups.has(phone))groups.set(phone,[]);
    groups.get(phone).push(row);
  }
  const shared=new Set();
  for(const group of groups.values()){
    if(group.length>1&&new Set(group.map(row=>Number(row.store_id||0))).size>1){
      group.forEach(row=>shared.add(Number(row.id)));
    }
  }
  return shared;
}

export async function onRequest({request,env}){
  const actor=await user(request,env);
  if(!actor)return json({error:'غير مصرح'},401);
  const url=new URL(request.url);

  if(request.method==='GET'){
    const ids=[...new Set((url.searchParams.get('order_ids')||'').split(',').map(Number).filter(id=>id>0))].slice(0,500);
    const phone=normalizePhone(url.searchParams.get('phone'));
    const orderId=Number(url.searchParams.get('order_id')||0);
    const rows=await recentOrders(env);
    const shared=sharedOrderIds(rows);

    if(ids.length)return json({shared_order_ids:ids.filter(id=>shared.has(id))});
    if(orderId){
      const order=rows.find(row=>Number(row.id)===orderId);
      if(!order)return json({shared:false,orders:[]});
      const normalized=normalizePhone(order.phone);
      return json({shared:shared.has(orderId),orders:rows.filter(row=>normalizePhone(row.phone)===normalized)});
    }
    if(phone)return json({orders:rows.filter(row=>normalizePhone(row.phone)===phone)});
    return json({orders:[]});
  }

  if(request.method==='POST'){
    let body={};
    try{body=await request.json()}catch{}
    const phone=normalizePhone(body.phone);
    const currentId=Number(body.order_id||0);
    if(!phone)return json({error:'رقم الهاتف مطلوب'},400);

    const rows=await recentOrders(env);
    const same=rows.filter(row=>normalizePhone(row.phone)===phone);
    const stores=new Set(same.map(row=>Number(row.store_id||0)));
    if(same.length<2||stores.size<2)return json({ok:true,shared:false});

    const statements=same.map(row=>env.DB.prepare('UPDATE orders SET delivery_fee=1 WHERE id=?').bind(row.id));
    for(let index=0;index<statements.length;index+=40){
      await env.DB.batch(statements.slice(index,index+40));
    }
    return json({ok:true,shared:true,total:same.length,order_id:currentId});
  }

  return json({error:'طريقة غير مدعومة'},405);
}
