const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
async function auth(request,env){
  const h=request.headers.get('authorization')||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token)return null;
  return await env.DB.prepare(`SELECT u.id,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}
export async function onRequestPost({request,env}){
  const user=await auth(request,env);if(!user)return json({error:'غير مصرح'},401);
  let b={};try{b=await request.json()}catch{return json({error:'بيانات غير صحيحة'},400)}
  const id=Number(b.order_id||0),text=String(b.text||'').trim();
  if(!id)return json({error:'رقم الطلب غير صحيح'},400);
  if(!text)return json({error:'نص الطلب لا يمكن أن يكون فارغًا'},400);
  const o=await env.DB.prepare('SELECT id,delivery_company_settled FROM orders WHERE id=?').bind(id).first();
  if(!o)return json({error:'الطلب غير موجود'},404);
  if(Number(o.delivery_company_settled||0)===1&&user.role!=='admin')return json({error:'الطلب مقفل ماليًا ويحتاج صلاحية مدير'},423);
  await env.DB.prepare("UPDATE orders SET order_notes=?, updated_at=datetime('now') WHERE id=?").bind(text,id).run();
  return json({ok:true,order_id:id,order_notes:text});
}
