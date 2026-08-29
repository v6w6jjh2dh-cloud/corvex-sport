const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

function normalizePhone(value=''){
 const map={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
 let digits=String(value||'').replace(/[٠-٩۰-۹]/g,x=>map[x]||x).replace(/\D/g,'');
 if(digits.startsWith('00962'))digits=digits.slice(2);
 if(digits.startsWith('962')&&digits.length>=12)digits='0'+digits.slice(3);
 else if(digits.length===9&&digits.startsWith('7'))digits='0'+digits;
 return digits;
}

async function auth(request,env){
 const header=request.headers.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';
 if(!token)return null;
 return env.DB.prepare(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

function dayDiff(a,b){
 if(!a||!b)return 999;
 return Math.abs((new Date(a+'T00:00:00Z')-new Date(b+'T00:00:00Z'))/86400000);
}

function orderSql(where){
 return `SELECT o.*,
  CASE WHEN o.first_printed_at IS NULL THEN NULL WHEN strftime('%w',o.first_printed_at,'+3 hours')='4' THEN date(o.first_printed_at,'+3 hours','+2 days') ELSE date(o.first_printed_at,'+3 hours','+1 day') END delivery_date,
  CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE date(o.first_printed_at,'+3 hours') END first_print_date,
  s.name store_name,ds.settlement_code,ds.created_at settlement_created_at
  FROM orders o
  LEFT JOIN stores s ON s.id=o.store_id
  LEFT JOIN delivery_company_settlements ds ON ds.id=o.delivery_company_settlement_id
  ${where} ORDER BY o.id DESC`;
}

function addByPhone(map,orders){
 for(const order of orders){
  const phone=normalizePhone(order.phone);if(!phone)continue;
  if(!map.has(phone))map.set(phone,[]);
  map.get(phone).push(order);
 }
}

function phoneVariants(phone){
 if(!phone)return[];
 const local=phone.startsWith('0')?phone.slice(1):phone;
 return[phone,local,'962'+local,'00962'+local];
}

export async function onRequestPost({request,env}){
 if(!await auth(request,env))return json({error:'غير مصرح'},401);
 let body={};try{body=await request.json()}catch{}
 const storeId=Number(body.store_id||0),rows=Array.isArray(body.rows)?body.rows.slice(0,3000):[];
 if(!storeId)return json({error:'اختر المتجر أولاً'},400);
 if(!rows.length)return json({error:'الكشف فارغ'},400);

 const selectedOrders=(await env.DB.prepare(orderSql('WHERE o.store_id=?')).bind(storeId).all()).results||[];
 const activeOrders=selectedOrders.filter(order=>!Number(order.delivery_company_settled||0));
 const activeByPhone=new Map(),selectedByPhone=new Map(),otherStoreByPhone=new Map();
 addByPhone(activeByPhone,activeOrders);addByPhone(selectedByPhone,selectedOrders);

 const reportPhones=[...new Set(rows.map(row=>normalizePhone(row?.phone)).filter(Boolean))];
 const variants=[...new Set(reportPhones.flatMap(phoneVariants))];
 for(let offset=0;offset<variants.length;offset+=80){
  const chunk=variants.slice(offset,offset+80),placeholders=chunk.map(()=>'?').join(',');
  const other=(await env.DB.prepare(orderSql(`WHERE o.store_id<>? AND o.phone IN (${placeholders})`)).bind(storeId,...chunk).all()).results||[];
  addByPhone(otherStoreByPhone,other);
 }

 const result=[],used=new Set();
 let matched=0,duplicate=0,unmatched=0,review=0,alreadySettled=0,otherStore=0;
 for(let index=0;index<rows.length;index++){
  const row=rows[index]||{},phone=normalizePhone(row.phone),amount=Math.max(0,Number(row.amount||0));
  const deliveryFee=Math.max(0,Number(row.delivery_fee||0)),hasNet=Boolean(row.has_net),netAmount=hasNet?Number(row.net_amount||0):amount-deliveryFee,shipmentDate=String(row.shipment_date||'').trim(),status=String(row.status||'');
  const all=phone?(activeByPhone.get(phone)||[]):[],available=all.filter(order=>!used.has(Number(order.id)));
  const common={row_index:index+1,phone,shipment_date:shipmentDate,status,amount,delivery_fee:deliveryFee,net_amount:netAmount,has_net:hasNet,note:String(row.note||'')};

  if(!phone){unmatched++;result.push({...common,match_type:'unmatched',candidates:[]});continue}
  if(all.length&&!available.length){duplicate++;result.push({...common,match_type:'duplicate',candidates:all});continue}
  if(!available.length){
   const settled=(selectedByPhone.get(phone)||[]).filter(order=>Number(order.delivery_company_settled||0));
   if(settled.length){alreadySettled++;result.push({...common,match_type:'already_settled',candidates:settled});continue}
   const elsewhere=otherStoreByPhone.get(phone)||[];
   if(elsewhere.length){otherStore++;result.push({...common,match_type:'other_store',candidates:elsewhere});continue}
   unmatched++;result.push({...common,match_type:'unmatched',candidates:[]});continue
  }

  const nearDate=orders=>orders.filter(order=>dayDiff(shipmentDate,order.first_print_date)<=3||dayDiff(shipmentDate,order.delivery_date)<=3);
  const exact=amount>0?available.filter(order=>Math.abs(Math.abs(Number(order.amount||0))-amount)<.01):[];
  const returnStatus=['refused_fee_paid','refused_no_fee','canceled_before_arrival'].includes(status);
  let chosen=null,type='';

  if(exact.length===1){chosen=exact[0];type='matched'}
  else if(exact.length>1){
   const dated=nearDate(exact);
   if(dated.length===1){chosen=dated[0];type='matched'}
   else{duplicate++;result.push({...common,match_type:'duplicate',candidates:exact});continue}
  }else if(returnStatus){
   const dated=nearDate(available),pool=dated.length?dated:available;
   if(pool.length===1){chosen=pool[0];type=Math.abs(Math.abs(Number(chosen.amount||0))-amount)<.01?'matched':'matched_partial'}
   else{duplicate++;result.push({...common,match_type:'duplicate',candidates:pool});continue}
  }else{
   const lower=available.filter(order=>amount>0&&amount<Math.abs(Number(order.amount||0)));
   const dated=nearDate(lower);
   if(dated.length===1){chosen=dated[0];type='matched_partial'}
   else{
    const higher=available.filter(order=>amount>Math.abs(Number(order.amount||0))+.001);
    review++;
    result.push({...common,match_type:higher.length?'review_amount_higher':'review_amount',candidates:higher.length?higher:available});
    continue;
   }
  }

  if(amount>Math.abs(Number(chosen.amount||0))+.001){
   review++;result.push({...common,match_type:'review_amount_higher',candidates:[chosen]});continue;
  }
  used.add(Number(chosen.id));matched++;
  result.push({...common,match_type:type,order:chosen,order_id:chosen.id,candidates:[chosen]});
 }

 return json({rows:result,summary:{total:rows.length,matched,duplicate,unmatched,review,already_settled:alreadySettled,other_store:otherStore}});
}
