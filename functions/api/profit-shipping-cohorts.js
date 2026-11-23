// Profit by warehouse shipment day (first label print, Amman time).
// Costs are computed on read from each order's own items — nothing stored on
// settled orders or delivery statements is rewritten by this report.
//  - fully delivered: every shipped piece × approved per-piece cost
//  - partial: only the pieces the customer received (partial_received_items)
//  - profit = actual cash from the delivery company − cost (the delivery fee is
//    already deducted inside the cash, so it is never subtracted a second time)
import {classifyInventoryItems} from './_inventory.js';
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
 {id:-3,name:'جاكيت جوخ سكايفو',aliases:['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت جوخ سكارفو','جاكيت الجوخ سكارفو','جوخ سكايفو','جوخ سكارفو','جاكيت سكايفو','جاكيت سكارفو','جاكيت نسائي','جكيت نسائي','جوخ شتائي',...STATI_ALIASES]},
 {id:-4,name:'مالئ الفراغات',aliases:['مالئ الفراغات','مالى الفراغات','ملي الفراغات','مالئ فراغات',...FILLER_ALIASES]},
 {id:-5,name:'بنطلون جيوب سحاب',aliases:['بنطلون جيوب سحاب','جيوب سحاب']},
 {id:-6,name:'بنطلون رياضة سحاب',aliases:['بنطلون رياضة سحاب','بنطلون رياضه سحاب','رياضة سحاب']},
 {id:-7,name:'بنطلون تركي',aliases:['بنطلون تركي']},
 {id:-8,name:'بنطلون زرار',aliases:['بنطلون زرار']},
 {id:-9,name:'بنطلون جيوب',aliases:['بنطلون جيوب']},
 {id:-10,name:'تيشيرت سادة تريكو',aliases:['تيشيرت سادة تريكو','تيشيرت ساده تريكو']},
 {id:-11,name:'بجامة جاكار',aliases:['بجامة جاكار','بجامه جاكار','ترينغ','تريننغ']},
 {id:-12,name:'تيشيرت بولو',aliases:['تيشيرت بولو تريكو','بولو ترند','تيشيرت بولو','بولو']}
].map(m=>({...m,unit_cost:null,aliases:[...new Set(m.aliases.map(key))].sort((a,b)=>b.length-a.length)}));

async function loadModels(env){
 let catalogue=[];try{catalogue=await loadCostedModels(env)}catch{catalogue=[]}
 const names=new Set(catalogue.map(m=>key(canonicalModelName(m.name))));
 return [...catalogue,...FALLBACK_MODELS.filter(m=>!names.has(key(m.name)))];
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
 let toDate=url.searchParams.get('to_date')||date;
 if(!validDate(date)||!validDate(toDate)||toDate<date||!Number.isSafeInteger(store)||store<0)return json({error:'تاريخ غير صالح'},400);
 await env.DB.prepare(AD_TABLE).run();
 const where="date(o.first_printed_at,'+3 hours') BETWEEN ? AND ?"+(store?" AND o.store_id=?":"");
 const args=store?[date,toDate,store]:[date,toDate];
 const orders=(await env.DB.prepare(`SELECT o.id,o.order_code,o.delivery_status,o.delivery_company_settled,o.delivery_company_settlement_id,o.delivered_amount,o.cash_collected,o.amount,o.cost_of_goods,o.delivery_fee,o.raw_text,o.order_notes,o.partial_received_items,o.delivered_pieces,o.settlement_note,o.profit_reviewed_settlement_id,o.first_printed_at,date(o.first_printed_at,'+3 hours') shipment_day,o.store_id,so.imported_amount AS statement_amount,so.imported_status AS statement_status,so.match_type AS statement_match_type,ds.settlement_code AS statement_code,ds.source_name AS statement_source FROM orders o LEFT JOIN delivery_company_settlement_orders so ON so.rowid=(SELECT MAX(so2.rowid) FROM delivery_company_settlement_orders so2 WHERE so2.order_id=o.id AND so2.settlement_id=o.delivery_company_settlement_id) LEFT JOIN delivery_company_settlements ds ON ds.id=o.delivery_company_settlement_id WHERE o.first_printed_at IS NOT NULL AND ${where} ORDER BY o.id DESC`).bind(...args).all()).results||[];
 const models=await loadModels(env);

 const inventory=new Map();
 try{
  const rows=(await env.DB.prepare(`SELECT i.order_id,i.model_id,i.quantity,m.name AS model_name FROM inventory_order_items i LEFT JOIN profit_models m ON m.id=i.model_id JOIN orders o ON o.id=i.order_id WHERE o.first_printed_at IS NOT NULL AND ${where}`).bind(...args).all()).results||[];
  for(const r of rows){const id=Number(r.order_id);if(!inventory.has(id))inventory.set(id,[]);inventory.get(id).push({model_id:Number(r.model_id),name:r.model_name||'',quantity:Number(r.quantity||0)})}
 }catch{}

 const deliveredStatuses=new Set(['delivered','delivered_adjusted','partial']);
 let costReviewCount=0,receivedPieces=0,piecesUnknown=0,cashDiscrepancy=0,cashMismatchOrders=0,delivered=0,partial=0,returned=0,refusedWithFee=0,noReplyAfterArrival=0,otherReturns=0,pending=0,other=0,unreviewed=0,sales=0,cash=0,costs=0,fees=0,knownProfit=0,knownOrders=0;
 const details=[];
 for(const o of orders){
  const status=o.delivery_status||'pending',isPartial=status==='partial'||status==='delivered_adjusted',isDelivered=deliveredStatuses.has(status);
  const reviewed=!isPartial||(Number(o.delivery_company_settlement_id||0)>0&&Number(o.profit_reviewed_settlement_id||0)===Number(o.delivery_company_settlement_id));
  // Shipped items: read from the order's own text with the current catalogue; the
  // print-time inventory allocation is used only when the text cannot be read.
  const text=String(o.order_notes||o.raw_text||'');
  let items=[],itemSource='none';
  const parsed=text.trim()?await classifyInventoryItems(env,text,models):[];
  if(parsed.length){items=mergeItems(parsed,models);itemSource='order_text'}
  else if(inventory.get(Number(o.id))?.length){items=mergeItems(inventory.get(Number(o.id)),models);itemSource='inventory'}
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
   else if(reviewed&&hasStored){cost=storedCost;source='saved_partial_review';pieces=Number(o.delivered_pieces||0)||recPieces||null;missing=received?'':'القطع المستلمة غير مفصلة — تم استخدام كوست المراجعة المحفوظ'}
   else missing=received?'كوست إحدى القطع المستلمة غير معتمد':'لم تُحدد القطع المستلمة لهذا التسليم الجزئي';
  }
  const costKnown=cost!==null&&Number.isFinite(cost);
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
  }else if(status==='refused_fee_paid'&&Number(o.delivery_company_settled||0)){refusedWithFee++;returned++}
  else if(status==='refused_no_fee'&&Number(o.delivery_company_settled||0)){noReplyAfterArrival++;returned++}
  else if(status==='returned'||status==='canceled_before_arrival'||status.startsWith('refused'))otherReturns++;
  else if(status==='pending')pending++;
  else other++;
  details.push({id:o.id,order_code:o.order_code,shipment_day:o.shipment_day,status,settled:Boolean(Number(o.delivery_company_settled||0)),reviewed,
   items,item_source:itemSource,item_quantity:shippedPieces,received_items:received,received_pieces:isDelivered?pieces:null,
   cost_of_goods:Number(o.cost_of_goods||0),calculated_cost:isDelivered?cost:null,cost_source:source,cost_difference:hasStored&&costKnown&&source!=='saved_order'&&source!=='saved_partial_review'?round2(storedCost-cost):null,
   cost_needs_review:isDelivered&&(!costKnown||!reviewed),missing_reason:isDelivered&&(!costKnown||!reviewed)?missing:'',cost_note:isDelivered&&costKnown?missing:'',
   statement_code:o.statement_code||null,statement_source:o.statement_source||null,statement_amount:o.statement_amount==null?null:Number(o.statement_amount),statement_status:o.statement_status||null,statement_match_type:o.statement_match_type||null,
   profit,cash:isDelivered&&reviewed?Number(o.cash_collected||0):null,amount:isDelivered&&reviewed?Number(o.delivered_amount||0):null,fee:isDelivered&&reviewed?Number(o.delivery_fee||0):null,
   cash_difference:isDelivered&&reviewed?round2(Number(o.cash_collected||0)-(Number(o.delivered_amount||0)-Number(o.delivery_fee||0))):null});
 }
 const spendArgs=store?[date,toDate,store]:[date,toDate,0];
 const spend=(await env.DB.prepare("SELECT COALESCE(SUM(amount),0) amount FROM shipping_cohort_ad_spend WHERE date BETWEEN ? AND ? AND store_id=?").bind(...spendArgs).first())?.amount||0;
 const gross=costReviewCount?null:round2(cash-costs);
 return json({engine:'cohort-v3',model_costs:MODEL_COSTS,costs_verified:costReviewCount===0,date,to_date:toDate,store_id:store,total:orders.length,delivered,partial,returned,refused_with_fee:refusedWithFee,no_reply_after_arrival:noReplyAfterArrival,other_returns:otherReturns,pending,other,unreviewed,
  cost_review_count:costReviewCount,received_pieces:receivedPieces,pieces_unknown_orders:piecesUnknown,delivered_pieces_mapped:receivedPieces,
  sales:round2(sales),cash:round2(cash),costs:round2(costs),fees:round2(fees),cash_difference:round2(cashDiscrepancy),cash_mismatch_orders:cashMismatchOrders,
  gross_profit:gross,known_profit:round2(knownProfit),known_profit_orders:knownOrders,ad_spend:Number(spend),net_after_ads:gross===null?null:round2(gross-Number(spend)),
  complete:pending===0&&other===0&&unreviewed===0&&otherReturns===0,orders:details});
}
