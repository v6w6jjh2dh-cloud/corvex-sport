// Closes a delivery-company statement. Every line is re-validated on the server:
// a line that is not safely tied to exactly one open order is held (not applied)
// and returned with its reason; nothing is guessed.
import {dominantSettlementDate,ensureSettlementDateColumn} from '../_settlement-date.js';
import {syncOrderInventory} from '../_inventory.js';
import {ensureStatusHistory,statusSource} from '../_status-history.js';
import {json,auth,normalizePhone,normalizeDigits,shipmentDateFit,loadCostedModels,shippedItems,pricePartialDelivery,RETURN_STATUSES,RECONCILE_CUTOFF,round2,ensureSettlementLineShipmentDate} from '../_partial-delivery.js';

const VALID_STATUSES=new Set(['pending','delivered','delivered_adjusted','partial','refused_fee_paid','refused_no_fee','canceled_before_arrival']);
const num=v=>v===null||v===undefined||v===''?NaN:Number(v);

async function ensureColumns(env){
 const info=await env.DB.prepare('PRAGMA table_info(orders)').all(),cols=new Set((info.results||[]).map(r=>r.name));
 for(const [name,type] of [['partial_cost_reviewed',"INTEGER NOT NULL DEFAULT 0"],['partial_received_items',"TEXT NOT NULL DEFAULT ''"],['profit_reviewed_settlement_id','INTEGER'],['profit_reviewed_at','TEXT'],['delivered_pieces',"INTEGER NOT NULL DEFAULT 0"],['settlement_note',"TEXT NOT NULL DEFAULT ''"],['cost_of_goods',"REAL NOT NULL DEFAULT 0"]]){
  if(cols.has(name))continue;
  try{await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${type}`).run()}catch(e){if(!/duplicate column/i.test(String(e?.message||e)))throw e}
 }
}

export async function onRequestPost({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const b=await request.json().catch(()=>({})),storeId=Number(b.store_id||0),sourceName=String(b.source_name||'').slice(0,200),rows=Array.isArray(b.rows)?b.rows.slice(0,3000):[];
 if(!storeId||!rows.length)return json({error:'لا توجد نتائج للاعتماد'},400);
 await ensureSettlementDateColumn(env);await ensureColumns(env);await ensureSettlementLineShipmentDate(env);await ensureStatusHistory(env);
 const models=await loadCostedModels(env);

 const accepted=[],held=[],used=new Set();
 const hold=(r,reason,order=null)=>held.push({row_index:Number(r.row_index||0)||null,phone:String(r.phone||''),order_id:order?Number(order.id):Number(r.order_id||0)||null,order_code:order?.order_code??null,reason});
 for(const r of rows){
  const id=Number(r.order_id||0);
  if(!id){hold(r,String(r.hold_reason||'لم يتم تحديد الطلب الصحيح لهذا السطر'));continue}
  if(used.has(id)){hold(r,'نفس الطلب مختار لأكثر من سطر في الكشف');continue}
  const o=await env.DB.prepare(`SELECT o.*,
    CASE WHEN o.first_printed_at IS NULL THEN NULL WHEN strftime('%w',o.first_printed_at,'+3 hours')='4' THEN date(o.first_printed_at,'+3 hours','+2 days') ELSE date(o.first_printed_at,'+3 hours','+1 day') END delivery_date,
    CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE date(o.first_printed_at,'+3 hours') END first_print_date,
    date(o.created_at,'+3 hours') created_date,
    date(COALESCE(o.first_printed_at,o.created_at),'+3 hours') ship_day
    FROM orders o WHERE o.id=?`).bind(id).first();
  if(!o){hold(r,'الطلب غير موجود');continue}
  if(Number(o.delivery_company_settled||0)){hold(r,'الطلب مسوّى سابقًا في كشف آخر — لا يُحسب مرتين',o);continue}
  if(String(o.ship_day||'')<RECONCILE_CUTOFF){hold(r,'طلب قديم من كشوف سابقة — لا يتم تعديله',o);continue}

  const manual=String(r.selection||'')==='manual';
  const phone=normalizePhone(r.phone),orderPhone=normalizePhone(o.phone);
  const textDigits=normalizeDigits(`${o.raw_text||''} ${o.order_notes||''}`).replace(/\D/g,' ');
  const phoneInText=phone&&new RegExp(`(?:^|\\D)(?:0|962|00962)?${phone.replace(/^0/,'')}(?:\\D|$)`).test(textDigits);
  if(phone&&phone!==orderPhone&&!(manual&&phoneInText)){hold(r,'رقم هاتف الكشف لا يطابق رقم الطلب',o);continue}
  if(Number(o.store_id)!==storeId&&!manual){hold(r,'الطلب تابع لمتجر آخر ويحتاج اختيارًا يدويًا',o);continue}
  const fit=shipmentDateFit(o,r.shipment_date);
  if(fit.known&&fit.ok===false&&!(manual&&r.confirm_date_outside===true)){hold(r,'الطلب خارج تاريخ خروج الشحنة (شحنة أقدم/أحدث لنفس العميل)',o);continue}

  let status=String(r.status||'');
  if(!VALID_STATUSES.has(status)){hold(r,'لم تُحدد الحالة المعتمدة',o);continue}
  if(status==='delivered_adjusted')status='partial';
  const amount=Math.max(0,Number(r.amount||0)),original=Math.abs(Number(o.amount||0));
  const isReturn=RETURN_STATUSES.has(status),isDelivered=status==='delivered'||status==='partial';
  if(!isReturn&&amount>original+.001&&r.confirm_amount_higher!==true){hold(r,`قيمة الكشف (${amount}) أكبر من قيمة الطلب #${o.order_code} (${original}) ولم يتم تأكيدها`,o);continue}
  if(status==='delivered'&&amount<original-.001){
   if(Array.isArray(r.delivered_items)&&r.delivered_items.some(x=>Number(x.returned||0)>0))status='partial';
   else if(r.confirm_discount!==true){hold(r,`المبلغ المحصل (${amount}) أقل من قيمة الطلب #${o.order_code} (${original}) — حدد القطع المستلمة والمرتجعة أو أكد أن كل القطع سُلّمت بخصم`,o);continue}
  }

  let partial=null;
  if(status==='partial'){
   const items=await shippedItems(env,o,models);
   partial=pricePartialDelivery(items,r.delivered_items);
   if(!partial.ok){hold(r,`الطلب #${o.order_code}: ${partial.reason}`,o);continue}
  }
  // A refusal's result is the statement's real net (charge − real fee of the area, or −fee when
  // unpaid). Without the statement's net or its fee there is nothing real to record: hold it
  // rather than assume a fixed 2 JOD.
  if((status==='refused_fee_paid'||status==='refused_no_fee')&&!(r.has_net&&Number.isFinite(num(r.net_amount)))&&!(num(r.delivery_fee)>0)){hold(r,`الطلب #${o.order_code}: أجور الرفض الفعلية غير موجودة في الكشف — أدخل الأجور أو الصافي كما في الكشف`,o);continue}
  const fee=Number.isFinite(num(r.delivery_fee))?Math.max(0,num(r.delivery_fee)):Math.max(0,Number(o.delivery_fee??2));
  // Keep the actual cash reported by the delivery company; never replace it with the order price.
  const cash=r.has_net&&Number.isFinite(num(r.net_amount))?num(r.net_amount):(isDelivered?Math.max(0,amount-fee):status==='refused_fee_paid'?round2(amount-fee):(status==='refused_no_fee'?-fee:0));
  used.add(id);
  accepted.push({o,r,status,amount,fee,cash,partial,type:String(r.match_type||'matched'),manual});
 }

 if(!accepted.length)return json({error:'لا توجد أسطر آمنة للاعتماد — راجع الأسباب لكل سطر',held},400);

 let delivered=0,refused=0,collected=0,fees=0,net=0;
 for(const x of accepted){
  const isDel=['delivered','partial'].includes(x.status),isRef=RETURN_STATUSES.has(x.status);
  if(isDel)delivered++;else if(isRef)refused++;
  collected+=isDel?x.amount:0;fees+=(isDel||isRef)?x.fee:0;net+=x.cash;
 }
 const code='DC-'+Date.now();
 const statementDate=dominantSettlementDate(accepted.map(x=>({shipment_date:x.r.shipment_date||x.o.delivery_date})));
 const ins=await env.DB.prepare(`INSERT INTO delivery_company_settlements(settlement_code,store_id,source_name,matched_count,unmatched_count,duplicate_count,delivered_count,refused_count,pending_count,collected_amount,delivery_fees,net_due,created_by,statement_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(code,storeId,sourceName,accepted.length,held.length,0,delivered,refused,accepted.length-delivered-refused,round2(collected),round2(fees),round2(net),me.id,statementDate||null).run();
 const sid=ins.meta.last_row_id;

 const statements=[];
 for(const x of accepted){
  const p=x.partial;
  const cleanNote=String(x.o.settlement_note||'').replace(/\[MANUAL_COST:[^\]]+\]\s*/g,'').trim();
  const userNote=String(x.r.note||'').trim();
  const note=p?`[MANUAL_COST:${p.cost.toFixed(2)}] ${userNote||cleanNote}`.trim():(userNote||String(x.o.settlement_note||''));
  statements.push(env.DB.prepare(`UPDATE orders SET delivery_status=?,delivered_amount=?,cash_collected=?,delivery_fee=?,
    cost_of_goods=CASE WHEN ? THEN ? ELSE cost_of_goods END,
    partial_cost_reviewed=CASE WHEN ? THEN 1 ELSE partial_cost_reviewed END,
    partial_received_items=CASE WHEN ? THEN ? ELSE partial_received_items END,
    delivered_pieces=CASE WHEN ? THEN ? ELSE delivered_pieces END,
    profit_reviewed_settlement_id=CASE WHEN ? THEN ? ELSE profit_reviewed_settlement_id END,
    profit_reviewed_at=CASE WHEN ? THEN datetime('now') ELSE profit_reviewed_at END,
    settlement_note=?,
    settled_at=CASE WHEN ?='pending' THEN NULL ELSE datetime('now') END,
    delivery_company_settled=CASE WHEN ?='pending' THEN 0 ELSE 1 END,
    delivery_company_settlement_id=?,status_source=?,status_by=?,updated_at=datetime('now')
    WHERE id=? AND COALESCE(delivery_company_settled,0)=0`)
   .bind(x.status,x.amount,x.cash,x.fee,p?1:0,p?p.cost:0,p?1:0,p?1:0,p?JSON.stringify(p.items):'',p?1:0,p?p.received:0,p?1:0,p?sid:null,p?1:0,note,x.status,x.status,sid,statusSource('delivery_statement',code),me.id,x.o.id));
  statements.push(env.DB.prepare(`INSERT INTO delivery_company_settlement_orders(settlement_id,order_id,phone,imported_status,applied_status,imported_amount,note,match_type,shipment_date,shipment_code) VALUES(?,?,?,?,?,?,?,?,?,?)`)
   .bind(sid,x.o.id,normalizePhone(x.r.phone||x.o.phone),String(x.r.raw_status||x.r.status||''),x.status,x.amount,String(x.r.note||''),x.manual?`manual:${x.type}`:x.type,/^\d{4}-\d{2}-\d{2}$/.test(String(x.r.shipment_date||'').slice(0,10))?String(x.r.shipment_date).slice(0,10):null,String(x.r.display_code||x.r.shipment_code||'').trim().slice(0,60)||null));
 }
 for(let i=0;i<statements.length;i+=40)await env.DB.batch(statements.slice(i,i+40));
 for(const x of accepted){const after=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(x.o.id).first();await syncOrderInventory(env,x.o,after,me.id)}

 return json({settlement:{id:sid,settlement_code:code,statement_date:statementDate||null,matched_count:accepted.length,unmatched_count:held.length,duplicate_count:0,delivered_count:delivered,refused_count:refused,collected_amount:round2(collected),delivery_fees:round2(fees),net_due:round2(net)},
  partial_orders:accepted.filter(x=>x.partial).map(x=>({order_id:Number(x.o.id),order_code:x.o.order_code,cash:x.cash,amount:x.amount,fee:x.fee,cost:x.partial.cost,profit:round2(x.amount-x.partial.cost-x.fee),items:x.partial.items})),
  held,review_count:held.length});
}
