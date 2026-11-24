// Correction of an earlier delivery-company settlement (admin only), e.g. a shipment settled as
// "refused" that the courier delivered later (#10349).
//  - the original settlement and its line are kept untouched (history);
//  - a correction settlement (DCX-…) carries only the cash DIFFERENCE, so the sum over all
//    settlements of the order equals its final cash and nothing is counted twice;
//  - the order gets the final result; the profit report keeps using the original shipment day
//    (first print) and computes the goods cost once from the order's items;
//  - inventory is not touched (deducted once at first print); if the goods are recorded as
//    received in the warehouse, or were already added back to stock, the correction stops;
//  - identity: the delivery company's shipment code must match (stored code and/or the code
//    the manager verified in both statements);
//  - one correction per (order, settlement it corrects): running it again is refused; a later
//    documented correction corrects the correction settlement.
// dry_run:true returns the computation without writing anything.
import {json,normalizePhone,normalizeDigits,round2,refusalCash,RETURN_STATUSES,ensureSettlementLineShipmentDate} from '../_partial-delivery.js';
import {ensureSettlementDateColumn,previousAccountingDate} from '../_settlement-date.js';
import {loadClosedIndex} from '../_cargo-closed.js';
import {ensureStatusHistory,statusSource,historyEntry} from '../_status-history.js';

const STATUSES=new Set(['delivered','refused_fee_paid','refused_no_fee','canceled_before_arrival']);
const AR={delivered:'تم التسليم',partial:'تسليم جزئي',refused_fee_paid:'رفض ودفع أجور',refused_no_fee:'رفض وعدم دفع أجور',canceled_before_arrival:'ملغي قبل الوصول',pending:'قيد التوصيل',returned:'مرتجع'};
const num=v=>v===null||v===undefined||v===''?NaN:Number(v);
const normShip=v=>normalizeDigits(String(v||'')).replace(/\s+/g,'').toUpperCase();
const CONFIRM_PHRASE='تصحيح التسوية';

async function ensureCorrections(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_settlement_corrections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,correction_key TEXT NOT NULL UNIQUE,order_id INTEGER NOT NULL,order_code INTEGER,
  from_settlement_id INTEGER NOT NULL,to_settlement_id INTEGER,from_status TEXT,to_status TEXT,
  from_cash REAL,line_amount REAL,line_fee REAL,line_net REAL,previous_charge TEXT,final_cash REAL,cash_difference REAL,
  shipment_code TEXT,shipment_date TEXT,identity_source TEXT,reason TEXT NOT NULL,created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(order_id,from_settlement_id))`).run();
}

export async function onRequestPost({request,env}){
 const header=request.headers.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';
 const me=token&&await env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(token).first();
 if(!me)return json({error:'غير مصرح'},401);
 if(me.role!=='admin')return json({error:'تصحيح التسويات السابقة للمدير فقط'},403);
 const b=await request.json().catch(()=>({}));
 const orderId=Number(b.order_id||0),expected=Number(b.expected_settlement_id||0),line=b.line||{},dry=b.dry_run===true;
 if(!orderId||!expected)return json({error:'بيانات التصحيح ناقصة'},400);
 await ensureSettlementDateColumn(env);await ensureSettlementLineShipmentDate(env);await ensureStatusHistory(env);await ensureCorrections(env);

 const o=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
 if(!o)return json({error:'الطلب غير موجود'},404);
 if(Number(o.delivery_company_settled||0)!==1)return json({error:'الطلب غير مسوّى — يُعتمد من الكشف بشكل عادي ولا يحتاج تصحيحًا'},409);
 if(Number(o.delivery_company_settlement_id||0)!==expected)return json({error:'تسوية الطلب تغيّرت منذ فتح الشاشة (ربما صُحّح سابقًا) — أعد مطابقة الكشف'},409);
 const done=await env.DB.prepare('SELECT id,created_at FROM delivery_settlement_corrections WHERE order_id=? AND from_settlement_id=?').bind(orderId,expected).first();
 if(done)return json({error:'هذا التصحيح نُفّذ سابقًا لهذه التسوية — لا يُنفّذ مرتين'},409);

 // goods physically back in the warehouse / already restocked -> stop for review
 const closed=(await loadClosedIndex(env)).orders.get(orderId);
 let restocked=0;try{restocked=Number((await env.DB.prepare("SELECT COALESCE(SUM(quantity_delta),0) q FROM inventory_movements WHERE order_id=? AND quantity_delta>0").bind(orderId).first())?.q||0)}catch{}
 if(closed||restocked>0)return json({error:closed?'البضاعة مسجلة كمستلمة بالمستودع (كشف مرتجعات/تأكيد استلام) — التصحيح موقوف للمراجعة':'أُضيفت بضاعة هذا الطلب للمخزون سابقًا — التصحيح موقوف للمراجعة',stopped:true},423);

 // identity of the shipment
 const prevLine=await env.DB.prepare('SELECT rowid,* FROM delivery_company_settlement_orders WHERE order_id=? AND settlement_id=? ORDER BY rowid DESC').bind(orderId,expected).first();
 const prevSettlement=await env.DB.prepare('SELECT * FROM delivery_company_settlements WHERE id=?').bind(expected).first();
 const oldCode=normShip(prevLine?.shipment_code),newCode=normShip(line.shipment_code),verified=normShip(b.identity?.verified_code);
 if(oldCode&&newCode&&oldCode!==newCode)return json({error:`كود الشحنة مختلف بين الكشفين (${oldCode} ≠ ${newCode}) — ليست نفس الشحنة`},400);
 if(!verified||b.identity?.confirmed!==true)return json({error:'تحقق من هوية الشحنة: اكتب كود الشحنة كما في الكشفين وأكّد المطابقة'},400);
 if((newCode&&verified!==newCode)||(oldCode&&verified!==oldCode))return json({error:'الكود المُدخل لا يطابق كود الشحنة في الكشف'},400);
 const phone=normalizePhone(line.phone),orderPhone=normalizePhone(o.phone);
 if(phone&&orderPhone&&phone!==orderPhone)return json({error:'هاتف سطر الكشف لا يطابق هاتف الطلب'},400);

 // the new result from the statement
 const status=String(line.status||'');
 if(status==='partial'||status==='delivered_adjusted')return json({error:'التسليم الجزئي يحتاج تحديد القطع — غير مدعوم في التصحيح حاليًا'},400);
 if(!STATUSES.has(status))return json({error:'اختر الحالة النهائية من الكشف'},400);
 const amount=Math.max(0,num(line.amount)||0),fee=Number.isFinite(num(line.delivery_fee))?Math.max(0,num(line.delivery_fee)):NaN;
 const hasNet=line.has_net===true&&Number.isFinite(num(line.net_amount));
 if(!hasNet&&!(fee>=0))return json({error:'أدخل أجور التوصيل أو الصافي كما في الكشف'},400);
 if(['refused_fee_paid','refused_no_fee'].includes(status)&&!hasNet&&!(fee>0))return json({error:'أجور الرفض الفعلية غير موجودة في الكشف'},400);
 if(status==='delivered'&&!(amount>0))return json({error:'قيمة التسليم في الكشف مطلوبة'},400);
 const lineNet=round2(hasNet?num(line.net_amount):status==='delivered'?Math.max(0,amount-fee):status==='refused_fee_paid'?amount-fee:status==='refused_no_fee'?-fee:0);
 const charge=String(b.previous_charge||'');
 if(!['kept','reversed'].includes(charge))return json({error:'حدّد هل بقيت نتيجة الكشف السابق محسوبة لدى شركة التوصيل أم أُلغيت'},400);
 const reason=String(b.reason||'').trim();
 if(reason.length<5)return json({error:'اكتب سبب التصحيح'},400);

 const fromStatus=String(o.delivery_status||'');
 const fromCash=round2(RETURN_STATUSES.has(fromStatus)?refusalCash(o,fromStatus).cash:Number(o.cash_collected||0));
 const finalCash=round2(charge==='kept'?fromCash+lineNet:lineNet);
 const difference=round2(finalCash-fromCash);
 const isDelivered=status==='delivered';
 // delivered: fee = value − final cash, so value − fee = cash (fees of both attempts when kept)
 const finalFee=round2(isDelivered?Math.max(0,amount-finalCash):(Number.isFinite(fee)?fee:Math.max(0,amount-lineNet)));
 const shipmentDate=/^\d{4}-\d{2}-\d{2}$/.test(String(line.shipment_date||'').slice(0,10))?String(line.shipment_date).slice(0,10):null;
 const calc={order_id:orderId,order_code:o.order_code,from:{settlement_id:expected,settlement_code:prevSettlement?.settlement_code||'',status:fromStatus,status_label:AR[fromStatus]||fromStatus,cash:fromCash,shipment_code:oldCode||null,line_status:prevLine?.imported_status||''},
  to:{status,status_label:AR[status],amount,fee:Number.isFinite(fee)?fee:null,line_net:lineNet,final_cash:finalCash,final_fee:finalFee,shipment_code:newCode||verified,shipment_date:shipmentDate},
  previous_charge:charge,cash_difference:difference,identity_source:oldCode?'stored_code':'verified_code',inventory:'لا تغيير — خُصمت البضاعة مرة واحدة عند الطباعة'};
 if(dry)return json({dry_run:true,...calc});
 if(String(b.confirm||'').trim()!==CONFIRM_PHRASE)return json({error:`اكتب «${CONFIRM_PHRASE}» للتأكيد`},400);

 const key='corr-'+orderId+'-'+expected+'-'+Date.now().toString(36);
 const code='DCX-'+Date.now();
 const src=statusSource('settlement_correction',code);
 const exists=`EXISTS(SELECT 1 FROM delivery_settlement_corrections WHERE correction_key='${key}')`;
 const statements=[
  // 1. claim the correction (UNIQUE(order_id,from_settlement_id) refuses a second one); only
  //    while the order is still on the settlement being corrected
  env.DB.prepare(`INSERT INTO delivery_settlement_corrections(correction_key,order_id,order_code,from_settlement_id,from_status,to_status,from_cash,line_amount,line_fee,line_net,previous_charge,final_cash,cash_difference,shipment_code,shipment_date,identity_source,reason,created_by)
   SELECT ?,id,order_code,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM orders WHERE id=? AND delivery_company_settlement_id=? AND COALESCE(delivery_company_settled,0)=1`)
   .bind(key,expected,fromStatus,status,fromCash,amount,Number.isFinite(fee)?fee:null,lineNet,charge,finalCash,difference,newCode||verified,shipmentDate,calc.identity_source,reason,me.id,orderId,expected),
  // 2. correction settlement: carries only the difference
  env.DB.prepare(`INSERT INTO delivery_company_settlements(settlement_code,store_id,source_name,matched_count,unmatched_count,duplicate_count,delivered_count,refused_count,pending_count,collected_amount,delivery_fees,net_due,created_by,statement_date)
   SELECT ?,?,?,1,0,0,?,?,0,?,?,?,?,? WHERE ${exists}`)
   .bind(code,Number(o.store_id||prevSettlement?.store_id||0),`تصحيح تسوية الطلب #${o.order_code} (كان ${prevSettlement?.settlement_code||expected})`,isDelivered?1:0,isDelivered?0:1,isDelivered?amount:0,Number.isFinite(fee)?fee:0,difference,me.id,previousAccountingDate(shipmentDate)||null),
  // 3. final result on the order
  env.DB.prepare(`UPDATE orders SET delivery_status=?,delivered_amount=?,cash_collected=?,delivery_fee=?,settled_at=datetime('now'),
   delivery_company_settlement_id=(SELECT id FROM delivery_company_settlements WHERE settlement_code=?),status_source=?,status_by=?,updated_at=datetime('now')
   WHERE id=? AND delivery_company_settlement_id=? AND COALESCE(delivery_company_settled,0)=1 AND ${exists}`)
   .bind(status,isDelivered?amount:(status==='refused_fee_paid'?amount:0),finalCash,finalFee,code,src,me.id,orderId,expected),
  // 4. the statement line behind the correction (with the shipment code)
  env.DB.prepare(`INSERT INTO delivery_company_settlement_orders(settlement_id,order_id,phone,imported_status,applied_status,imported_amount,note,match_type,shipment_date,shipment_code)
   SELECT id,?,?,?,?,?,?,'correction',?,? FROM delivery_company_settlements WHERE settlement_code=? AND ${exists}`)
   .bind(orderId,phone||orderPhone,String(line.raw_status||AR[status]||status),status,amount,`تصحيح: ${reason}`.slice(0,500),shipmentDate,newCode||verified,code),
  env.DB.prepare(`UPDATE delivery_settlement_corrections SET to_settlement_id=(SELECT id FROM delivery_company_settlements WHERE settlement_code=?) WHERE correction_key=?`).bind(code,key)
 ];
 // the trigger records status changes; same status with a new cash result is recorded explicitly
 if(fromStatus===status)statements.push(env.DB.prepare(`INSERT INTO order_status_history(order_id,order_code,from_status,to_status,source,changed_by,cash_before,cash_after,settlement_before,settlement_after,note)
   SELECT ?,?,?,?,?,?,?,?,?,(SELECT id FROM delivery_company_settlements WHERE settlement_code=?),? WHERE ${exists}`)
   .bind(orderId,o.order_code,fromStatus,status,src.split('|')[0],me.id,fromCash,finalCash,expected,code,reason.slice(0,300)));
 try{await env.DB.batch(statements)}
 catch(e){if(/UNIQUE/i.test(String(e?.message||e)))return json({error:'هذا التصحيح نُفّذ سابقًا لهذه التسوية — لا يُنفّذ مرتين'},409);throw e}
 const after=await env.DB.prepare('SELECT o.delivery_status,o.cash_collected,o.delivery_company_settlement_id,d.settlement_code FROM orders o LEFT JOIN delivery_company_settlements d ON d.id=o.delivery_company_settlement_id WHERE o.id=?').bind(orderId).first();
 if(after?.settlement_code!==code)return json({error:'لم يُنفّذ التصحيح (تغيّرت حالة الطلب أثناء التنفيذ) — لم يتغير شيء'},409);
 return json({ok:true,correction_settlement:code,...calc,order_after:after});
}
