// Historical inventory audit for returns — completely separate from closing new returns.
// GET: classifies every shipment of the closed returns statements; changes nothing.
// POST {action:'apply',confirm:'تطبيق التصحيح',items:[{order_id,kind}]}: adds back only the
// rows the admin selected, recomputed on the server, through the guarded movements
// (running it again can never add the same pieces twice).
//
// Why "no deduction"? Deduct-on-first-print started at a known moment (first «خصم أول
// طباعة بوليصة» movement). Shipments printed before it were never deducted when they left,
// so a missing deduction is NOT proof that stock is right. Whether such a return must be
// added back depends on the last stock count (manual set / reset) of its model:
//  - left before the count and came back after it  → the count missed it: candidate to add
//  - left after the count                           → never deducted: adding would inflate
//  - no count for the model                         → cannot be decided: physical count
import {loadInventoryModels,classifyInventoryItems,returnRestockPlan,restockStatements,ensureInventorySchema} from './_inventory.js';

const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
// Deduct-on-first-print went live with commit 06a5aee (22/11/2026 10:49 +02:00 = 08:49 UTC).
// Prints after this moment must have a «خصم أول طباعة بوليصة» movement.
const ACTIVATED_AT='2026-11-22 08:49:14';
const STATUS_AR={pending:'قيد التوصيل',delivered:'تم التسليم',partial:'تسليم جزئي',delivered_adjusted:'تسليم جزئي',returned:'مرتجع',refused_fee_paid:'رفض مع دفع أجور',refused_no_fee:'رفض بدون أجور',canceled_before_arrival:'ملغي قبل الوصول'};
const LABEL={ok:'مُضاف للمخزون',missing:'خُصم عند الطباعة ولم يُضف',count_excluded:'خرج قبل آخر جرد ورجع بعده — مرشح للإضافة',never_deducted:'لم يُخصم عند خروجه — لا يُضاف',no_baseline:'لا يوجد جرد مرجعي للموديل — يحتاج جرد فعلي',unrecognized:'طُبع بعد التفعيل ولم يُخصم — الموديل غير معروف',bug_not_deducted:'طُبع بعد التفعيل ولم يُخصم رغم أن الموديل معروف — خلل يحتاج مراجعة',review:'يحتاج مراجعة',mixed:'حالات مختلفة حسب الموديل'};

async function audit(env){
 await ensureInventorySchema(env);
 const models=await loadInventoryModels(env).catch(()=>[]);
 const name=id=>(models.find(m=>m.id===Number(id))||{}).name||('موديل '+id);
 const v2row=await env.DB.prepare("SELECT MIN(created_at) t,strftime('%d/%m/%Y %H:%M',MIN(created_at),'+3 hours') l FROM inventory_movements WHERE movement_type='order' AND note LIKE 'خصم أول طباعة%'").first();
 const v2=ACTIVATED_AT;
 const baselines=(await env.DB.prepare("SELECT model_id,created_at,strftime('%d/%m/%Y %H:%M',created_at,'+3 hours') local,note FROM inventory_movements WHERE movement_type='manual' AND (note LIKE 'تعيين الرصيد%' OR note LIKE 'تصفير شامل%') ORDER BY created_at").all()).results||[];
 const lastBaseline=(modelId,before)=>{let b=null;for(const x of baselines)if(Number(x.model_id)===Number(modelId)&&x.created_at<=before)b=x;return b};
 let reports=[];
 try{reports=(await env.DB.prepare("SELECT id,created_at,date(created_at,'+3 hours') closed_on,source_name,details_json FROM cargo_return_close_reports ORDER BY id").all()).results||[]}catch{reports=[]}
 const seen=new Set(),rows=[];
 for(const r of reports){
  let d={};try{d=JSON.parse(r.details_json||'{}')}catch{}
  for(const c of [...(d.closed||[]),...(d.skipped||[]).filter(x=>x.order_id&&/مرتجع مسبق/.test(String(x.reason||'')))]){
   const id=Number(c.order_id);if(!id||seen.has(id))continue;seen.add(id);
   const o=await env.DB.prepare("SELECT id,order_code,delivery_status,partial_received_items,raw_text,order_notes,first_printed_at,strftime('%d/%m/%Y %H:%M',first_printed_at,'+3 hours') printed_local FROM orders WHERE id=?").bind(id).first();
   if(!o)continue;
   const plan=await returnRestockPlan(env,o,models);
   const base={report_id:r.id,closed_on:r.closed_on,source_name:r.source_name||'',shipment_code:c.shipment_code||'',order_id:id,order_code:o.order_code,status:o.delivery_status,printed_at:o.printed_local,
    printed_before_system:Boolean(o.first_printed_at&&o.first_printed_at<v2),status_ar:STATUS_AR[o.delivery_status]||o.delivery_status,
    deducted:plan.allocated.map(a=>({model_id:a.model_id,model_name:name(a.model_id),quantity:a.quantity})),already_added:plan.already.map(a=>({model_name:name(a.model_id),quantity:a.quantity}))};
   if(plan.allocated.length){
    const missing=plan.ok?plan.items:[];
    rows.push({...base,kind:!plan.ok?'review':missing.length?'missing':'ok',proposed:missing.map(m=>({model_id:m.model_id,model_name:name(m.model_id),quantity:m.quantity,limit:m.limit})),note:plan.ok?'':plan.reason});
    continue;
   }
   // No deduction recorded: explain why, model by model.
   const items=await classifyInventoryItems(env,o.raw_text||o.order_notes||'',models);
   if(!items.length){rows.push({...base,kind:base.printed_before_system?'review':'unrecognized',proposed:[],note:'لم يتم التعرف على الموديل من نص الطلب'});continue}
   if(!base.printed_before_system){
    // Printed after activation without a deduction. If today's catalogue recognises the model
    // the deduction should have happened (bug / missing alias at print time).
    rows.push({...base,kind:'bug_not_deducted',proposed:[],per_model:items.map(i=>({model_name:name(i.model_id),quantity:i.quantity,kind:'bug_not_deducted',label:'معروف الآن — لم يُخصم عند الطباعة'})),note:'لا يُضاف للمخزون لأنه لم يُخصم؛ يحتاج تحقيقًا في سبب عدم الخصم'});continue}
   const per=items.map(i=>{const b=lastBaseline(i.model_id,r.created_at);const k=!b?'no_baseline':(o.first_printed_at<b.created_at?'count_excluded':'never_deducted');return {...i,model_name:name(i.model_id),kind:k,baseline_at:b?.local||null}});
   const done=new Map(plan.already.map(a=>[Number(a.model_id),Number(a.quantity)]));
   const proposed=per.filter(p=>p.kind==='count_excluded').map(p=>({model_id:p.model_id,model_name:p.model_name,quantity:Math.max(0,p.quantity-(done.get(Number(p.model_id))||0)),limit:p.quantity})).filter(p=>p.quantity>0);
   const fixed=per.some(p=>p.kind==='count_excluded')&&!proposed.length;
   const kinds=[...new Set(per.map(p=>p.kind))];
   rows.push({...base,kind:fixed?'ok':kinds.length===1?kinds[0]:'mixed',per_model:per.map(p=>({model_name:p.model_name,quantity:p.quantity,kind:p.kind,label:LABEL[p.kind],baseline_at:p.baseline_at})),
    proposed,note:fixed?'أُضيف بتصحيح تاريخي بموافقة المدير':''});
  }
 }
 for(const x of rows)x.label=LABEL[x.kind]||x.kind;
 // Evidence from the movements log and the print history since activation.
 const mv=await env.DB.prepare("SELECT COUNT(*) n,strftime('%d/%m/%Y %H:%M',MIN(created_at),'+3 hours') first,strftime('%d/%m/%Y %H:%M',MAX(created_at),'+3 hours') last,COUNT(DISTINCT order_id) orders FROM inventory_movements WHERE movement_type='order' AND note LIKE 'خصم أول طباعة%'").first();
 const printed=await env.DB.prepare("SELECT COUNT(*) n,SUM(CASE WHEN EXISTS(SELECT 1 FROM inventory_order_items i WHERE i.order_id=o.id) THEN 1 ELSE 0 END) deducted FROM orders o WHERE o.first_printed_at>=?").bind(v2).first();
 const types=(await env.DB.prepare("SELECT movement_type,COUNT(*) n,SUM(quantity_delta) q FROM inventory_movements GROUP BY movement_type").all()).results||[];
 const evidence={activated_at:'22/11/2026 11:49',first_deduction:mv?.first||null,last_deduction:mv?.last||null,deduction_movements:Number(mv?.n||0),deducted_orders:Number(mv?.orders||0),
  printed_since_activation:Number(printed?.n||0),printed_since_activation_deducted:Number(printed?.deducted||0),movement_types:types.map(t=>({type:t.movement_type,count:Number(t.n),quantity:Number(t.q||0)}))};
 const count=k=>rows.filter(x=>x.kind===k).length;
 const proposedPieces=list=>list.reduce((n,x)=>n+x.proposed.reduce((m,p)=>m+p.quantity,0),0);
 const noDed=rows.filter(x=>!x.deducted.length);
 return {deduct_on_print_since:'22/11/2026 11:49',evidence,rows,summary:{closed_shipments:rows.length,ok:count('ok'),missing:count('missing'),missing_pieces:proposedPieces(rows.filter(x=>x.kind==='missing')),
  no_deduction:noDed.length,no_deduction_before_system:noDed.filter(x=>x.printed_before_system).length,
  count_excluded:count('count_excluded')+count('mixed'),count_excluded_pieces:proposedPieces(rows.filter(x=>x.kind==='count_excluded'||x.kind==='mixed')),
  never_deducted:count('never_deducted'),no_baseline:count('no_baseline'),unrecognized:count('unrecognized'),bug_not_deducted:count('bug_not_deducted'),review:count('review'),
  needs_attention:rows.filter(x=>x.kind!=='ok').length,printed_after_activation_without_deduction:noDed.filter(x=>!x.printed_before_system).length}};
}

export async function onRequest({request,env}){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'صلاحية المدير مطلوبة'},403);
 if(request.method==='GET')return json(await audit(env));
 if(request.method!=='POST')return json({error:'طريقة غير مدعومة'},405);
 const b=await request.json().catch(()=>({}));
 if(b.action!=='apply'||b.confirm!=='تطبيق التصحيح')return json({error:'يلزم تأكيد التطبيق'},400);
 const wanted=new Set((Array.isArray(b.items)?b.items:[]).map(x=>Number(x.order_id)).filter(Boolean));
 if(!wanted.size)return json({error:'اختر الطلبات التي توافق على تصحيحها'},400);
 const current=await audit(env);
 const targets=current.rows.filter(r=>wanted.has(r.order_id)&&['missing','count_excluded','mixed'].includes(r.kind)&&r.proposed.length);
 if(!targets.length)return json({ok:true,applied_orders:0,applied_pieces:0,message:'لا توجد فروقات قابلة للتطبيق ضمن الاختيار'});
 // One atomic batch per order; the guarded movements cap the total at the limit.
 for(const r of targets)await env.DB.batch(restockStatements(env,r.order_id,r.proposed,user.id,'تصحيح تاريخي بموافقة المدير — كشف المرتجعات #'+r.report_id+' شحنة '+r.shipment_code+' ('+r.label+')',{sourceRef:'historical_fix:cargo_report:'+r.report_id}));
 const after=await audit(env);
 return json({ok:true,applied_orders:targets.length,applied_pieces:proposedPieces(targets),summary:after.summary});
 function proposedPieces(list){return list.reduce((n,x)=>n+x.proposed.reduce((m,p)=>m+p.quantity,0),0)}
}
