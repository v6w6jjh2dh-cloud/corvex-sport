const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
function normalizePhone(value=''){const map={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};let d=String(value||'').replace(/[٠-٩۰-۹]/g,x=>map[x]||x).replace(/\D/g,'');if(d.startsWith('00962'))d=d.slice(2);if(d.startsWith('962')&&d.length>=12)d='0'+d.slice(3);else if(d.length===9&&d.startsWith('7'))d='0'+d;return d}
async function auth(request,env){const h=request.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;return env.DB.prepare(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first()}
function dayDiff(a,b){if(!a||!b)return 999;return Math.abs((new Date(a+'T00:00:00Z')-new Date(b+'T00:00:00Z'))/86400000)}
function orderSql(){return `SELECT o.*,CASE WHEN o.first_printed_at IS NULL THEN NULL WHEN strftime('%w',o.first_printed_at,'+3 hours')='4' THEN date(o.first_printed_at,'+3 hours','+2 days') ELSE date(o.first_printed_at,'+3 hours','+1 day') END delivery_date,CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE date(o.first_printed_at,'+3 hours') END first_print_date,s.name store_name FROM orders o LEFT JOIN stores s ON s.id=o.store_id WHERE o.store_id=? AND COALESCE(o.delivery_company_settled,0)=0 ORDER BY o.id DESC`}
export async function onRequestPost({request,env}){
 if(!await auth(request,env))return json({error:'غير مصرح'},401);let b={};try{b=await request.json()}catch{}
 const storeId=Number(b.store_id||0),rows=Array.isArray(b.rows)?b.rows.slice(0,3000):[];if(!storeId)return json({error:'اختر المتجر أولاً'},400);if(!rows.length)return json({error:'الكشف فارغ'},400);
 const orders=(await env.DB.prepare(orderSql()).bind(storeId).all()).results||[],byPhone=new Map();for(const o of orders){const p=normalizePhone(o.phone);if(!p)continue;if(!byPhone.has(p))byPhone.set(p,[]);byPhone.get(p).push(o)}
 const result=[],used=new Set();let matched=0,duplicate=0,unmatched=0,review=0;
 for(let i=0;i<rows.length;i++){
  const row=rows[i]||{},phone=normalizePhone(row.phone),amount=Math.max(0,Number(row.amount||0)),deliveryFee=Math.max(0,Number(row.delivery_fee||0)),shipmentDate=String(row.shipment_date||'').trim(),all=phone?(byPhone.get(phone)||[]):[],available=all.filter(o=>!used.has(Number(o.id))),common={row_index:i+1,phone,shipment_date:shipmentDate,status:String(row.status||''),amount,delivery_fee:deliveryFee,note:String(row.note||'')};
  if(!phone||!available.length){unmatched++;result.push({...common,match_type:'unmatched',candidates:[]});continue}
  const exact=amount>0?available.filter(o=>Math.abs(Math.abs(Number(o.amount||0))-amount)<.01):[];let chosen=null,type='';
  if(exact.length===1){chosen=exact[0];type='matched'}
  else if(exact.length>1){const near=exact.filter(o=>dayDiff(shipmentDate,o.first_print_date)<=3||dayDiff(shipmentDate,o.delivery_date)<=3);if(near.length===1){chosen=near[0];type='matched'}else{duplicate++;result.push({...common,match_type:'duplicate',candidates:exact});continue}}
  else{
   // لا نسمح أبدًا لقيمة كشف أكبر من قيمة الطلب أن تغيّر الطلب تلقائيًا.
   const lower=available.filter(o=>amount>0&&amount<Math.abs(Number(o.amount||0)));
   const near=lower.filter(o=>dayDiff(shipmentDate,o.first_print_date)<=3||dayDiff(shipmentDate,o.delivery_date)<=3);
   if(near.length===1){chosen=near[0];type='matched_partial'}else{review++;result.push({...common,match_type:'review_amount',candidates:available});continue}
  }
  if(amount>Math.abs(Number(chosen.amount||0))+.001){review++;result.push({...common,match_type:'review_amount_higher',candidates:[chosen]});continue}
  used.add(Number(chosen.id));matched++;result.push({...common,match_type:type,order:chosen,order_id:chosen.id,candidates:[chosen]});
 }
 return json({rows:result,summary:{total:rows.length,matched,duplicate,unmatched,review}})
}