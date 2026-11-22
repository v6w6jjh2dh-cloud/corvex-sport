import {classifyInventoryItems} from './_inventory.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const MODEL_COSTS=[{name:'جاكيت فرو',cost:4},{name:'جاكيت جوخ كاجوال',cost:5.2},{name:'جاكيت جوخ سكايفو',cost:7.55},{name:'مالئ الفراغات',cost:1}];
const normalizedName=x=>String(x||'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const modelCost=name=>{const key=normalizedName(name);return MODEL_COSTS.find(m=>normalizedName(m.name)===key)?.cost??null};
const FALLBACK_MODELS=[
 {id:-1,name:'جاكيت فرو',aliases:['جاكيت فرو','جاكيت الفرو','جاكيت فروه']},
 {id:-2,name:'جاكيت جوخ كاجوال',aliases:['جاكيت جوخ كاجوال','جوخ كاجوال','جاكيت الجوخ الكاجوال']},
 {id:-3,name:'جاكيت جوخ سكايفو',aliases:['جاكيت جوخ سكايفو','جاكيت جوخ سكارفو','جاكيت الجوخ سكارفو','جوخ سكايفو','جوخ سكارفو']},
 {id:-4,name:'مالئ الفراغات',aliases:['مالئ الفراغات','مالى الفراغات','ملي الفراغات','مالئ فراغات']}
].map(m=>({...m,aliases:m.aliases.map(normalizedName)}));
async function calculateFromText(env,order){
 const raw=[order.raw_text,order.order_notes].filter(Boolean).join('\n').trim();
 if(!raw)return null;
 const matches=await classifyInventoryItems(env,raw,FALLBACK_MODELS);
 if(!matches.length||matches.some(x=>!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>50))return null;
 const items=matches.map(x=>{const model=FALLBACK_MODELS.find(m=>m.id===x.model_id);return{model:model?.name,quantity:x.quantity,cost:modelCost(model?.name)}});
 if(items.some(x=>x.cost===null))return null;
 return{items,cost:Math.round(items.reduce((n,x)=>n+x.quantity*x.cost,0)*100)/100};
}
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
async function auth(request,env){const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return null;return env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(token).first()}
export async function onRequest({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const url=new URL(request.url);let date=url.searchParams.get('date'),store=Number(url.searchParams.get('store_id')||0);
 if(request.method==='POST'){
  if(me.role!=='admin')return json({error:'المدير فقط يستطيع حفظ الإعلان'},403);
  let b;try{b=await request.json()}catch{return json({error:'طلب غير صالح'},400)}
  if(b.action==='recalculate_delivered_costs'){
   const target=String(b.date||'');const targetStore=Number(b.store_id||0);
   if(!validDate(target)||target<'2026-11-17'||!Number.isSafeInteger(targetStore)||targetStore<0)return json({error:'تاريخ أو متجر غير صالح'},400);
   const condition="date(first_printed_at,'+3 hours')=?"+(targetStore?" AND store_id=?":"");
   const params=targetStore?[target,targetStore]:[target];
   const rows=(await env.DB.prepare(`SELECT id,order_code,delivery_status,raw_text,order_notes,cost_of_goods,settlement_note FROM orders WHERE ${condition} AND delivery_status IN ('delivered','delivered_adjusted','partial')`).bind(...params).all()).results||[];
   let updated=0,skipped=0;const skipped_orders=[];
   for(const order of rows){
    if(order.delivery_status!=='delivered'||/\[MANUAL_COST:/i.test(String(order.settlement_note||''))){skipped++;skipped_orders.push(order.order_code);continue}
    const result=await calculateFromText(env,order);
    if(!result){skipped++;skipped_orders.push(order.order_code);continue}
    const change=await env.DB.prepare("UPDATE orders SET cost_of_goods=?,settlement_note=COALESCE(settlement_note,'') || ?,updated_at=datetime('now') WHERE id=? AND delivery_status='delivered' AND COALESCE(settlement_note,'') NOT LIKE '%[MANUAL_COST:%'").bind(result.cost,' [AUTO_COST:V1]',order.id).run();
    updated+=Number(change?.meta?.changes||0);
   }
   return json({ok:true,updated,skipped,skipped_orders});
  }
  date=b.date;store=Number(b.store_id||0);const amount=Number(b.ad_spend);
  if(!validDate(date)||date<'2026-11-17'||!Number.isSafeInteger(store)||store<0||!Number.isFinite(amount)||amount<0||amount>10000000)return json({error:'تاريخ أو مبلغ غير صالح'},400);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS shipping_cohort_ad_spend (date TEXT NOT NULL,store_id INTEGER NOT NULL,amount REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(date,store_id))").run();
  await env.DB.prepare("INSERT INTO shipping_cohort_ad_spend(date,store_id,amount) VALUES(?,?,?) ON CONFLICT(date,store_id) DO UPDATE SET amount=excluded.amount,updated_at=datetime('now')").bind(date,store,amount).run();
  return json({ok:true});
 }
 if(request.method!=='GET')return json({error:'طريقة غير مدعومة'},405);
 if(!validDate(date)||!Number.isSafeInteger(store)||store<0)return json({error:'تاريخ غير صالح'},400);
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS shipping_cohort_ad_spend (date TEXT NOT NULL,store_id INTEGER NOT NULL,amount REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(date,store_id))").run();
 const where="date(o.first_printed_at,'+3 hours')=?"+(store?" AND o.store_id=?":"");
 const args=store?[date,store]:[date];
 const data=await env.DB.prepare(`SELECT o.id,o.order_code,o.delivery_status,o.delivery_company_settled,o.delivery_company_settlement_id,o.delivered_amount,o.cash_collected,o.amount,o.cost_of_goods,o.delivery_fee,o.raw_text,o.order_notes,o.partial_received_items,o.settlement_note,o.profit_reviewed_settlement_id,o.first_printed_at,o.store_id,so.imported_amount AS statement_amount,so.imported_status AS statement_status,so.match_type AS statement_match_type,ds.settlement_code AS statement_code,ds.source_name AS statement_source FROM orders o LEFT JOIN delivery_company_settlement_orders so ON so.rowid=(SELECT MAX(so2.rowid) FROM delivery_company_settlement_orders so2 WHERE so2.order_id=o.id AND so2.settlement_id=o.delivery_company_settlement_id) LEFT JOIN delivery_company_settlements ds ON ds.id=o.delivery_company_settlement_id WHERE o.first_printed_at IS NOT NULL AND ${where} ORDER BY o.id DESC`).bind(...args).all();
 const orders=data.results||[];
 const itemMap=new Map();
 try{
  const itemRows=(await env.DB.prepare(`SELECT i.order_id,i.model_id,i.quantity,m.name AS model_name FROM inventory_order_items i LEFT JOIN profit_models m ON m.id=i.model_id JOIN orders o ON o.id=i.order_id WHERE o.first_printed_at IS NOT NULL AND ${where}`).bind(...args).all()).results||[];
  for(const item of itemRows){const id=Number(item.order_id);if(!itemMap.has(id))itemMap.set(id,[]);itemMap.get(id).push({model_id:Number(item.model_id),name:item.model_name||'موديل غير معروف',quantity:Number(item.quantity||0),unit_cost:modelCost(item.model_name),total_cost:modelCost(item.model_name)===null?null:Math.round(Number(item.quantity||0)*modelCost(item.model_name)*100)/100})}
 }catch(error){return json({error:'تعذر تحميل تفاصيل أصناف الطلبات، لم يتم اعتماد الكوست',detail:String(error?.message||error)},500)}
 // Historical orders may have no inventory_order_items: derive merchandise from the
 // original order text without changing inventory or historical allocations.
 for(const o of orders){
  if((itemMap.get(Number(o.id))||[]).length&&itemMap.get(Number(o.id)).every(i=>i.unit_cost!==null&&i.quantity>0))continue;
  const raw=[o.raw_text,o.order_notes].filter(Boolean).join('\n');
  if(!raw.trim())continue;
  const matches=await classifyInventoryItems(env,raw,FALLBACK_MODELS);
  const items=matches.map(x=>{const model=FALLBACK_MODELS.find(m=>m.id===x.model_id);const unit_cost=modelCost(model?.name);return{model_id:x.model_id,name:model?.name||'غير معروف',quantity:x.quantity,unit_cost,total_cost:unit_cost===null?null:Math.round(x.quantity*unit_cost*100)/100,source:'order_text'}});
  if(items.length)itemMap.set(Number(o.id),items);
 }
 const deliveredStatuses=new Set(['delivered','delivered_adjusted','partial']);
 let costReviewCount=0,totalDeliveredPieces=0,verifiedCosts=0;let cashDiscrepancy=0,cashMismatchOrders=0;let delivered=0,partial=0,returned=0,refusedWithFee=0,noReplyAfterArrival=0,otherReturns=0,pending=0,other=0,unreviewed=0,sales=0,cash=0,costs=0,fees=0;
 const details=orders.map(o=>{
  const status=o.delivery_status||'pending';
  const isPartial=status==='partial'||status==='delivered_adjusted';
  const isDelivered=deliveredStatuses.has(status);
  const reviewed=!isPartial||(Number(o.delivery_company_settlement_id||0)>0&&Number(o.profit_reviewed_settlement_id||0)===Number(o.delivery_company_settlement_id));
  let profit=null;
  if(isDelivered){delivered++;if(isPartial)partial++;if(reviewed){const amount=Number(o.delivered_amount||0);const mappedItems=itemMap.get(Number(o.id))||[];const costComplete=mappedItems.length>0&&mappedItems.every(i=>i.unit_cost!==null)&&mappedItems.every(i=>i.quantity>0)&&!isPartial;const cost=costComplete?Math.round(mappedItems.reduce((n,i)=>n+i.total_cost,0)*100)/100 :(/\[AUTO_COST:V1\]/.test(String(o.settlement_note||''))?Number(o.cost_of_goods):null);const fee=Number(o.delivery_fee||0);const actualCash=Number(o.cash_collected||0);const difference=Math.round((actualCash-(amount-fee))*100)/100;if(Math.abs(difference)>=.01){cashMismatchOrders++;cashDiscrepancy+=difference}sales+=amount;cash+=actualCash;if(cost!==null)costs+=cost;fees+=fee;profit=cost!==null?actualCash-cost:null}else unreviewed++}
  else if(status==='refused_fee_paid'&&Number(o.delivery_company_settled||0)){refusedWithFee++;returned++}
  else if(status==='refused_no_fee'&&Number(o.delivery_company_settled||0)){noReplyAfterArrival++;returned++}
  else if(status==='returned'||status==='canceled_before_arrival'||status.startsWith('refused'))otherReturns++;
  else if(status==='pending')pending++;
  else other++;
  const items=itemMap.get(Number(o.id))||[];
  const itemQuantity=items.reduce((n,x)=>n+x.quantity,0);
  if(isDelivered){totalDeliveredPieces+=itemQuantity;if((items.length===0||items.some(i=>i.unit_cost===null||i.quantity<=0))&&!/\[AUTO_COST:V1\]/.test(String(o.settlement_note||''))||isPartial)costReviewCount++}
  return {id:o.id,order_code:o.order_code,items,item_quantity:itemQuantity,cost_of_goods:Number(o.cost_of_goods||0),calculated_cost:items.length&&items.every(i=>i.unit_cost!==null)&&!isPartial?Math.round(items.reduce((n,i)=>n+i.total_cost,0)*100)/100:null,cost_needs_review:isDelivered&&(items.length===0||items.some(i=>i.unit_cost===null||i.quantity<=0)||(isPartial&&(!reviewed||Number(o.cost_of_goods||0)<=0))),statement_code:o.statement_code||null,statement_source:o.statement_source||null,statement_amount:o.statement_amount==null?null:Number(o.statement_amount),statement_status:o.statement_status||null,statement_match_type:o.statement_match_type||null,status,settled:Boolean(Number(o.delivery_company_settled||0)),reviewed,profit,cash:isDelivered&&reviewed?Number(o.cash_collected||0):null,amount:isDelivered&&reviewed?Number(o.delivered_amount||0):null,fee:isDelivered&&reviewed?Number(o.delivery_fee||0):null,cash_difference:isDelivered&&reviewed?Math.round((Number(o.cash_collected||0)-(Number(o.delivered_amount||0)-Number(o.delivery_fee||0)))*100)/100:null};
 });
 const spend=(await env.DB.prepare("SELECT amount FROM shipping_cohort_ad_spend WHERE date=? AND store_id=?").bind(date,store).first())?.amount||0;
 return json({model_costs:MODEL_COSTS,costs_verified:costReviewCount===0,date,store_id:store,total:orders.length,delivered,partial,returned,refused_with_fee:refusedWithFee,no_reply_after_arrival:noReplyAfterArrival,other_returns:otherReturns,pending,other,unreviewed,cost_review_count:costReviewCount,delivered_pieces_mapped:totalDeliveredPieces,sales,cash,costs,fees,cash_difference:Math.round(cashDiscrepancy*100)/100,cash_mismatch_orders:cashMismatchOrders,gross_profit:costReviewCount?null:Math.round((cash-costs)*100)/100,ad_spend:Number(spend),net_after_ads:costReviewCount?null:Math.round((cash-costs-Number(spend))*100)/100,complete:pending===0&&other===0&&unreviewed===0&&otherReturns===0,orders:details});
}
