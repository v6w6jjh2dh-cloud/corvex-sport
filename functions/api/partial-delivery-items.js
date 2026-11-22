import {classifyInventoryItems,loadInventoryModels} from './_inventory.js';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8'}});
export async function onRequest({request,env}){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(token).first();
 if(!user)return json({error:'غير مصرح'},401);
 const id=Number(new URL(request.url).searchParams.get('order_id')||0);
 if(!Number.isInteger(id)||id<1)return json({error:'رقم الطلب مطلوب'},400);
 const order=await env.DB.prepare('SELECT id,order_code,raw_text,order_notes FROM orders WHERE id=?').bind(id).first();
 if(!order)return json({error:'الطلب غير موجود'},404);
 const models=await loadInventoryModels(env),items=await classifyInventoryItems(env,order.raw_text||order.order_notes||'',models);
 return json({order_code:order.order_code,items:items.map(i=>({...i,model_name:models.find(m=>m.id===i.model_id)?.name||''}))});
}
