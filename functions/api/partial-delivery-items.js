// Shipped models/quantities for one order, priced with the approved per-piece costs.
import {json,auth,shippedItems,loadCostedModels} from './_partial-delivery.js';

export async function onRequest({request,env}){
 if(!await auth(request,env))return json({error:'غير مصرح'},401);
 const id=Number(new URL(request.url).searchParams.get('order_id')||0);
 if(!Number.isInteger(id)||id<1)return json({error:'رقم الطلب مطلوب'},400);
 const order=await env.DB.prepare('SELECT id,order_code,phone,amount,store_id,raw_text,order_notes,COALESCE(delivery_company_settled,0) delivery_company_settled FROM orders WHERE id=?').bind(id).first();
 if(!order)return json({error:'الطلب غير موجود'},404);
 const models=await loadCostedModels(env),items=await shippedItems(env,order,models);
 return json({order_id:Number(order.id),order_code:order.order_code,amount:Math.abs(Number(order.amount||0)),settled:Boolean(Number(order.delivery_company_settled)),
  order_text:String(order.order_notes||order.raw_text||'').slice(0,1500),
  items:items.map(i=>({...i,full_cost:Math.round(i.quantity*i.unit_cost*100)/100}))});
}
