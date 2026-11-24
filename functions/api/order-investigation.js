// READ-ONLY investigation of one order (admin): everything the system recorded about it —
// every delivery-company settlement line, status audit, prints, inventory allocation and
// movements, warehouse return evidence, other shipments to the same phone — plus findings.
// Nothing here writes to the database.
import {json,normalizePhone,round2} from './_partial-delivery.js';
import {loadClosedIndex} from './_cargo-closed.js';

const safe=async(fn,fallback=[])=>{try{return await fn()}catch{return fallback}};
const rows=async(env,sql,...args)=>safe(async()=>(await env.DB.prepare(sql).bind(...args).all()).results||[]);
const one=async(env,sql,...args)=>safe(async()=>await env.DB.prepare(sql).bind(...args).first(),null);
const AR={pending:'قيد التوصيل',delivered:'تم التسليم',partial:'تسليم جزئي',delivered_adjusted:'تسليم جزئي',refused_fee_paid:'رفض ودفع أجور',refused_no_fee:'رفض وعدم دفع أجور',canceled_before_arrival:'ملغي قبل الوصول',returned:'مرتجع'};
const RETURNS=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival','returned']);

export async function onRequestGet({request,env}){
 const header=request.headers.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';
 const me=token&&await one(env,"SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1",token);
 if(!me)return json({error:'غير مصرح'},401);
 if(me.role!=='admin')return json({error:'هذه الصفحة للمدير فقط'},403);
 const url=new URL(request.url),code=Number(url.searchParams.get('code')||0),id=Number(url.searchParams.get('id')||0);
 if(!code&&!id)return json({error:'رقم الطلب مطلوب'},400);
 const o=await one(env,`SELECT o.*,s.name store_name,
   CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE datetime(o.first_printed_at,'+3 hours') END first_printed_local,
   CASE WHEN o.last_printed_at IS NULL THEN NULL ELSE datetime(o.last_printed_at,'+3 hours') END last_printed_local
   FROM orders o LEFT JOIN stores s ON s.id=o.store_id WHERE ${id?'o.id=?':'o.order_code=?'}`,id||code);
 if(!o)return json({error:'الطلب غير موجود'},404);
 const oid=Number(o.id),phone=normalizePhone(o.phone);

 // ---- delivery-company statements (every line that ever touched this order)
 const settlementLines=await rows(env,`SELECT so.rowid line_id,so.*,d.settlement_code,d.statement_date,datetime(d.created_at,'+3 hours') saved_at,d.source_name,u.display_name saved_by
   FROM delivery_company_settlement_orders so JOIN delivery_company_settlements d ON d.id=so.settlement_id LEFT JOIN users u ON u.id=d.created_by
   WHERE so.order_id=? ORDER BY so.settlement_id`,oid);
 const phoneLines=phone?await rows(env,`SELECT so.rowid line_id,so.*,d.settlement_code,d.statement_date,datetime(d.created_at,'+3 hours') saved_at,o2.order_code
   FROM delivery_company_settlement_orders so JOIN delivery_company_settlements d ON d.id=so.settlement_id LEFT JOIN orders o2 ON o2.id=so.order_id
   WHERE so.phone=? AND COALESCE(so.order_id,0)<>? ORDER BY so.settlement_id`,phone,oid):[];

 // ---- other shipments to the same phone
 const local=phone.startsWith('0')?phone.slice(1):phone;
 const samePhone=phone?(await rows(env,`SELECT o.id,o.order_code,o.amount,o.delivery_status,COALESCE(o.delivery_company_settled,0) settled,o.delivery_company_settlement_id,o.cash_collected,o.delivery_fee,
   datetime(o.created_at,'+3 hours') created_local,CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE datetime(o.first_printed_at,'+3 hours') END first_printed_local,s.name store_name,d.settlement_code
   FROM orders o LEFT JOIN stores s ON s.id=o.store_id LEFT JOIN delivery_company_settlements d ON d.id=o.delivery_company_settlement_id
   WHERE o.id<>? AND o.phone IN (?,?,?,?,?) ORDER BY o.id DESC LIMIT 30`,oid,phone,local,'962'+local,'00962'+local,'+962'+local)):[];

 // ---- history: audit log, prints, departures
 const audit=await rows(env,`SELECT id,event_type,before_json,after_json,note,datetime(created_at,'+3 hours') at,created_by FROM order_audit_log WHERE order_id=? OR order_code=? ORDER BY id`,oid,o.order_code);
 const prints=await rows(env,`SELECT b.id,b.batch_code,datetime(b.created_at,'+3 hours') at,u.display_name by_name FROM print_batch_orders p JOIN print_batches b ON b.id=p.batch_id LEFT JOIN users u ON u.id=b.created_by WHERE p.order_id=? ORDER BY b.id`,oid);
 const departure=await one(env,`SELECT first_batch_id,datetime(departed_at,'+3 hours') departed_local FROM order_departures WHERE order_id=?`,oid);

 // ---- inventory
 const allocation=await rows(env,`SELECT i.model_id,m.name model_name,i.quantity FROM inventory_order_items i LEFT JOIN profit_models m ON m.id=i.model_id WHERE i.order_id=?`,oid);
 const movements=await rows(env,`SELECT mv.id,mv.model_id,m.name model_name,mv.quantity_delta,mv.movement_type,mv.note,mv.source_ref,datetime(mv.created_at,'+3 hours') at FROM inventory_movements mv LEFT JOIN profit_models m ON m.id=mv.model_id WHERE mv.order_id=? ORDER BY mv.id`,oid);

 // ---- warehouse return evidence
 const closed=await safe(async()=>(await loadClosedIndex(env)).orders.get(oid)||null,null);
 const receipts=await rows(env,`SELECT shipment_code,datetime(received_at,'+3 hours') at,items_json FROM cargo_return_receipts WHERE order_id=?`,oid);
 const returnEvent=await one(env,`SELECT * FROM return_events WHERE order_id=?`,oid);
 const scans=await rows(env,`SELECT s.batch_id,s.result,datetime(s.created_at,'+3 hours') at,b.file_name FROM return_reconcile_scans s LEFT JOIN return_reconcile_batches b ON b.id=s.batch_id WHERE s.order_id=? OR s.order_code=? ORDER BY s.id`,oid,o.order_code);
 const storeSettlements=await rows(env,`SELECT so.settlement_id,so.store_due,ss.* FROM store_settlement_orders so LEFT JOIN store_settlements ss ON ss.id=so.settlement_id WHERE so.order_id=?`,oid);

 // ---- findings (facts only; the decision stays with the manager)
 const f=[];
 const status=String(o.delivery_status||'pending'),settled=Number(o.delivery_company_settled||0)===1;
 f.push(`الحالة الحالية: ${AR[status]||status}${settled?' — مسوّى مع شركة التوصيل':' — غير مسوّى'}. الكاش المسجل ${round2(o.cash_collected||0)} د.أ، أجور التوصيل ${round2(o.delivery_fee||0)} د.أ.`);
 if(!settlementLines.length)f.push('لا يوجد أي سطر كشف شركة توصيل مسجّل لهذا الطلب.');
 for(const l of settlementLines){
  const manual=String(l.match_type||'').startsWith('manual');
  f.push(`كشف ${l.settlement_code} (تاريخ الكشف ${l.statement_date||'—'}، حُفظ ${l.saved_at||'—'}${l.saved_by?' بواسطة '+l.saved_by:''}): الحالة في الكشف «${l.imported_status||'—'}»، المعتمدة «${AR[l.applied_status]||l.applied_status||'—'}»، القيمة ${round2(l.imported_amount)} د.أ، تاريخ الشحنة في السطر ${l.shipment_date||'غير محفوظ (كشف قبل 24/11)'}، طريقة الربط: ${manual?'اختيار يدوي':'تلقائي ('+(l.match_type||'—')+')'}.`);
 }
 f.push('كود الشحنة لا يُحفظ في سطور كشوف شركة التوصيل (لا في القديمة ولا الحالية)، لذلك لا يمكن مقارنة الكود من النظام — يلزم مقارنته من ملفي الكشفين.');
 const returnEvidence=Boolean(closed||receipts.length||returnEvent||scans.some(s=>/match|found|ok|received/i.test(String(s.result))));
 f.push(returnEvidence?`يوجد دليل استلام مرتجع بالمستودع: ${closed?`كشف مرتجعات #${closed.report_id||''} ${closed.closed_at||''}`:''}${receipts.length?' تأكيد استلام':''}${returnEvent?' سجل مرتجع':''}${scans.length?' مسح باركود':''}.`:'لا يوجد أي دليل أن الشحنة رجعت للمستودع: لا كشف مرتجعات مسكّر، لا تأكيد استلام، لا سجل مرتجع، لا مسح باركود.');
 const deducted=movements.filter(m=>Number(m.quantity_delta)<0).reduce((n,m)=>n-Number(m.quantity_delta),0),restocked=movements.filter(m=>Number(m.quantity_delta)>0).reduce((n,m)=>n+Number(m.quantity_delta),0);
 f.push(allocation.length?`المخزون: خُصم عند الطباعة ${deducted} قطعة (${allocation.map(a=>a.model_name+' × '+a.quantity).join('، ')})، وأُرجع للمخزون ${restocked} قطعة.`:`المخزون: لا يوجد خصم مسجل عند الطباعة لهذا الطلب${movements.length?' (توجد حركات أخرى)':''}، ولا إرجاع.`);
 f.push(`الطباعة: أول طباعة ${o.first_printed_local||'—'}، آخر طباعة ${o.last_printed_local||'—'}، عدد مرات الطباعة ${Number(o.print_count||0)}${prints.length?' (دفعات: '+prints.map(p=>p.batch_code+' '+p.at).join('، ')+')':''}.${Number(o.print_count||0)>1||prints.length>1?' طباعة بوليصة بعد تاريخ التسوية قد تعني إعادة إرسال.':''}`);
 if(audit.length)f.push(`سجل التعديلات: ${audit.length} حدث.`);else f.push('لا يوجد سجل تغييرات حالة لهذا الطلب (النظام لا يسجل تغيير الحالة عند تسكير كشف شركة التوصيل إلا في سطور الكشف أعلاه).');
 const openSame=samePhone.filter(x=>!Number(x.settled));
 if(samePhone.length)f.push(`طلبات أخرى لنفس الهاتف: ${samePhone.map(x=>'#'+x.order_code+' ('+(AR[x.delivery_status]||x.delivery_status)+(Number(x.settled)?'، مسوّى '+(x.settlement_code||''):'، غير مسوّى')+'، طُبع '+(x.first_printed_local||'—')+')').join('؛ ')}.`);
 else f.push('لا توجد طلبات أخرى لنفس الهاتف في النظام.');
 if(phoneLines.length)f.push(`سطور كشوف أخرى بنفس الهاتف مربوطة بطلبات أخرى: ${phoneLines.map(l=>l.settlement_code+' → #'+(l.order_code||'—')+' «'+(l.imported_status||'')+'» '+round2(l.imported_amount)).join('؛ ')}.`);

 // what the facts point to (not a decision)
 const hints=[];
 const lastRefusal=[...settlementLines].reverse().find(l=>RETURNS.has(String(l.applied_status)));
 if(lastRefusal&&!returnEvidence)hints.push('الطلب سُجّل رفضًا في كشف سابق لكن لم يصل المستودع أبدًا — يتوافق مع أن شركة التوصيل احتفظت بالشحنة وأعادت محاولة التسليم، أو مع ربط خاطئ في الكشف السابق.');
 if(lastRefusal&&String(lastRefusal.match_type||'').startsWith('manual'))hints.push('سطر الرفض السابق رُبط يدويًا — احتمال الربط الخاطئ أعلى.');
 if(lastRefusal&&openSame.length)hints.push(`يوجد طلب آخر غير مسوّى لنفس الهاتف (${openSame.map(x=>'#'+x.order_code).join('، ')}) — قد يكون هو صاحب سطر الرفض السابق.`);
 if(lastRefusal&&!openSame.length&&!samePhone.length)hints.push('لا يوجد طلب آخر لنفس الهاتف، فسطر الرفض السابق وهذا التسليم يخصّان على الأرجح نفس الشحنة (تأكد من كود الشحنة في الكشفين).');

 return json({order:{id:oid,order_code:o.order_code,recipient_name:o.recipient_name,phone:o.phone,store_name:o.store_name,amount:o.amount,delivery_status:status,status_label:AR[status]||status,
   delivered_amount:o.delivered_amount,cash_collected:o.cash_collected,delivery_fee:o.delivery_fee,settled,settlement_id:o.delivery_company_settlement_id,settled_at:o.settled_at,
   first_printed_local:o.first_printed_local,last_printed_local:o.last_printed_local,print_count:o.print_count,created_at:o.created_at,updated_at:o.updated_at,order_text:o.order_notes||o.raw_text},
  settlement_lines:settlementLines,same_phone_orders:samePhone,same_phone_statement_lines:phoneLines,audit,prints,departure,inventory:{allocation,movements},
  warehouse:{closed_report:closed,receipts,return_event:returnEvent,scans},store_settlements:storeSettlements,findings:f,hints,read_only:true});
}
