const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
async function auth(request,env){const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!token)return null;return env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(token).first()}
export async function onRequest({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const url=new URL(request.url);let date=url.searchParams.get('date'),store=Number(url.searchParams.get('store_id')||0);
 if(request.method==='POST'){
  if(me.role!=='admin')return json({error:'المدير فقط يستطيع حفظ الإعلان'},403);
  let b;try{b=await request.json()}catch{return json({error:'طلب غير صالح'},400)}
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
 const data=await env.DB.prepare(`SELECT o.id,o.order_code,o.delivery_status,o.delivery_company_settled,o.delivery_company_settlement_id,o.delivered_amount,o.cash_collected,o.amount,o.cost_of_goods,o.delivery_fee,o.profit_reviewed_settlement_id,o.first_printed_at,o.store_id,so.imported_amount AS statement_amount,so.imported_status AS statement_status,so.match_type AS statement_match_type,ds.settlement_code AS statement_code,ds.source_name AS statement_source FROM orders o LEFT JOIN delivery_company_settlement_orders so ON so.rowid=(SELECT MAX(so2.rowid) FROM delivery_company_settlement_orders so2 WHERE so2.order_id=o.id AND so2.settlement_id=o.delivery_company_settlement_id) LEFT JOIN delivery_company_settlements ds ON ds.id=o.delivery_company_settlement_id WHERE o.first_printed_at IS NOT NULL AND ${where} ORDER BY o.id DESC`).bind(...args).all();
 const orders=data.results||[];
 const deliveredStatuses=new Set(['delivered','delivered_adjusted','partial']);
 let cashDiscrepancy=0,cashMismatchOrders=0;let delivered=0,partial=0,returned=0,refusedWithFee=0,noReplyAfterArrival=0,otherReturns=0,pending=0,other=0,unreviewed=0,sales=0,cash=0,costs=0,fees=0;
 const details=orders.map(o=>{
  const status=o.delivery_status||'pending';
  const isPartial=status==='partial'||status==='delivered_adjusted';
  const isDelivered=deliveredStatuses.has(status);
  const reviewed=!isPartial||(Number(o.delivery_company_settlement_id||0)>0&&Number(o.profit_reviewed_settlement_id||0)===Number(o.delivery_company_settlement_id));
  let profit=null;
  if(isDelivered){delivered++;if(isPartial)partial++;if(reviewed){const amount=Number(o.delivered_amount||0);const cost=Number(o.cost_of_goods||0);const fee=Number(o.delivery_fee||0);const actualCash=Number(o.cash_collected||0);const difference=Math.round((actualCash-(amount-fee))*100)/100;if(Math.abs(difference)>=.01){cashMismatchOrders++;cashDiscrepancy+=difference}sales+=amount;cash+=actualCash;costs+=cost;fees+=fee;profit=actualCash-cost}else unreviewed++}
  else if(status==='refused_fee_paid'&&Number(o.delivery_company_settled||0)){refusedWithFee++;returned++}
  else if(status==='refused_no_fee'&&Number(o.delivery_company_settled||0)){noReplyAfterArrival++;returned++}
  else if(status==='returned'||status==='canceled_before_arrival'||status.startsWith('refused'))otherReturns++;
  else if(status==='pending')pending++;
  else other++;
  return {id:o.id,order_code:o.order_code,statement_code:o.statement_code||null,statement_source:o.statement_source||null,statement_amount:o.statement_amount==null?null:Number(o.statement_amount),statement_status:o.statement_status||null,statement_match_type:o.statement_match_type||null,status,settled:Boolean(Number(o.delivery_company_settled||0)),reviewed,profit,cash:isDelivered&&reviewed?Number(o.cash_collected||0):null,amount:isDelivered&&reviewed?Number(o.delivered_amount||0):null,fee:isDelivered&&reviewed?Number(o.delivery_fee||0):null,cash_difference:isDelivered&&reviewed?Math.round((Number(o.cash_collected||0)-(Number(o.delivered_amount||0)-Number(o.delivery_fee||0)))*100)/100:null};
 });
 const spend=(await env.DB.prepare("SELECT amount FROM shipping_cohort_ad_spend WHERE date=? AND store_id=?").bind(date,store).first())?.amount||0;
 return json({date,store_id:store,total:orders.length,delivered,partial,returned,refused_with_fee:refusedWithFee,no_reply_after_arrival:noReplyAfterArrival,other_returns:otherReturns,pending,other,unreviewed,sales,cash,costs,fees,cash_difference:Math.round(cashDiscrepancy*100)/100,cash_mismatch_orders:cashMismatchOrders,gross_profit:cash-costs,ad_spend:Number(spend),net_after_ads:cash-costs-Number(spend),complete:pending===0&&other===0&&unreviewed===0&&otherReturns===0,orders:details});
}
