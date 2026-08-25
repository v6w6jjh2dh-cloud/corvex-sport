const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

async function auth(request,env){
  const h=request.headers.get('authorization')||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token)return null;
  return await env.DB.prepare(`SELECT u.id,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

export async function onRequest(context){
  const {request,env,next}=context;
  const method=request.method.toUpperCase();
  if(!['PUT','PATCH','DELETE'].includes(method))return next();

  const url=new URL(request.url);
  const m=url.pathname.match(/^\/api\/orders\/(\d+)(?:\/outcome)?\/?$/);
  if(!m)return next();

  const user=await auth(request,env);
  if(!user)return json({error:'غير مصرح'},401);

  const order=await env.DB.prepare('SELECT id,order_code,delivery_company_settled FROM orders WHERE id=?').bind(Number(m[1])).first();
  if(order&&Number(order.delivery_company_settled||0)===1&&user.role!=='admin'){
    return json({error:'هذا الطلب مقفل ماليًا بعد اعتماد تسوية شركة التوصيل. التعديل يحتاج صلاحية مدير.'},423);
  }

  return next();
}
