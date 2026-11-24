import {classifyInventoryItems,loadInventoryModels,returnRestockPlan,restockStatements,ensureInventorySchema} from './_inventory.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const phone=x=>{let s=String(x??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');if(s.startsWith('00962'))s=s.slice(2);if(s.startsWith('962'))s='0'+s.slice(3);if(s.length===9&&s.startsWith('7'))s='0'+s;return s};
const txt=(x,n=200)=>String(x??'').trim().slice(0,n);
const ORDER_INFO="SELECT id,order_code,phone,recipient_name,area,delivery_status,raw_text,order_notes,first_printed_at,date(first_printed_at,'+3 hours') AS shipment_print_date,strftime('%d/%m/%Y %H:%M',first_printed_at,'+3 hours') AS shipment_print_at FROM orders WHERE id=?";
const outcomeOf=r=>r.status==='matched'?(r.order_status==='pending'?'closed':'pending'):r.status==='ambiguous'||r.status==='review_model'?'pending':r.status==='ignored'?'ignored':'unmatched';
const countShipments=list=>({total:list.length,matched:list.filter(x=>x.match_status==='matched').length,closed:list.filter(x=>x.outcome==='closed').length,pending:list.filter(x=>x.outcome==='pending').length,unmatched:list.filter(x=>x.outcome==='unmatched').length,ignored:list.filter(x=>x.outcome==='ignored').length});
async function orderSnapshot(env,id,models){
 const o=id?await env.DB.prepare(ORDER_INFO).bind(id).first():null;if(!o)return null;
 let items=[];try{items=(await classifyInventoryItems(env,o.raw_text||o.order_notes||'',models)).map(i=>({model_name:(models.find(m=>m.id===i.model_id)||{}).name||'',quantity:i.quantity}))}catch{}
 return {order_id:Number(o.id),order_code:o.order_code,phone:o.phone,recipient_name:o.recipient_name||'',area:o.area||'',items,shipment_print_date:o.shipment_print_date||null,shipment_print_at:o.shipment_print_at||null,current_status:o.delivery_status};
}
// Stock state of one shipment, from the inventory movements actually recorded (never
// inferred from the order status). Colours: added/added_before green, review orange,
// no_deduction/missing red, waiting grey.
const hasCode=(note,code)=>code&&new RegExp('(^|\\s)'+String(code).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\s|$)').test(String(note||''));
async function stockStatus(env,s,reportId,models){
 const name=id=>(models.find(m=>m.id===Number(id))||{}).name||('موديل '+id);
 const group=list=>{const m=new Map();for(const x of list)m.set(Number(x.model_id),(m.get(Number(x.model_id))||0)+Number(x.quantity_delta));return [...m].map(([id,q])=>({model_id:id,model_name:name(id),quantity:q}))};
 if(!s.order_id||s.outcome==='unmatched'||s.outcome==='ignored')return {state:'waiting',label:'بانتظار المطابقة والتسكير',items:[]};
 if(s.outcome!=='closed'){
  if(/تفصيل|الموديل|مراجعة منفصلة/.test(s.note||''))return {state:'review',label:'تحتاج مراجعة – لم يتم التعرف على الموديل أو الكمية',items:[]};
  return {state:'waiting',label:'بانتظار المطابقة والتسكير',items:[]};
 }
 const moves=(await env.DB.prepare("SELECT model_id,quantity_delta,source_ref,note,strftime('%d/%m/%Y %H:%M',created_at,'+3 hours') at FROM inventory_movements WHERE order_id=? AND movement_type='cargo_return' AND quantity_delta>0 ORDER BY id").bind(s.order_id).all()).results||[];
 const own=m=>m.source_ref==='cargo_report:'+reportId||m.source_ref==='historical_fix:cargo_report:'+reportId||(!m.source_ref&&hasCode(m.note,s.shipment_code));
 const mine=moves.filter(own),others=moves.filter(m=>!own(m));
 if(mine.length){const items=group(mine),q=items.reduce((n,i)=>n+i.quantity,0);return {state:'added',label:'تمت إضافة +'+q+' للمخزون',items,at:mine[mine.length-1].at,fix:mine.some(m=>String(m.source_ref||'').startsWith('historical_fix'))}}
 const order=await env.DB.prepare('SELECT id,delivery_status,partial_received_items FROM orders WHERE id=?').bind(s.order_id).first();
 const plan=order?await returnRestockPlan(env,order,models):{allocated:[],ok:false};
 if(!plan.allocated.length)return {state:'no_deduction',label:'لم تتم الإضافة – لا يوجد خصم أصلي مسجل',items:[]};
 if(others.length&&plan.ok&&!plan.items.length){const items=group(others);return {state:'added_before',label:'تمت إضافتها سابقًا، لم تتكرر الإضافة',items,at:others[others.length-1].at}}
 if(!plan.ok)return {state:'review',label:'تحتاج مراجعة – '+plan.reason,items:[]};
 return {state:'missing',label:'لم تُضف للمخزون بعد – تظهر في تدقيق الفروقات',items:plan.items.map(i=>({model_id:i.model_id,model_name:name(i.model_id),quantity:i.quantity}))};
}
// Read-only view of one saved report. Reports saved before shipment snapshots existed
// (details without "shipments") are shown from their saved closed/skipped lists, with
// customer, area, models and print date looked up from the order (nothing is changed).
async function reportDetail(env,row){
 const details=JSON.parse(row.details_json||'{}');
 const models=await loadInventoryModels(env).catch(()=>[]);
 let shipments=Array.isArray(details.shipments)?details.shipments:null,legacy=false;
 if(!shipments){
  legacy=true;
  shipments=[...(details.closed||[]).map(x=>({...x,match_status:'matched',outcome:'closed',status_at_close:x.previous_status||'pending',new_status:x.new_status||'returned',note:'تم التحويل إلى مرتجع'})),
   ...(details.skipped||[]).map(x=>({...x,match_status:x.order_id?'matched':'unknown',outcome:'pending',status_at_close:x.current_status||'',note:x.reason||''}))];
 }
 await ensureInventorySchema(env);
 const out=[];
 for(const s of shipments){
  const live=Number(s.order_id)?await orderSnapshot(env,Number(s.order_id),models):null;
  const stock=await stockStatus(env,s,row.id,models);
  out.push({...s,
   recipient_name:s.recipient_name||live?.recipient_name||'',area:s.area||live?.area||'',
   items:Array.isArray(s.items)&&s.items.length?s.items:(live?.items||[]),
   shipment_print_at:s.shipment_print_at||live?.shipment_print_at||null,shipment_print_date:s.shipment_print_date||live?.shipment_print_date||null,
   order_code:s.order_code||live?.order_code||null,phone:s.phone||live?.phone||'',
   current_status:live?.current_status||null,looked_up:legacy||!s.recipient_name,stock,
   proven_label:s.outcome==='closed'?(['partial','delivered_adjusted'].includes(live?.current_status)?'تسليم جزئي – مرتجع القطع':'مرتجع مثبت'):null});
 }
 const counts=details.counts||countShipments(out);if(legacy){counts.unmatched=null;counts.ignored=null}
 const added=new Map(),before=new Map();
 for(const x of out){const t=x.stock?.state==='added'?added:x.stock?.state==='added_before'?before:null;if(t)for(const i of x.stock.items)t.set(i.model_name,(t.get(i.model_name)||0)+i.quantity)}
 const sum=m=>[...m.values()].reduce((a,b)=>a+b,0);
 const stockSummary={closed:out.filter(x=>x.outcome==='closed').length,added_pieces:sum(added),added_before_pieces:sum(before),review:out.filter(x=>['review','missing','no_deduction'].includes(x.stock?.state)).length,by_model:[...added].map(([model_name,quantity])=>({model_name,quantity}))};
 return {id:row.id,created_at:row.created_at,source_name:row.source_name,legacy,counts,stock_summary:stockSummary,legacy_note:legacy?'كشف قديم: محفوظ فيه الطلبات المسكّرة والمستثناة فقط؛ الاسم والمنطقة والموديل وتاريخ الطباعة معروضة من بيانات الطلب للمراجعة.':'',shipments:out};
}
export async function onRequest({request,env}){
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'admin_required'},403);
 const ensureReports=async()=>env.DB.prepare("CREATE TABLE IF NOT EXISTS cargo_return_close_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by INTEGER NOT NULL, source_name TEXT NOT NULL DEFAULT '', matched_count INTEGER NOT NULL DEFAULT 0, closed_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, details_json TEXT NOT NULL DEFAULT '{}')").run();
 await ensureReports();
 if(request.method==='GET'){
  const reportId=Number(new URL(request.url).searchParams.get('id')||0);
  if(reportId){
   const row=await env.DB.prepare("SELECT id,created_at,source_name,matched_count,closed_count,skipped_count,details_json FROM cargo_return_close_reports WHERE id=?").bind(reportId).first();
   if(!row)return json({error:'not_found'},404);
   return json({report:await reportDetail(env,row)});
  }
  const result=await env.DB.prepare("SELECT id,created_at,source_name,matched_count,closed_count,skipped_count,details_json FROM cargo_return_close_reports ORDER BY id DESC LIMIT 80").all();
  return json({reports:(result.results||[]).map(r=>{let d={};try{d=JSON.parse(r.details_json||'{}')}catch{}
   const legacy=!Array.isArray(d.shipments);
   const counts=d.counts||(legacy?{total:null,matched:(d.closed||[]).length+(d.skipped||[]).filter(x=>x.order_id).length,closed:(d.closed||[]).length,pending:(d.skipped||[]).length,unmatched:null,ignored:null}:countShipments(d.shipments));
   return {id:r.id,created_at:r.created_at,source_name:r.source_name,matched_count:r.matched_count,closed_count:r.closed_count,skipped_count:r.skipped_count,legacy,counts,details:{closed:d.closed||[],skipped:d.skipped||[]}}})});
 }
 let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
 const rows=body.rows;
 if(!Array.isArray(rows)||!rows.length||rows.length>500)return json({error:'invalid_rows'},400);
 const unique=new Set(),accepted=[],skipped=[];
 const invModels=await loadInventoryModels(env).catch(()=>[]);
 const modelName=id=>(invModels.find(m=>m.id===Number(id))||{}).name||('موديل '+id);
 const RESTOCK_ONLY=new Set(['returned','partial','delivered_adjusted','refused_fee_paid','refused_no_fee','canceled_before_arrival']);
 for(const row of rows){
  const id=Number(row.order_id),code=String(row.shipment_code||'').trim(),p=phone(row.phone);
  if(!Number.isSafeInteger(id)||id<=0||!code||!p||unique.has(id)){skipped.push({order_id:id,reason:'بيانات ناقصة أو طلب مكرر'});continue}
  unique.add(id);
  const o=await env.DB.prepare("SELECT id,order_code,phone,delivery_status,partial_received_items FROM orders WHERE id=? AND date(COALESCE(first_printed_at,created_at),'+3 hours')>='2026-11-17'").bind(id).first();
  if(!o||phone(o.phone)!==p){skipped.push({order_id:id,shipment_code:code,reason:'رقم الهاتف لا يطابق الطلب'});continue}
  if(o.delivery_status!=='pending'&&!RESTOCK_ONLY.has(o.delivery_status)){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'الطلب مسجل كمستلم؛ يحتاج مراجعة ولا يتغير تلقائيًا'});continue}
  // Closing the returns statement = the goods are physically back in the warehouse.
  const plan=await returnRestockPlan(env,o,invModels);
  // Already fully added back (receipt / earlier statement): still closed here, shown as
  // «تمت إضافتها سابقًا» — the guarded movements make a second addition impossible.
  if(o.delivery_status!=='pending'&&!plan.ok){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:plan.reason});continue}
  accepted.push({id,code,phone:p,order_code:o.order_code,previous_status:o.delivery_status,changeStatus:o.delivery_status==='pending',restock:plan.ok?plan.items:[],restockNote:plan.ok?plan.reason:plan.reason});
 }
 if(!accepted.length)return json({ok:true,updated:0,restocked_pieces:0,skipped,report_id:null});
 const sourceName=String(body.source_name||'').slice(0,180);
 const pendingRows=Array.isArray(body.pending_rows)?body.pending_rows.slice(0,500):[];
 for(const row of pendingRows){skipped.push({order_id:Number(row.order_id)||null,order_code:String(row.order_code||''),shipment_code:String(row.shipment_code||''),current_status:String(row.order_status||''),reason:String(row.reason||'شحنة معلّقة تحتاج مراجعة')})}
 const closed=accepted.map(x=>({order_id:x.id,order_code:x.order_code,shipment_code:x.code,phone:x.phone,previous_status:x.previous_status,new_status:x.changeStatus?'returned':x.previous_status,
  stock_added:x.restock.map(i=>({model_id:i.model_id,model_name:modelName(i.model_id),quantity:i.quantity})),stock_note:x.restock.length?'':x.restockNote}));
 // Full snapshot of every shipment in the statement, saved with the report so it can be
 // reviewed later exactly as it was at closing time (display only).
 const models=await loadInventoryModels(env).catch(()=>[]);
 const closedIds=new Set(accepted.map(x=>x.id));
 const snap=Array.isArray(body.snapshot_rows)?body.snapshot_rows.slice(0,800):[];
 const shipments=[];
 for(const r of snap){
  const id=Number(r.order_id)||0,isClosed=id&&closedIds.has(id);
  const order=id?await orderSnapshot(env,id,models):null;
  const skip=skipped.find(x=>Number(x.order_id)===id&&id);
  const outcome=isClosed?'closed':(skip||outcomeOf(r)==='closed')?'pending':outcomeOf(r);
  shipments.push({shipment_code:txt(r.shipment_code,80),order_id:order?.order_id||null,order_code:order?.order_code||txt(r.order_code,40)||null,candidate_codes:Array.isArray(r.candidate_codes)?r.candidate_codes.slice(0,10).map(x=>txt(x,40)):[],
   candidates:Array.isArray(r.candidates)?r.candidates.slice(0,10).map(c=>({order_code:txt(c.order_code,40),recipient_name:txt(c.recipient_name,80),area:txt(c.area,80),shipment_print_at:txt(c.shipment_print_at,20)||null,shipment_print_date:txt(c.shipment_print_date,10)||null,delivery_status:txt(c.delivery_status,30)})):[],
   phone:txt(r.phone,20),recipient_name:order?.recipient_name||'',area:order?.area||'',cargo_area:txt(r.area,80),
   items:Array.isArray(r.items)&&r.items.length?r.items.slice(0,20).map(i=>({model_name:txt(i.model_name,80),quantity:Number(i.quantity)||0})):(order?.items||[]),
   shipment_print_date:order?.shipment_print_date||null,shipment_print_at:order?.shipment_print_at||null,
   match_status:txt(r.status,20),outcome,status_at_close:order?.current_status||txt(r.order_status,30)||null,new_status:isClosed?(closed.find(c=>c.order_id===id)?.new_status||'returned'):null,
   return_status:txt(r.return_status,120),note:txt(skip?.reason||(isClosed?'':r.reason),300)});
 }
 const counts=shipments.length?countShipments(shipments):null;
 const details=JSON.stringify(shipments.length?{version:2,closed,skipped,shipments,counts}:{closed,skipped});
 // Record the report in the same D1 batch as status updates.
 // One D1 batch (one transaction): the report row, the status changes and the guarded
 // stock movements commit together or not at all. Movements carry source_ref of this report.
 const statements=[env.DB.prepare("INSERT INTO cargo_return_close_reports(created_by,source_name,matched_count,closed_count,skipped_count,details_json) VALUES(?,?,?,?,?,?)").bind(user.id,sourceName,accepted.length,accepted.length,skipped.length,details)];
 const REPORT_REF="'cargo_report:'||(SELECT MAX(id) FROM cargo_return_close_reports)";
 for(const x of accepted){
  if(x.changeStatus)statements.push(env.DB.prepare("UPDATE orders SET delivery_status='returned',updated_at=datetime('now') WHERE id=? AND delivery_status='pending'").bind(x.id));
  statements.push(...restockStatements(env,x.id,x.restock,user.id,'استلام مرتجع بتسكير كشف المرتجعات — شحنة '+x.code,{sourceRefSql:REPORT_REF}));
 }
 const result=await env.DB.batch(statements);
 const reportId=result[0]?.meta?.last_row_id||null;
 const updated=accepted.filter(x=>x.changeStatus).length;
 // Report only what the database actually recorded for this closing.
 const proof=(await env.DB.prepare("SELECT COALESCE(SUM(quantity_delta),0) q FROM inventory_movements WHERE source_ref=? AND movement_type='cargo_return'").bind('cargo_report:'+reportId).first())?.q||0;
 return json({ok:true,updated,closed_count:accepted.length,restocked_pieces:Number(proof),closed,skipped,report_id:reportId});
}
