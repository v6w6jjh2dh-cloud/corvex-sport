// Profit by warehouse shipment day (first label print, Amman time).
// Costs are computed on read from each order's own items — nothing stored on
// settled orders or delivery statements is rewritten by this report.
//  - fully delivered: every shipped piece × approved per-piece cost
//  - partial: only the pieces the customer received (partial_received_items)
//  - profit = actual cash from the delivery company − cost (the delivery fee is
//    already deducted inside the cash, so it is never subtracted a second time)
import {classifyInventoryItems,loadInventoryModels} from './_inventory.js';
import {loadCostedModels,approvedCost,canonicalModelName,normalizeArabic,STATI_ALIASES,FILLER_ALIASES,round2} from './_partial-delivery.js';

const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const COHORT_START='2026-11-17';
const MODEL_COSTS=[
 {name:'جاكيت فرو',cost:4},{name:'جاكيت جوخ كاجوال',cost:5.2},{name:'جاكيت جوخ سكايفو',cost:7.55},{name:'مالئ الفراغات',cost:1},
 {name:'بنطلون جيوب سحاب',cost:2.3},{name:'بنطلون رياضة سحاب',cost:2.7},{name:'بنطلون تركي',cost:2.7},{name:'بنطلون زرار',cost:2.2},{name:'بنطلون جيوب',cost:2.2},
 {name:'تيشيرت سادة تريكو',cost:2.5},{name:'بجامة جاكار',cost:4.25},{name:'تيشيرت بولو',cost:3.5}
];
const key=x=>normalizeArabic(x);
const listCost=name=>MODEL_COSTS.find(m=>key(m.name)===key(name))?.cost??null;
// Approved costs first (fur / jokh casual / jokh scarfo incl. stati / gap filler), then the
// report's fixed list, then the catalogue cost when it is set (> 0). Otherwise unknown.
const unitCostFor=(name,catalogueCost)=>approvedCost({name})??listCost(name)??(Number(catalogueCost)>0?Number(catalogueCost):null);

const FALLBACK_MODELS=[
 {id:-1,name:'جاكيت فرو',aliases:['جاكيت فرو','جكيت فرو','جاكيت الفرو','جاكيت فروه']},
 {id:-2,name:'جاكيت جوخ كاجوال',aliases:['جاكيت جوخ كاجوال','جكيت جوخ كاجوال','جاكيت جوخ كاجول','جوخ كاجوال','جاكيت الجوخ الكاجوال']},
 {id:-3,name:'جاكيت جوخ سكايفو',aliases:['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت جوخ سكارفو','جاكيت الجوخ سكارفو','جوخ سكايفو','جوخ سكارفو','جاكيت سكايفو','جاكيت سكارفو','جاكيت نسائي','جكيت نسائي','جاكيت نساءي','جكيت نساءي','جوخ شتائي',...STATI_ALIASES]},
 {id:-4,name:'مالئ الفراغات',aliases:['مالئ الفراغات','مالى الفراغات','ملي الفراغات','مالئ فراغات',...FILLER_ALIASES]},
 {id:-5,name:'بنطلون جيوب سحاب',aliases:['بنطلون جيوب سحاب','جيوب سحاب']},
 {id:-6,name:'بنطلون رياضة سحاب',aliases:['بنطلون رياضة سحاب','بنطلون رياضه سحاب','رياضة سحاب']},
 {id:-7,name:'بنطلون تركي',aliases:['بنطلون تركي']},
 {id:-8,name:'بنطلون زرار',aliases:['بنطلون زرار']},
 {id:-9,name:'بنطلون جيوب',aliases:['بنطلون جيوب']},
 {id:-10,name:'تيشيرت سادة تريكو',aliases:['تيشيرت سادة تريكو','تيشيرت ساده تريكو']},
 {id:-11,name:'بجامة جاكار',aliases:['بجامة جاكار','بجامه جاكار','ترينغ','تريننغ']},
 {id:-12,name:'تيشيرت بولو',aliases:['تيشيرت بولو تريكو','بولو ترند','تيشيرت بولو','بولو']},
 // Models that exist in the app's product catalogue (product-rules.js) with their
 // approved costs but are missing from the server profit_models table.
 {id:-13,name:'تيشيرت برادا',cost:2.4,aliases:['تيشيرت برادا','تيشرت برادا','بلوزه برادا','بلوز برادا','برادا']},
 {id:-14,name:'جاكيت ترند',cost:4,aliases:['جاكيت ترند','جكيت ترند','ترند جاكيت']},
 {id:-15,name:'بلوزة سادة كوم',cost:3.5,aliases:['بلوزه ساده كوم','بلوز ساده كوم','ساده كوم']},
 {id:-16,name:'تيشيرت N',cost:3,aliases:['تيشيرت n','تيشرت n','تيشيرت حرف n','تيشرت حرف n','بلوزه n','حرف n']},
 {id:-17,name:'جاكيت نايك',cost:6,aliases:['جاكيت نايك','جكيت نايك','نايك جاكيت']},
 {id:-18,name:'بلوز صوف',cost:3.5,aliases:['بلوز صوف','بلوزه صوف','صوف بلوز']}
].map(m=>({...m,unit_cost:m.cost??null,aliases:[...new Set(m.aliases.map(key))].sort((a,b)=>b.length-a.length)}));

const BARE_JOKH=/(?:^|[^\p{L}])(?:جكيت|جاكيت|جاكت)\s+جوخ(?![\p{L}])(?!\s*(?:ال)?(?:كاجوال|كاجول|سكايفو|سكارفو|ستا|شتا|نسا))/u;
const QTY_LABEL=/(?:^|[^\p{L}])(?:عدد|العدد|كميه|الكميه|كمية|الكمية)\s*[:：=\-]?\s*(\d{1,2})(?!\d)/u;
// Explicit quantity in a free-text field: «عدد2», «الكمية: 3», «قطعتين», «لونين».
function explicitQuantity(text){
 const t=key(text);const m=t.match(QTY_LABEL);if(m)return Number(m[1]);
 if(/(?:^|\s)(?:قطعتين|قطعتان|حبتين|لونين)(?=\s|$)/.test(t))return 2;
 const u=t.match(/(?:^|\s)(\d{1,2})\s*(?:قطعه|قطع|حبه|حبات)(?=\s|$)/);return u?Number(u[1]):0;
}
const hasQuantityMarker=text=>/(?:عدد|العدد|كميه|كمية|قطعه|قطع|حبه|حبات|قطعتين|قطعتان|لونين|الوان|\d)/.test(key(text).replace(/(?:وزن|الوزن|طول|مقاس|قياس|سعر|السعر)\S*\s*\d+/g,' ').replace(/0?7\d{8}/g,' ').replace(/\d+(?:[.,]\d+)?\s*(?:دينار|دنانير|jd)/gi,' '));
let catalogueError='';
async function loadModels(env){
 let catalogue=[];
 try{catalogue=await loadCostedModels(env)}
 catch(error){
  // A failed one-time catalogue migration must not silently drop the whole catalogue
  // (that leaves only the short fallback list and most orders unrecognised).
  console.error('cohort: catalogue migration failed, loading catalogue directly',error);
  catalogueError=String(error?.message||error);
  try{
   const base=await loadInventoryModels(env);
   const rows=(await env.DB.prepare('SELECT id,name,cost FROM profit_models WHERE active=1').all()).results||[];
   const cost=new Map(rows.map(r=>[Number(r.id),Number(r.cost||0)]));
   catalogue=base.map(m=>({...m,unit_cost:approvedCost({name:m.name})??cost.get(m.id)??0}));
  }catch(inner){catalogueError+=' | '+String(inner?.message||inner);catalogue=[]}
 }
 const names=new Set(catalogue.map(m=>key(canonicalModelName(m.name))));
 // Merge approved aliases even when a catalogue row already exists.
 const enriched=catalogue.map(m=>{
  const fallback=FALLBACK_MODELS.find(f=>key(f.name)===key(canonicalModelName(m.name)));
  return fallback?{...m,aliases:[...new Set([...(m.aliases||[]),...fallback.aliases])].sort((a,b)=>b.length-a.length)}:m;
 });
 return [...enriched,...FALLBACK_MODELS.filter(m=>!names.has(key(m.name)))];
}
// One line per canonical model (stati is folded into scarfo); quantities summed, never duplicated.
function mergeItems(raw,models){
 const byName=new Map();
 for(const x of raw){
  const model=models.find(m=>m.id===Number(x.model_id))||{};
  const name=canonicalModelName(x.name||model.name||'موديل غير معروف');
  const unit=unitCostFor(name,model.unit_cost);
  const prev=byName.get(key(name))||{model_id:Number(x.model_id),name,quantity:0,received:0,unit_cost:unit};
  prev.quantity+=Number(x.quantity||0);prev.received+=Number(x.received??x.quantity??0);
  byName.set(key(name),prev);
 }
 return [...byName.values()].map(i=>({...i,total_cost:i.unit_cost===null?null:round2(i.quantity*i.unit_cost),received_cost:i.unit_cost===null?null:round2(i.received*i.unit_cost)}));
}
async function receivedItems(env,order,models){
 const raw=String(order.partial_received_items||'').trim();if(!raw)return null;
 let parsed=null;try{parsed=JSON.parse(raw)}catch{}
 if(Array.isArray(parsed)){
  const list=parsed.map(x=>({model_id:Number(x.model_id||0),name:x.model_name||'',quantity:Number(x.shipped??x.quantity??0),received:Number(x.received??x.quantity??0)}));
  if(list.some(x=>!Number.isFinite(x.received)||x.received<0))return null;
  return mergeItems(list,models);
 }
 const matches=await classifyInventoryItems(env,raw,models);
 return matches.length?mergeItems(matches.map(x=>({...x,received:x.quantity})),models):null;
}

const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
async function auth(request,env){const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return null;return env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(token).first()}
const AD_TABLE="CREATE TABLE IF NOT EXISTS shipping_cohort_ad_spend (date TEXT NOT NULL,store_id INTEGER NOT NULL,amount REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(date,store_id))";

export async function onRequest({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const url=new URL(request.url);let date=url.searchParams.get('date'),store=Number(url.searchParams.get('store_id')||0);
 if(request.method==='POST'){
  if(me.role!=='admin')return json({error:'المدير فقط يستطيع حفظ الإعلان'},403);
  let b;try{b=await request.json()}catch{return json({error:'طلب غير صالح'},400)}
  if(b.action==='recalculate_delivered_costs')return json({error:'الكوست يُحسب الآن مباشرة من أصناف كل طلب عند فتح التقرير، ولا يتم تعديل الطلبات المسكّرة.'},410);
  date=b.date;store=Number(b.store_id||0);const amount=Number(b.ad_spend);
  if(!validDate(date)||date<COHORT_START||!Number.isSafeInteger(store)||store<0||!Number.isFinite(amount)||amount<0||amount>10000000)return json({error:'تاريخ أو مبلغ غير صالح'},400);
  await env.DB.prepare(AD_TABLE).run();
  await env.DB.prepare("INSERT INTO shipping_cohort_ad_spend(date,store_id,amount) VALUES(?,?,?) ON CONFLICT(date,store_id) DO UPDATE SET amount=excluded.amount,updated_at=datetime('now')").bind(date,store,amount).run();
  return json({ok:true});
 }
 if(request.method!=='GET')return json({error:'طريقة غير مدعومة'},405);
 // One shipment day only: the report never spans a range of days.
 const toDate=date;
 if(!validDate(date)||!validDate(toDate)||toDate<date||!Number.isSafeInteger(store)||store<0)return json({error:'تاريخ غير صالح'},400);
 await env.DB.prepare(AD_TABLE).run();
 const where="date(o.first_printed_at,'+3 hours') BETWEEN ? AND ?"+(store?" AND o.store_id=?":"");
 const args=store?[date,toDate,store]:[date,toDate];
 const orders=(await env.DB.prepare(`SELECT o.id,o.order_code,o.delivery_status,o.delivery_company_settled,o.delivery_company_settlement_id,o.delivered_amount,o.cash_collected,o.amount,o.cost_of_goods,o.delivery_fee,o.raw_text,o.order_notes,o.partial_received_items,o.delivered_pieces,o.settlement_note,o.profit_reviewed_settlement_id,o.first_printed_at,date(o.first_printed_at,'+3 hours') shipment_day,o.store_id,so.imported_amount AS statement_amount,so.imported_status AS statement_status,so.match_type AS statement_match_type,ds.settlement_code AS statement_code,ds.source_name AS statement_source,date(ds.created_at,'+3 hours') AS statement_closed_on FROM orders o LEFT JOIN delivery_company_settlement_orders so ON so.rowid=(SELECT MAX(so2.rowid) FROM delivery_company_settlement_orders so2 WHERE so2.order_id=o.id AND so2.settlement_id=o.delivery_company_settlement_id) LEFT JOIN delivery_company_settlements ds ON ds.id=o.delivery_company_settlement_id WHERE o.first_printed_at IS NOT NULL AND ${where} ORDER BY o.id DESC`).bind(...args).all()).results||[];
 catalogueError='';const models=await loadModels(env);

 const inventory=new Map();
 try{
  const rows=(await env.DB.prepare(`SELECT i.order_id,i.model_id,i.quantity,m.name AS model_name FROM inventory_order_items i LEFT JOIN profit_models m ON m.id=i.model_id JOIN orders o ON o.id=i.order_id WHERE o.first_printed_at IS NOT NULL AND ${where}`).bind(...args).all()).results||[];
  for(const r of rows){const id=Number(r.order_id);if(!inventory.has(id))inventory.set(id,[]);inventory.get(id).push({model_id:Number(r.model_id),name:r.model_name||'',quantity:Number(r.quantity||0)})}
 }catch{}

 const deliveredStatuses=new Set(['delivered','delivered_adjusted','partial']);
 let returnCash=0,returnsUnproven=0,deliveredUnsettled=0,costReviewCount=0,receivedPieces=0,piecesUnknown=0,cashDiscrepancy=0,cashMismatchOrders=0,delivered=0,partial=0,returned=0,refusedWithFee=0,noReplyAfterArrival=0,otherReturns=0,pending=0,other=0,unreviewed=0,sales=0,cash=0,costs=0,fees=0,knownProfit=0,knownOrders=0;
 const details=[];
 for(const o of orders){
  // The order stays on its warehouse shipment day; its result comes from whichever closed
  // statement (any later date) settled it. Without a closed statement it stays pending.
  const status=o.delivery_status||'pending',settled=Number(o.delivery_company_settled||0)===1;
  const isPartial=status==='partial'||status==='delivered_adjusted',isDelivered=deliveredStatuses.has(status)&&settled;
  const RETURN=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival','returned']);
  let reviewed=!isPartial||(Number(o.delivery_company_settlement_id||0)>0&&Number(o.profit_reviewed_settlement_id||0)===Number(o.delivery_company_settlement_id));
  // Shipped items: read from the order's own text with the current catalogue; the
  // print-time inventory allocation is used only when the text cannot be read.
  // Notes and original order text are independent sources. A nonempty note may
  // contain only delivery instructions; never let it hide the product in raw_text.
  // Do not concatenate the sources: that would count the same item twice.
  let items=[],itemSource='none';
  const trace=[];
  const sources=[['order_notes',String(o.order_notes||'')],['raw_text',String(o.raw_text||'')]];
  for(const [source,text] of sources){
   if(!text.trim()){trace.push({source,empty:true});continue}
   const parsed=await classifyInventoryItems(env,text,models);
   trace.push({source,found:parsed.map(x=>({name:(models.find(m=>m.id===Number(x.model_id))||{}).name||String(x.model_id),quantity:x.quantity}))});
   if(!parsed.length)continue;
   let list=parsed;
   // Quantity written only in the other field («عدد2» in notes, product in raw_text):
   // use it for a single-model order whose own text carries no quantity at all.
   // The sources are never added together, so the same piece is not counted twice.
   const other=sources.find(([name])=>name!==source)[1];
   if(parsed.length===1&&parsed[0].quantity===1&&!hasQuantityMarker(text)&&other.trim()&&!(await classifyInventoryItems(env,other,models)).length){
    const q=explicitQuantity(other);if(q>1){list=[{...parsed[0],quantity:q}];trace.push({source:'quantity_from_'+sources.find(([name])=>name!==source)[0],quantity:q})}
   }
   items=mergeItems(list,models);itemSource=source;break;
  }
  // «جكيت جوخ» / «جاكيت جوخ» with no model word is jokh scarfo only for a single piece.
  if(!items.length){
   const scarfo=models.find(m=>key(canonicalModelName(m.name))===key('جاكيت جوخ سكايفو'));
   for(const [source,text] of sources){
    if(!scarfo||!text.trim()||!BARE_JOKH.test(key(text)))continue;
    const probe=await classifyInventoryItems(env,text,[{id:scarfo.id,name:scarfo.name,aliases:['جاكيت جوخ','جكيت جوخ','جاكت جوخ']}]);
    const other=sources.find(([name])=>name!==source)[1];
    const otherQ=explicitQuantity(other);
    const q=probe.reduce((n,x)=>n+x.quantity,0);
    trace.push({source:source+'_bare_jokh',quantity:q,other_quantity:otherQ});
    if(probe.length===1&&q===1&&otherQ<=1){items=mergeItems([{model_id:scarfo.id,name:scarfo.name,quantity:1}],models);itemSource=source+'_bare_jokh_single'}
    break;
   }
  }
  if(!items.length&&inventory.get(Number(o.id))?.length){items=mergeItems(inventory.get(Number(o.id)),models);itemSource='inventory'}
  const itemsValid=items.length>0&&items.every(i=>Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=50);
  const shippedPieces=items.reduce((n,i)=>n+i.quantity,0);
  const storedCost=Number(o.cost_of_goods),hasStored=Number.isFinite(storedCost)&&storedCost>0;
  let cost=null,source='unknown',pieces=null,missing='',received=null;
  if(!isPartial){
   if(itemsValid&&items.every(i=>i.unit_cost!==null)){cost=round2(items.reduce((n,i)=>n+i.total_cost,0));source='order_items';pieces=shippedPieces}
   else if(hasStored){cost=storedCost;source='saved_order';pieces=itemsValid?shippedPieces:null;missing=itemsValid?'كوست قطعة غير معتمد — تم استخدام الكوست المحفوظ':'لم يُقرأ الصنف — تم استخدام الكوست المحفوظ'}
   else missing=!itemsValid?'لم يتم التعرف على الصنف أو الكمية من نص الطلب':`لا يوجد كوست معتمد لـ ${items.filter(i=>i.unit_cost===null).map(i=>i.name).join('، ')}`;
  }else{
   received=await receivedItems(env,o,models);
   const recPieces=received?received.reduce((n,i)=>n+i.received,0):null;
   if(received&&recPieces>0&&received.every(i=>i.unit_cost!==null)){cost=round2(received.reduce((n,i)=>n+i.received_cost,0));source='received_items';pieces=recPieces}
   // A two-piece, single-model partial delivery has exactly one received and
   // one returned piece. Never infer this for mixed models or larger orders.
   else if(!received&&itemsValid&&items.length===1&&shippedPieces===2&&
           (!Number(o.delivered_pieces)||Number(o.delivered_pieces)===1)&&
           items[0].unit_cost!==null){
    received=mergeItems([{model_id:items[0].model_id,name:items[0].name,quantity:2,received:1}],models);
    cost=round2(items[0].unit_cost);source='inferred_single_model_partial';pieces=1;
   }
   else if(reviewed&&hasStored){cost=storedCost;source='saved_partial_review';pieces=Number(o.delivered_pieces||0)||recPieces||null;missing=received?'':'القطع المستلمة غير مفصلة — تم استخدام كوست المراجعة المحفوظ'}
   else missing=received?'كوست إحدى القطع المستلمة غير معتمد':'لم تُحدد القطع المستلمة لهذا التسليم الجزئي';
  }
  const costKnown=cost!==null&&Number.isFinite(cost);
  // A settled partial delivery whose received pieces are known (stored items or the
  // two-identical-pieces rule) uses the statement's actual cash; no manual review needed.
  if(isPartial&&settled&&costKnown&&(source==='received_items'||source==='inferred_single_model_partial'))reviewed=true;
  let profit=null;
  if(isDelivered){
   delivered++;if(isPartial)partial++;
   if(reviewed){
    const amount=Number(o.delivered_amount||0),fee=Number(o.delivery_fee||0),actualCash=Number(o.cash_collected||0);
    const difference=round2(actualCash-(amount-fee));
    if(Math.abs(difference)>=.01){cashMismatchOrders++;cashDiscrepancy+=difference}
    sales+=amount;cash+=actualCash;fees+=fee;
    if(costKnown){costs+=cost;profit=round2(actualCash-cost);knownProfit+=profit;knownOrders++}
   }else{unreviewed++;if(!missing)missing='تسليم جزئي غير مراجع في تسكير الكشف'}
   if(!costKnown||!reviewed)costReviewCount++;
   if(pieces===null)piecesUnknown++;else receivedPieces+=pieces;
  }else if(deliveredStatuses.has(status)){deliveredUnsettled++;pending++;missing='حالة تسليم بدون كشف مسكّر — معلّق'}
  else if(RETURN.has(status)&&settled){
   // Return result as proven by the closed statement: the stored statement net
   // (0 when the customer paid the fee, −fee when we pay it). No goods cost.
   let rc=Number(o.cash_collected||0);
   if(status==='refused_no_fee'&&Math.abs(rc)<.001){rc=-Math.abs(Number(o.delivery_fee||0)||2)}
   returnCash+=rc;o.__returnCash=round2(rc);
   if(status==='refused_fee_paid')refusedWithFee++;else if(status==='refused_no_fee')noReplyAfterArrival++;else otherReturns++;
   returned++;
  }
  else if(RETURN.has(status)){returnsUnproven++;pending++;missing='مرتجع بدون كشف مسكّر — معلّق'}
  else if(status==='pending')pending++;
  else other++;
  const needsDiagnostics=me.role==='admin'&&isDelivered&&(cost===null||!itemsValid);
  details.push({diagnostics:needsDiagnostics?{order_notes:String(o.order_notes||'').slice(0,700),raw_text:String(o.raw_text||'').slice(0,700),inventory_items:(inventory.get(Number(o.id))||[]).map(i=>({name:i.name,quantity:i.quantity})),trace,invisible_chars:/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\u00a0]/.test(String(o.raw_text||'')+String(o.order_notes||''))}:null,id:o.id,order_code:o.order_code,shipment_day:o.shipment_day,status,settled,reviewed,result:isDelivered?'delivered':o.__returnCash!==undefined?'return':'pending',return_cash:o.__returnCash??null,pending_reason:!isDelivered&&o.__returnCash===undefined?(missing||(status==='pending'?'قيد التوصيل — لم يظهر في كشف مسكّر بعد':'')):'',statement_closed_on:o.statement_closed_on||null,
   items,item_source:itemSource,item_quantity:shippedPieces,received_items:received,received_pieces:isDelivered?pieces:null,
   cost_of_goods:Number(o.cost_of_goods||0),calculated_cost:isDelivered?cost:null,cost_source:source,cost_difference:hasStored&&costKnown&&source!=='saved_order'&&source!=='saved_partial_review'?round2(storedCost-cost):null,
   cost_needs_review:isDelivered&&(!costKnown||!reviewed),missing_reason:isDelivered&&(!costKnown||!reviewed)?missing:'',cost_note:isDelivered&&costKnown?missing:'',
   statement_code:o.statement_code||null,statement_source:o.statement_source||null,statement_amount:o.statement_amount==null?null:Number(o.statement_amount),statement_status:o.statement_status||null,statement_match_type:o.statement_match_type||null,
   profit,cash:isDelivered&&reviewed?Number(o.cash_collected||0):null,amount:isDelivered&&reviewed?Number(o.delivered_amount||0):null,fee:isDelivered&&reviewed?Number(o.delivery_fee||0):null,
   cash_difference:isDelivered&&reviewed?round2(Number(o.cash_collected||0)-(Number(o.delivered_amount||0)-Number(o.delivery_fee||0))):null});
 }
 const spendArgs=store?[date,toDate,store]:[date,toDate,0];
 const spend=(await env.DB.prepare("SELECT COALESCE(SUM(amount),0) amount FROM shipping_cohort_ad_spend WHERE date BETWEEN ? AND ? AND store_id=?").bind(...spendArgs).first())?.amount||0;
 const gross=costReviewCount?null:round2(cash-costs+returnCash);
 return json({engine:'cohort-v4.2',catalogue_error:catalogueError||null,return_cash:round2(returnCash),returns_unproven:returnsUnproven,delivered_unsettled:deliveredUnsettled,known_profit_with_returns:round2(knownProfit+returnCash),model_costs:MODEL_COSTS,costs_verified:costReviewCount===0,date,to_date:toDate,store_id:store,total:orders.length,delivered,partial,returned,refused_with_fee:refusedWithFee,no_reply_after_arrival:noReplyAfterArrival,other_returns:otherReturns,pending,other,unreviewed,
  cost_review_count:costReviewCount,received_pieces:receivedPieces,pieces_unknown_orders:piecesUnknown,delivered_pieces_mapped:receivedPieces,
  sales:round2(sales),cash:round2(cash),costs:round2(costs),fees:round2(fees),cash_difference:round2(cashDiscrepancy),cash_mismatch_orders:cashMismatchOrders,
  gross_profit:gross,known_profit:round2(knownProfit),known_profit_orders:knownOrders,ad_spend:Number(spend),net_after_ads:gross===null?null:round2(gross-Number(spend)),
  complete:pending===0&&other===0&&unreviewed===0,orders:details});
}
