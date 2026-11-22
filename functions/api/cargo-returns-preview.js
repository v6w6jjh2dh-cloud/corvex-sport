import {classifyInventoryItems,loadInventoryModels} from './_inventory.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=x=>String(x??'').trim();
const phone=x=>{let s=clean(x).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');if(s.startsWith('00962'))s=s.slice(2);if(s.startsWith('962'))s='0'+s.slice(3);if(s.length===9&&s.startsWith('7'))s='0'+s;return s};
const normalize=x=>clean(x).normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').toLowerCase();
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'admin_required'},403);
 let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
 if(!Array.isArray(body.rows)||body.rows.length>500)return json({error:'invalid_rows'},400);
 const models=await loadInventoryModels(env),output=[];
 for(const row of body.rows){
  const code=clean(row.shipment_code).slice(0,80),p=phone(row.phone),area=normalize(row.area),city=normalize(row.city),status=normalize(row.status),returnStatus=normalize(row.return_status);
  if(!code||!p){output.push({shipment_code:code,status:'invalid',reason:'كود الشحنة أو الهاتف غير موجود'});continue}
  if(!status.includes('ملغي')){output.push({shipment_code:code,status:'ignored',reason:'الشحنة ليست ملغية'});continue}
  const found=(await env.DB.prepare("SELECT id,order_code,recipient_name,phone,area,detailed_address,order_notes,raw_text,delivery_status,partial_received_items,created_at FROM orders WHERE (phone=? OR phone=? OR phone=?) AND date(COALESCE(first_printed_at,created_at),'+3 hours')>='2026-11-17' ORDER BY id DESC LIMIT 80").bind(p,p.replace(/^0/,''),'962'+p.replace(/^0/,'')).all()).results||[];
  // Phone is the primary match key. Area/city are hints, never exclusion criteria.
  // A single phone match is safe to resolve; multiple orders require explicit selection.
  let matches=found;
  const selectedId=Number(row.selected_order_id||0);
  if(selectedId&&matches.length>1){const chosen=matches.find(x=>Number(x.id)===selectedId);if(chosen)matches=[chosen];}
  if(matches.length!==1){output.push({shipment_code:code,phone:p,area:clean(row.area),status:matches.length?'ambiguous':'unmatched',candidate_codes:matches.map(x=>x.order_code),candidates:matches.map(x=>({id:x.id,order_code:x.order_code,recipient_name:x.recipient_name,area:x.area,created_at:x.created_at,delivery_status:x.delivery_status})),reason:matches.length?'أكثر من طلب بنفس رقم الهاتف — اختر الطلب الصحيح':'رقم الهاتف غير موجود في طلبات كورفكس'});continue}
  const o=matches[0],items=await classifyInventoryItems(env,o.raw_text||o.order_notes||'',models);
  let expectedItems=items;
  if(o.delivery_status==='partial'){
   const full=items,delivered=new Map();
   try{
    const parsed=JSON.parse(o.partial_received_items||'[]');
    if(Array.isArray(parsed))for(const item of parsed)delivered.set(Number(item.model_id),Number(item.quantity||0));
   }catch{}
   expectedItems=delivered.size?full.map(item=>({...item,quantity:Math.max(0,item.quantity-(delivered.get(item.model_id)||0))})).filter(item=>item.quantity>0):[];
  }

  output.push({shipment_code:code,phone:p,area:clean(row.area),status:o.delivery_status==='partial'&&!expectedItems.length?'review_model':'matched',order_code:o.order_code,order_id:o.id,order_status:o.delivery_status,return_status:clean(row.return_status),return_sent:returnStatus.includes('تم ارسال المرتجع')&&!returnStatus.includes('لم يتم'),items:expectedItems.map(i=>({...i,model_name:models.find(m=>m.id===i.model_id)?.name||''})),reason:o.delivery_status==='partial'?(expectedItems.length?'تسليم جزئي — المرتجع المتوقع حسب التسليم؛ لم يتغير الجرد':'تسليم جزئي يحتاج مراجعة القطع المرتجعة'):expectedItems.length?'تمت مطابقة الطلب — لم يتغير الجرد':'تمت مطابقة الطلب برقم الهاتف — الموديل غير مطلوب للمطابقة'});
 }
 return json({ok:true,preview_only:true,rows:output,summary:{total:output.length,matched:output.filter(x=>x.status==='matched').length,review:output.filter(x=>!['matched','ignored'].includes(x.status)).length}});
}