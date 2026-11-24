// Matches every line of a delivery-company statement to exactly one order.
// Priority: shipment/order code -> phone + shipment date + store -> amount.
// A phone match alone never links a line to an order automatically, and an order
// outside the shipment-date window (an older shipment to the same customer) is
// only offered for manual selection, clearly flagged.
import {json,auth,normalizePhone,normalizeDigits,statementCodes,normalizeCode,shipmentDateFit,RETURN_STATUSES,PARTIAL_STATUSES,RECONCILE_CUTOFF,round2,ensureSettlementLineShipmentDate} from '../_partial-delivery.js';

const ORDER_COLUMNS=`o.id,o.order_code,o.store_id,o.recipient_name,o.phone,o.amount,o.area,o.delivery_status,
  COALESCE(o.delivery_company_settled,0) delivery_company_settled,o.delivery_company_settlement_id,o.first_printed_at,o.created_at,
  CASE WHEN o.first_printed_at IS NULL THEN NULL WHEN strftime('%w',o.first_printed_at,'+3 hours')='4' THEN date(o.first_printed_at,'+3 hours','+2 days') ELSE date(o.first_printed_at,'+3 hours','+1 day') END delivery_date,
  CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE date(o.first_printed_at,'+3 hours') END first_print_date,
  date(o.created_at,'+3 hours') created_date,
  s.name store_name,ds.settlement_code,ds.statement_date settlement_statement_date,ds.created_at settlement_created_at,
  so.imported_amount settlement_imported_amount,so.shipment_date settlement_shipment_date,so.shipment_code settlement_shipment_code,so.match_type settlement_match_type,date(ds.created_at,'+3 hours') settlement_saved_date,so.imported_status settlement_imported_status,so.applied_status settlement_applied_status,
  o.delivered_amount,o.settled_at`;
const orderSql=where=>`SELECT ${ORDER_COLUMNS},o.raw_text,o.order_notes FROM orders o
  LEFT JOIN stores s ON s.id=o.store_id
  LEFT JOIN delivery_company_settlements ds ON ds.id=o.delivery_company_settlement_id
  LEFT JOIN delivery_company_settlement_orders so ON so.rowid=(SELECT MAX(so2.rowid) FROM delivery_company_settlement_orders so2 WHERE so2.order_id=o.id AND so2.settlement_id=o.delivery_company_settlement_id)
  ${where} AND date(COALESCE(o.first_printed_at,o.created_at),'+3 hours')>='${RECONCILE_CUTOFF}' ORDER BY o.id DESC`;

const RETURN_LIKE=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival']);
const dayDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/864e5);
const isDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
// Shipment date the earlier statement reported for this order: stored per line since v3,
// otherwise the statement's accounting date + 1 (statement_date is the day before the
// dominant shipment date).
const previousShipDate=c=>{
 if(isDay(c.settlement_shipment_date))return {date:c.settlement_shipment_date,exact:true};
 if(isDay(c.settlement_date)){const d=new Date(c.settlement_date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return {date:d.toISOString().slice(0,10),exact:false}}
 return {date:'',exact:false};
};
// Why an earlier settlement can NOT be this statement line (empty list = same shipment).
// Identity of a settled candidate vs this line: the delivery company's shipment code is the
// proof (stored per line since 24/11). A different result (delivered vs returned) for the same
// shipment is a conflict to correct, never something to settle twice.
const normShip=v=>String(v||'').replace(/\s+/g,'').toUpperCase();
function settledIdentity(o,line){
 if(!Number(o.delivery_company_settled||0))return {};
 const prev=normShip(o.settlement_shipment_code),cur=normShip(line.displayCode);
 const identity=prev&&cur?(prev===cur?'same_code':'different_code'):'unknown';
 const applied=String(o.settlement_applied_status||o.delivery_status||'');
 const result_conflict=Boolean(line.status&&applied&&RETURN_LIKE.has(applied)!==RETURN_LIKE.has(String(line.status)));
 return {identity,result_conflict,correction_possible:result_conflict&&identity!=='different_code'&&Number(o.store_id)===Number(line.storeId)};
}
const settledDifferences=(c,line)=>{
 const diffs=[];
 if(c.identity==='different_code')diffs.push(`كود الشحنة مختلف (${c.settlement_shipment_code} ≠ ${line.displayCode})`);
 if(c.identity==='same_code'){
  if(c.result_conflict)diffs.push('نفس كود الشحنة لكن نتيجة الكشف السابق مختلفة (مستلم/مرتجع) — تحتاج «تصحيح التسوية السابقة»');
  const prevAmount=c.settlement_imported_amount==null?c.amount:Number(c.settlement_imported_amount);
  if(!c.result_conflict&&Math.abs(prevAmount-Number(line.amount||0))>=.01)diffs.push(`نفس كود الشحنة لكن القيمة مختلفة (${money(prevAmount)} ≠ ${money(line.amount)})`);
  return diffs;
 }
 if(!c.same_store)diffs.push('متجر آخر');
 if(!isDay(line.shipmentDate))diffs.push('الكشف الحالي بلا تاريخ شحنة');
 else{
  if(isDay(c.settlement_saved_date)&&line.shipmentDate>c.settlement_saved_date&&c.identity!=='same_code')diffs.push(`الشحنة خرجت ${line.shipmentDate} بعد حفظ الكشف السابق (${c.settlement_saved_date})`);
  const prev=previousShipDate(c);
  if(!prev.date)diffs.push('تاريخ شحنة الكشف السابق غير معروف');
  else if(Math.abs(dayDiff(line.shipmentDate,prev.date))>(prev.exact?0:1))diffs.push(`تاريخ الشحنة بالكشف السابق ${prev.date}${prev.exact?'':' (تقريبي)'} ≠ ${line.shipmentDate}`);
  if(c.date_ok===false)diffs.push(`طباعة الطلب (${c.first_print_date||c.created_date||'—'}) لا تطابق تاريخ الشحنة`);
 }
 const previous=c.settlement_imported_amount==null?c.amount:Number(c.settlement_imported_amount);
 if(Math.abs(previous-Number(line.amount||0))>=.01)diffs.push(`قيمة الكشف السابق ${money(previous)} ≠ ${money(line.amount)}`);
 const applied=String(c.settlement_applied_status||c.delivery_status||'');
 if(line.status&&applied&&RETURN_LIKE.has(applied)!==RETURN_LIKE.has(String(line.status)))diffs.push('نتيجة الكشف السابق مختلفة (مستلم/مرتجع)');
 return [...new Set(diffs)];
};
const sameSettledShipment=(c,line)=>Boolean(c&&c.delivery_company_settled)&&settledDifferences(c,line).length===0;
const settledSummary=(c,line)=>{
 const diffs=settledDifferences(c,line);
 return `#${c.order_code} في ${c.settlement_code||'كشف سابق'}${c.settlement_date?' ('+c.settlement_date+')':''}${diffs.length?': '+diffs.join('، '):''}`;
};

const phoneVariants=phone=>{if(!phone)return[];const local=phone.startsWith('0')?phone.slice(1):phone;return[phone,local,'962'+local,'00962'+local,'+962'+local]};
const money=n=>round2(n).toFixed(2).replace(/\.00$/,'');
const push=(map,key,order)=>{if(!key)return;if(!map.has(key))map.set(key,new Map());map.get(key).set(Number(order.id),order)};

export async function onRequestPost({request,env}){
 if(!await auth(request,env))return json({error:'غير مصرح'},401);
 let body={};try{body=await request.json()}catch{}
 const storeId=Number(body.store_id||0),rows=Array.isArray(body.rows)?body.rows.slice(0,3000):[];
 if(!storeId)return json({error:'اختر المتجر أولاً'},400);
 if(!rows.length)return json({error:'الكشف فارغ'},400);
 await ensureSettlementLineShipmentDate(env);

 // ---- load everything that could belong to the statement
 const all=new Map(),byPhone=new Map(),byText=new Map(),byCode=new Map();
 const remember=o=>{const id=Number(o.id);if(!all.has(id))all.set(id,o);return all.get(id)};
 for(const o of (await env.DB.prepare(orderSql('WHERE o.store_id=?')).bind(storeId).all()).results||[]){const x=remember(o);push(byPhone,normalizePhone(x.phone),x);push(byCode,normalizeCode(x.order_code),x)}

 const reportPhones=[...new Set(rows.map(r=>normalizePhone(r?.phone)).filter(p=>p.length>=9))];
 const variants=[...new Set(reportPhones.flatMap(phoneVariants))];
 for(let i=0;i<variants.length;i+=90){
  const chunk=variants.slice(i,i+90);
  const res=(await env.DB.prepare(orderSql(`WHERE o.store_id<>? AND o.phone IN (${chunk.map(()=>'?').join(',')})`)).bind(storeId,...chunk).all()).results||[];
  for(const o of res){const x=remember(o);push(byPhone,normalizePhone(x.phone),x);push(byCode,normalizeCode(x.order_code),x)}
 }
 // Customer phone written only inside the order text (second number / typo in the phone field).
 for(let i=0;i<reportPhones.length;i+=40){
  const chunk=reportPhones.slice(i,i+40),locals=chunk.map(p=>p.replace(/^0/,''));
  const where=locals.map(()=>"(o.raw_text LIKE '%'||?||'%' OR o.order_notes LIKE '%'||?||'%')").join(' OR ');
  const res=(await env.DB.prepare(orderSql(`WHERE COALESCE(o.delivery_company_settled,0)=0 AND (${where})`)).bind(...locals.flatMap(x=>[x,x])).all()).results||[];
  for(const o of res){
   const x=remember(o),text=normalizeDigits(`${x.raw_text||''} ${x.order_notes||''}`).replace(/[^\d]/g,' ');
   for(const p of chunk){const local=p.replace(/^0/,'');if(new RegExp(`(?:^|\\D)(?:0|962|00962)?${local}(?:\\D|$)`).test(text)&&normalizePhone(x.phone)!==p)push(byText,p,x)}
  }
 }
 const codes=[...new Set(rows.flatMap(r=>statementCodes(r||{})))].filter(c=>!byCode.has(c));
 for(let i=0;i<codes.length;i+=90){
  const chunk=codes.slice(i,i+90);
  const res=(await env.DB.prepare(orderSql(`WHERE CAST(o.order_code AS TEXT) IN (${chunk.map(()=>'?').join(',')})`)).bind(...chunk).all()).results||[];
  for(const o of res){const x=remember(o);push(byCode,normalizeCode(x.order_code),x)}
 }

 // ---- prepare statement lines
 const lines=rows.map((row,index)=>{
  row=row||{};
  const phone=normalizePhone(row.phone),amount=Math.max(0,Number(row.amount||0)),deliveryFee=Math.max(0,Number(row.delivery_fee||0));
  const hasNet=Boolean(row.has_net),netAmount=hasNet?Number(row.net_amount||0):amount-deliveryFee;
  const shipmentDate=String(row.shipment_date||'').trim().slice(0,10),status=String(row.status||'');
  const displayCode=String(row.display_code||row.shipment_code||'').trim().slice(0,60);
  return {index,storeId,phone,amount,status,shipmentDate,displayCode,codes:statementCodes(row),
   common:{display_code:displayCode,row_index:index+1,phone,shipment_date:shipmentDate,status,amount,delivery_fee:deliveryFee,net_amount:netAmount,has_net:hasNet,note:String(row.note||''),shipment_code:String(row.shipment_code||'')},result:null};
 });

 const used=new Set();
 const describe=(o,line,source)=>{
  const fit=shipmentDateFit(o,line.shipmentDate),orderAmount=Math.abs(Number(o.amount||0));
  return {id:Number(o.id),order_code:o.order_code,store_id:Number(o.store_id||0),store_name:o.store_name||'',recipient_name:o.recipient_name||'',phone:o.phone||'',
   amount:orderAmount,first_print_date:o.first_print_date||null,delivery_date:o.delivery_date||null,created_date:o.created_date||null,
   delivery_status:o.delivery_status||'pending',delivery_company_settled:Number(o.delivery_company_settled||0),settlement_code:o.settlement_code||'',
   settlement_id:o.delivery_company_settlement_id?Number(o.delivery_company_settlement_id):null,
   settlement_date:o.settlement_statement_date||(o.settlement_created_at?String(o.settlement_created_at).slice(0,10):null),
   settlement_imported_amount:o.settlement_imported_amount==null?null:Number(o.settlement_imported_amount),
   settlement_imported_status:o.settlement_imported_status||'',settlement_applied_status:o.settlement_applied_status||'',
   settlement_shipment_date:o.settlement_shipment_date||null,settlement_shipment_code:o.settlement_shipment_code||'',settlement_match_type:o.settlement_match_type||'',settlement_saved_date:o.settlement_saved_date||null,
   delivered_amount:o.delivered_amount==null?null:Number(o.delivered_amount),settled_at:o.settled_at||null,
   same_store:Number(o.store_id)===storeId,phone_source:source,date_known:fit.known,date_ok:fit.ok,date_gap:fit.gap,
   amount_relation:Math.abs(orderAmount-line.amount)<.01?'equal':orderAmount>line.amount?'order_higher':'order_lower',
   used_by_other_line:used.has(Number(o.id)),...settledIdentity(o,line)};
 };
 const candidatePool=line=>{
  const seen=new Map();
  for(const o of (byPhone.get(line.phone)||new Map()).values())seen.set(Number(o.id),describe(o,line,'phone'));
  for(const o of (byText.get(line.phone)||new Map()).values())if(!seen.has(Number(o.id)))seen.set(Number(o.id),describe(o,line,'order_text'));
  const rank=c=>(c.delivery_company_settled?100:0)+(c.date_ok===false?30:0)+(c.same_store?0:10)+(c.phone_source==='phone'?0:5)+(c.amount_relation==='order_lower'?2:0);
  return [...seen.values()].sort((a,b)=>rank(a)-rank(b)||b.id-a.id);
 };
 const finish=(line,type,extra={})=>{line.result={...line.common,match_type:type,...extra}};
 const accept=(line,order,evidence)=>{
  const c=describe(order,line,'phone');used.add(c.id);
  const type=Math.abs(c.amount-line.amount)<.01?'matched':'matched_partial';
  finish(line,type,{order:c,order_id:c.id,candidates:[c],match_evidence:evidence,
   needs_items:type==='matched_partial'&&!RETURN_STATUSES.has(line.status)||PARTIAL_STATUSES.has(line.status)});
 };
 const review=(line,type,reason,extra={})=>{
  const candidates=candidatePool(line);
  finish(line,type,{candidates,reason,...extra});
 };

 // ---- pass 1: shipment / order code
 for(const line of lines){
  if(!line.codes.length)continue;
  const found=new Map();for(const code of line.codes)for(const o of (byCode.get(code)||new Map()).values())found.set(Number(o.id),o);
  const list=[...found.values()];
  if(!list.length){line.codeMissing=true;continue}
  if(list.length>1){review(line,'review_code','أكثر من رقم شحنة في السطر يشير لطلبات مختلفة — اختر الطلب الصحيح');continue}
  const o=list[0],c=describe(o,line,'code');
  if(c.delivery_company_settled){finish(line,'already_settled',{candidates:[c],settled_evidence:'رقم الشحنة',reason:`رقم الشحنة #${c.order_code} مسوّى سابقًا في ${c.settlement_code||'كشف سابق'}${c.settlement_date?' بتاريخ '+c.settlement_date:''}${c.settlement_imported_amount!=null?' بقيمة '+money(c.settlement_imported_amount):''}`});continue}
  const textHasPhone=[...(byText.get(line.phone)||new Map()).keys()].includes(c.id);
  if(line.phone&&normalizePhone(o.phone)!==line.phone&&!textHasPhone){review(line,'review_code',`رقم الشحنة #${c.order_code} يعود لطلب برقم هاتف مختلف (${o.phone}) — تحقق قبل الاعتماد`,{suggested_order_id:c.id,candidates:[c,...candidatePool(line).filter(x=>x.id!==c.id)]});line.result.candidates=[c,...candidatePool(line).filter(x=>x.id!==c.id)];continue}
  if(used.has(c.id)){finish(line,'duplicate',{candidates:[c],reason:`رقم الشحنة #${c.order_code} مستخدم في سطر آخر من نفس الكشف`});continue}
  if(!RETURN_STATUSES.has(line.status)&&line.amount>c.amount+.001){
   review(line,'review_amount_higher',`رقم الشحنة يطابق الطلب #${c.order_code} لكن قيمة الكشف (${money(line.amount)}) أكبر من قيمة الطلب (${money(c.amount)})`,{suggested_order_id:c.id});continue;
  }
  accept(line,o,'رقم الشحنة');
 }

 // ---- pass 2: phone + shipment date + store + amount. Exact amounts are resolved first
 // so a weaker (partial) line can never take an order that another line matches exactly.
 const pending=lines.filter(l=>!l.result);
 const storeOpen=line=>[...(byPhone.get(line.phone)||new Map()).values()].filter(o=>Number(o.store_id)===storeId&&!Number(o.delivery_company_settled||0));
 const fitting=line=>{
  const open=storeOpen(line).filter(o=>!used.has(Number(o.id)));
  if(!line.shipmentDate)return open;
  return open.filter(o=>shipmentDateFit(o,line.shipmentDate).ok);
 };
 for(const line of pending){
  if(!line.phone)continue;
  const fit=fitting(line),exact=line.amount>0?fit.filter(o=>Math.abs(Math.abs(Number(o.amount||0))-line.amount)<.01):[];
  const safe=line.shipmentDate||storeOpen(line).filter(o=>!used.has(Number(o.id))).length===1;
  if(exact.length===1&&safe&&!line.codeMissing)accept(line,exact[0],line.shipmentDate?'الهاتف + تاريخ خروج الشحنة + القيمة':'الهاتف + القيمة (طلب وحيد مفتوح)');
 }
 for(const line of pending){
  if(line.result)continue;
  const codeNote=line.codeMissing?'رقم الشحنة في الكشف غير موجود في النظام — ':'';
  if(!line.phone){finish(line,'unmatched',{candidates:[],reason:'رقم الهاتف غير مقروء في الكشف'});continue}
  const fit=fitting(line),open=storeOpen(line).filter(o=>!used.has(Number(o.id)));
  const exact=line.amount>0?fit.filter(o=>Math.abs(Math.abs(Number(o.amount||0))-line.amount)<.01):[];
  const isReturn=RETURN_STATUSES.has(line.status);
  if(exact.length>1){review(line,'duplicate',`${codeNote}يوجد ${exact.length} طلبات بنفس القيمة والتاريخ لهذا الهاتف — اختر الطلب الصحيح`);continue}
  if(!line.codeMissing&&line.shipmentDate){
   if(isReturn&&fit.length===1){accept(line,fit[0],'الهاتف + تاريخ خروج الشحنة (مرتجع)');continue}
   const higherOrders=fit.filter(o=>Math.abs(Number(o.amount||0))>line.amount+.001);
   if(!isReturn&&line.amount>0&&higherOrders.length===1){accept(line,higherOrders[0],'الهاتف + تاريخ خروج الشحنة + قيمة أقل من الطلب (تسليم جزئي)');continue}
  }
  // ---- nothing safe: explain why and offer the candidates for manual choice
  const pool=candidatePool(line);
  const openPool=pool.filter(c=>!c.delivery_company_settled&&!c.used_by_other_line);
  if(!openPool.length){
   // A phone match alone never proves the line was settled before: the customer may have a
   // newer shipment that is not in the system yet, or the earlier statement may describe a
   // different shipment. Only call it "already settled" when the earlier settlement is the
   // same shipment (same store, shipment-date fit, same value, consistent result).
   const settled=pool.filter(c=>c.delivery_company_settled);
   if(settled.length){
    const strong=settled.filter(c=>sameSettledShipment(c,line));
    if(strong.length===1&&settled.filter(c=>c.same_store).length===1){
     const c=strong[0];
     finish(line,'already_settled',{candidates:[c],settled_evidence:'الهاتف + تاريخ خروج الشحنة + نفس القيمة + نفس النتيجة',
      reason:`نفس الشحنة سُوّيت سابقًا: الطلب #${c.order_code} في ${c.settlement_code||'كشف سابق'}${c.settlement_date?' بتاريخ '+c.settlement_date:''} بقيمة ${money(c.settlement_imported_amount??c.amount)} — لن تُحسب مرتين`});
     continue;
    }
    finish(line,'review_settled',{candidates:pool,reason:`${codeNote}تحتاج مراجعة: لا يوجد طلب مفتوح لهذا الهاتف، ويوجد طلب مسوّى سابقًا لكن لا يوجد ما يثبت أنه نفس هذه الشحنة — ${settled.map(c=>settledSummary(c,line)).join('؛ ')}. لم يُعتبر السطر مسوّى ولن يُعتمد حتى تتأكد (قد يكون طلبًا جديدًا غير مُدخل في النظام)${settled.some(c=>c.correction_possible)?'. إذا تحققت أنها نفس الشحنة وتغيّرت نتيجتها، يمكن للمدير «تصحيح التسوية السابقة»':''}`,correction_possible:settled.some(c=>c.correction_possible)});
    continue;
   }
   const used2=pool.filter(c=>c.used_by_other_line);
   if(used2.length){finish(line,'duplicate',{candidates:used2,reason:'طلب هذا الهاتف مستخدم في سطر آخر من نفس الكشف'});continue}
   finish(line,'unmatched',{candidates:[],reason:`${codeNote}لا يوجد طلب مفتوح بهذا الرقم في أي متجر`});continue;
  }
  if(!open.length&&openPool.every(c=>!c.same_store)){
   const stores=[...new Set(openPool.map(c=>c.store_name).filter(Boolean))].join('، ')||'متجر آخر';
   review(line,'other_store',`${codeNote}لا يوجد طلب مفتوح لهذا الهاتف في المتجر المختار؛ موجود في: ${stores}`);continue;
  }
  const inWindow=openPool.filter(c=>c.same_store&&c.date_ok!==false);
  let type='review_amount',reason='';
  const otherInWindow=openPool.filter(c=>!c.same_store&&c.date_ok!==false);
  if(line.shipmentDate&&!inWindow.length&&otherInWindow.length){
   type='other_store';
   reason=`${codeNote}الطلب الذي خرج بتاريخ ${line.shipmentDate} لهذا الهاتف مسجّل في متجر آخر (${otherInWindow.map(c=>'#'+c.order_code+' – '+(c.store_name||'متجر آخر')).join('، ')}) — تحقق واختره يدويًا`;
  }else if(line.shipmentDate&&!inWindow.length){
   type='review_date';
   reason=`${codeNote}لا يوجد طلب لهذا الهاتف خرج بتاريخ ${line.shipmentDate}؛ الطلبات الموجودة أقدم/أحدث (${openPool.slice(0,3).map(c=>'#'+c.order_code+' طُبع '+(c.first_print_date||c.created_date||'—')).join('، ')}) — لن يُربط تلقائيًا`;
  }else if(!isReturn&&inWindow.length&&inWindow.every(c=>c.amount_relation==='order_lower')){
   type='review_amount_higher';
   reason=`${codeNote}قيمة الكشف (${money(line.amount)}) أكبر من قيمة ${inWindow.length===1?'الطلب المتاح':'الطلبات المتاحة'} (${inWindow.map(c=>'#'+c.order_code+': '+money(c.amount)).join('، ')}) — اختر الطلب الصحيح يدويًا`;
  }else if(!line.shipmentDate){
   reason=`${codeNote}الكشف بلا تاريخ خروج شحنة ويوجد ${openPool.length} طلب محتمل — اختر الطلب الصحيح`;
  }else{
   reason=`${codeNote}يوجد ${inWindow.length} طلب محتمل لهذا الهاتف بنفس فترة الشحن — اختر الطلب الصحيح`;
  }
  review(line,type,reason);
 }

 const result=lines.map(l=>l.result);
 const count=t=>result.filter(r=>r.match_type===t).length;
 const summary={total:rows.length,matched:count('matched')+count('matched_partial'),matched_partial:count('matched_partial'),
  duplicate:count('duplicate'),unmatched:count('unmatched'),already_settled:count('already_settled'),other_store:count('other_store'),
  review:result.filter(r=>String(r.match_type).startsWith('review')).length};
 return json({rows:result,summary,engine:'reconcile-v3'});
}
