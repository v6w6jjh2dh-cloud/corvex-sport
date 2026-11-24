// Read-only: does this customer (same store) have two or more consecutive proven
// returns with no successful delivery in between? Used to warn while entering a new order.
//
// Proven return  = refused / returned / cancelled-before-arrival settled by a closed
//                  delivery-company statement, or "returned" closed by a Cargo Box
//                  returns statement (same rule as the shipment-day profit report).
// Delivery       = delivered / partial delivery (resets the streak).
// Anything else (pending, on the way, unproven returns) is neither and is skipped.
import {json,auth,normalizePhone} from './_partial-delivery.js';

const RETURN_STATUSES=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival','returned']);
const DELIVERED=new Set(['delivered','partial','delivered_adjusted']);
const STATUS_LABEL={refused_fee_paid:'رفض مع دفع أجور',refused_no_fee:'رفض بدون أجور',canceled_before_arrival:'ملغي قبل الوصول',returned:'مرتجع'};

export async function classifyHistory(env,phone,storeId){
 const local=phone.replace(/^0/,'');
 const rows=(await env.DB.prepare(`SELECT o.id,o.order_code,o.phone,o.store_id,o.delivery_status,COALESCE(o.delivery_company_settled,0) settled,o.settled_at,
   o.created_at,o.first_printed_at,date(o.created_at,'+3 hours') order_date,date(o.first_printed_at,'+3 hours') print_date,s.name store_name
   FROM orders o LEFT JOIN stores s ON s.id=o.store_id
   WHERE o.store_id=? AND replace(replace(replace(replace(COALESCE(o.phone,''),' ',''),'-',''),'+',''),'.','') LIKE ?
   ORDER BY COALESCE(o.first_printed_at,o.created_at),o.id`).bind(storeId,'%'+local).all()).results||[];
 const orders=rows.filter(o=>normalizePhone(o.phone)===phone);
 const cargo=new Map();
 if(orders.length){
  try{
   const ids=new Set(orders.map(o=>Number(o.id)));
   const res=(await env.DB.prepare("SELECT CAST(json_extract(c.value,'$.order_id') AS INTEGER) order_id,r.id report_id,date(r.created_at,'+3 hours') closed_on FROM cargo_return_close_reports r, json_each(r.details_json,'$.closed') c").all()).results||[];
   for(const r of res)if(ids.has(Number(r.order_id)))cargo.set(Number(r.order_id),r);
  }catch{}
 }
 return orders.map(o=>{
  const status=o.delivery_status||'pending',settled=Number(o.settled)===1,c=cargo.get(Number(o.id));
  let outcome='neutral',returnDate=null,source=null;
  if(DELIVERED.has(status))outcome='delivered';
  else if(RETURN_STATUSES.has(status)&&settled){outcome='return';returnDate=o.settled_at?String(o.settled_at).slice(0,10):null;source='كشف شركة التوصيل'}
  else if(status==='returned'&&c){outcome='return';returnDate=c.closed_on;source='كشف المرتجعات #'+c.report_id}
  return {id:Number(o.id),order_code:o.order_code,status,status_label:STATUS_LABEL[status]||status,outcome,order_date:o.order_date,print_date:o.print_date,return_date:returnDate,return_source:source,store_name:o.store_name||''};
 });
}

export function consecutiveReturns(history){
 // Walk back from the most recent order; skip neutral ones; stop at a delivery.
 const streak=[];
 for(let i=history.length-1;i>=0;i--){
  const h=history[i];
  if(h.outcome==='delivered')break;
  if(h.outcome==='return')streak.push(h);
 }
 return streak;
}

export async function onRequestGet({request,env}){
 if(!await auth(request,env))return json({error:'غير مصرح'},401);
 const url=new URL(request.url);
 const phone=normalizePhone(url.searchParams.get('phone')||''),storeId=Number(url.searchParams.get('store_id')||0);
 if(!/^07\d{8}$/.test(phone)||!storeId)return json({warning:false,phone,reason:'رقم أو متجر غير مكتمل'});
 const history=await classifyHistory(env,phone,storeId);
 const streak=consecutiveReturns(history);
 const store=(await env.DB.prepare('SELECT name FROM stores WHERE id=?').bind(storeId).first())?.name||'';
 return json({warning:streak.length>=2,count:streak.length,phone,store_id:storeId,store_name:store,
  orders:streak.map(({outcome,...x})=>x),history_size:history.length});
}
