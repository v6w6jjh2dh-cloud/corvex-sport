// Profit of whole delivery-company statements by STATEMENT DATE (upper section of «الأرباح
// اليومية»). Every order settled inside the statements of that date counts, whatever day it left
// the warehouse. Read-only.
//
// What each statement line contributes (so an order is never counted twice across statements):
//  - a correction settlement (DCX-…): only the change it made (to-values − from-values);
//  - an original statement whose order is still linked to it: the order's final values;
//  - an original statement whose order was later corrected: the values as they were in it
//    (from the correction record);
//  - an order re-settled elsewhere without a correction: listed as superseded, not counted.
// Summed over all statements, each order therefore equals its final result.
//
// Goods cost comes from the shipment-day profit engine (profit-shipping-cohorts.js, called as
// is, not modified) so both sections price an order identically. Fees and the refusal rule are
// the statement's real figures: fee = gross − net cash (refusal charge − real fee, or −fee).
import {json,auth,round2,refusalCash,RETURN_STATUSES} from './_partial-delivery.js';
import {onRequest as cohortEngine} from './profit-shipping-cohorts.js';

const DELIVERED=new Set(['delivered','partial','delivered_adjusted']);
const day=/^\d{4}-\d{2}-\d{2}$/;
const safe=async(fn,fallback)=>{try{return await fn()}catch{return fallback}};

export async function onRequestGet({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const url=new URL(request.url),date=String(url.searchParams.get('date')||''),store=Number(url.searchParams.get('store_id')||0);
 if(!day.test(date)||!Number.isSafeInteger(store)||store<0)return json({error:'تاريخ غير صالح'},400);

 const settlements=(await env.DB.prepare(`SELECT s.id,s.settlement_code,s.source_name,s.store_id,st.name store_name,s.net_due,s.statement_date,
   date(s.created_at,'+3 hours') saved_day,datetime(s.created_at,'+3 hours') saved_at
   FROM delivery_company_settlements s LEFT JOIN stores st ON st.id=s.store_id
   WHERE COALESCE(s.statement_date,date(s.created_at,'+3 hours'))=? ${store?'AND s.store_id=?':''} ORDER BY s.id`).bind(...(store?[date,store]:[date])).all()).results||[];
 // ads of this date, looked up exactly like the shipment-day section stores them (store 0 = all stores)
 const adSpend=round2(await safe(async()=>(await env.DB.prepare('SELECT COALESCE(SUM(amount),0) amount FROM shipping_cohort_ad_spend WHERE date=? AND store_id=?').bind(date,store).first())?.amount||0,0));
 if(!settlements.length)return json({engine:'statement-v1',date,store_id:store,statements:[],totals:emptyTotals(),complete:true,ad_spend:adSpend});
 const ids=settlements.map(s=>Number(s.id)),marks=ids.map(()=>'?').join(',');

 const lineRows=(await env.DB.prepare(`SELECT so.rowid rid,so.settlement_id,so.order_id,so.applied_status,so.imported_status,so.imported_amount,so.match_type,
   o.order_code,o.recipient_name,o.delivery_status,o.delivered_amount,o.cash_collected,o.delivery_fee,o.delivery_company_settlement_id cur_sid,
   date(COALESCE(o.first_printed_at,o.created_at),'+3 hours') ship_day
   FROM delivery_company_settlement_orders so LEFT JOIN orders o ON o.id=so.order_id
   WHERE so.settlement_id IN (${marks}) ORDER BY so.rowid`).bind(...ids).all()).results||[];
 // one line per (statement, order)
 const lines=[...new Map(lineRows.filter(l=>l.order_id).map(l=>[l.settlement_id+':'+l.order_id,l])).values()];

 const corrections=await safe(async()=>(await env.DB.prepare(`SELECT * FROM delivery_settlement_corrections WHERE from_settlement_id IN (${marks}) OR to_settlement_id IN (${marks})`).bind(...ids,...ids).all()).results||[],[]);
 const corrTo=new Map(corrections.filter(c=>c.to_settlement_id).map(c=>[c.to_settlement_id+':'+c.order_id,c]));
 const corrFrom=new Map(corrections.map(c=>[c.from_settlement_id+':'+c.order_id,c]));
 // gross of the line a correction started from (charge / delivered value in that statement)
 const fromGross=new Map();
 for(const c of corrections){
  const g=await safe(async()=>(await env.DB.prepare('SELECT imported_amount FROM delivery_company_settlement_orders WHERE settlement_id=? AND order_id=? ORDER BY rowid DESC').bind(c.from_settlement_id,c.order_id).first())?.imported_amount,null);
  fromGross.set(c.id,g==null?null:Number(g));
 }

 // goods cost per order from the shipment-day engine (unchanged), one call per shipment day
 const auth_=request.headers.get('authorization')||'';
 const costByOrder=new Map();
 for(const d of [...new Set(lines.map(l=>l.ship_day).filter(x=>day.test(String(x||''))))]){
  const res=await safe(()=>cohortEngine({request:new Request(`${url.origin}/api/profit-shipping-cohorts?date=${d}&store_id=0`,{headers:{authorization:auth_}}),env}),null);
  const data=res&&res.ok?await safe(()=>res.json(),null):null;
  for(const o of data?.orders||[])costByOrder.set(Number(o.id),o);
 }
 const costOf=(orderId,status)=>{
  if(!DELIVERED.has(status))return {cost:0,known:true};
  const o=costByOrder.get(Number(orderId));
  if(!o)return {cost:null,known:false,reason:'تعذر حساب الكوست (يوم الشحن خارج محرك الأرباح)'};
  if(o.result==='delivered'&&o.calculated_cost!=null&&!o.cost_needs_review)return {cost:Number(o.calculated_cost),known:true};
  if(o.result==='delivered')return {cost:null,known:false,reason:o.missing_reason||'كوست ناقص'};
  const items=(o.items||[]).map(i=>i.total_cost);
  return items.length&&items.every(x=>x!=null)?{cost:round2(items.reduce((a,b)=>a+Number(b),0)),known:true}:{cost:null,known:false,reason:'كوست الحالة السابقة غير معروف'};
 };
 const snap=(status,gross,cash,orderId)=>{const c=costOf(orderId,status);return {status,gross:Number(gross||0),cash:round2(cash),cost:c.cost,known:c.known,reason:c.reason||''}};

 const out=[];
 for(const s of settlements){
  const sid=Number(s.id),rows=[];
  for(const l of lines.filter(x=>Number(x.settlement_id)===sid)){
   const key=sid+':'+l.order_id;let kind,a,b=null;
   const cTo=corrTo.get(key),cFrom=corrFrom.get(key);
   if(cTo){ // correction statement: only the change
    kind='correction';
    b=snap(cTo.from_status,fromGross.get(cTo.id)??(RETURN_STATUSES.has(cTo.from_status)?0:null),cTo.from_cash,l.order_id);
    a=snap(cTo.to_status,cTo.line_amount,cTo.final_cash,l.order_id);
   }else if(Number(l.cur_sid)===sid){ // order's final result lives here
    kind='final';
    const st=String(l.delivery_status||'');
    a=snap(st,l.delivered_amount,RETURN_STATUSES.has(st)?refusalCash(l,st).cash:Number(l.cash_collected||0),l.order_id);
   }else if(cFrom){ // later corrected: as it was in this statement
    kind='as_settled';
    a=snap(cFrom.from_status,fromGross.get(cFrom.id)??(RETURN_STATUSES.has(cFrom.from_status)?0:Number(l.imported_amount||0)),cFrom.from_cash,l.order_id);
   }else{rows.push({order_id:l.order_id,order_code:l.order_code,kind:'superseded',status:l.applied_status,note:'الطلب سُوّي لاحقًا في كشف آخر — لا يُحتسب هنا'});continue}
   const d=(k)=>b?round2((a[k]??0)-(b[k]??0)):a[k];
   const sales=round2((DELIVERED.has(a.status)?a.gross:0)-(b&&DELIVERED.has(b.status)?b.gross:0));
   const known=a.known&&(!b||b.known)&&a.gross!=null&&(!b||b.gross!=null);
   const cash=d('cash'),gross=b?round2(a.gross-(b.gross??0)):a.gross;
   const returns=round2((RETURN_STATUSES.has(a.status)?a.cash:0)-(b&&RETURN_STATUSES.has(b.status)?b.cash:0));
   rows.push({order_id:l.order_id,order_code:l.order_code,recipient_name:l.recipient_name,ship_day:l.ship_day,kind,status:a.status,from_status:b?.status||null,
    sales,cash,fees:round2(gross-cash),cost:known?round2((a.cost||0)-(b?.cost||0)):null,returns,cost_known:known,reason:known?'':(a.reason||b?.reason||'كوست غير معروف'),
    profit:known?round2(cash-((a.cost||0)-(b?.cost||0))):null});
  }
  const counted=rows.filter(r=>r.kind!=='superseded');
  const t=sum(counted);
  out.push({id:sid,settlement_code:s.settlement_code,source_name:s.source_name,store_name:s.store_name,statement_date:s.statement_date||s.saved_day,saved_at:s.saved_at,
   is_correction:String(s.settlement_code||'').startsWith('DCX-'),stored_net_due:round2(s.net_due),net_matches_statement:Math.abs(round2(s.net_due)-t.cash)<.01,
   totals:t,orders:rows});
 }
 const totals=sum(out.flatMap(s=>s.orders.filter(r=>r.kind!=='superseded')));
 return json({engine:'statement-v1',date,store_id:store,statements:out,totals,complete:totals.unknown_cost===0,ad_spend:adSpend});
}

function emptyTotals(){return {orders:0,delivered:0,returned:0,sales:0,cash:0,costs:0,fees:0,returns:0,profit:0,known_profit:0,unknown_cost:0}}
function sum(rows){
 const t=emptyTotals();
 for(const r of rows){
  t.orders++;if(DELIVERED.has(r.status))t.delivered++;else if(RETURN_STATUSES.has(r.status))t.returned++;
  t.sales+=r.sales;t.cash+=r.cash;t.fees+=r.fees;t.returns+=r.returns;
  if(r.cost_known){t.costs+=r.cost;t.known_profit+=r.profit}else t.unknown_cost++;
 }
 for(const k of ['sales','cash','costs','fees','returns','known_profit'])t[k]=round2(t[k]);
 t.profit=t.unknown_cost?null:round2(t.cash-t.costs);
 return t;
}
