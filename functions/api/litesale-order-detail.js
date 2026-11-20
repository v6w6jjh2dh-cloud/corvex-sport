// Manual admin-only full LiteSale order details. Read-only; no database writes.
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function onRequest({request,env}){
 if(request.method!=='POST')return out({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return out({error:'invalid_origin'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const actor=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!actor)return out({error:'admin_required'},403);
 let body;try{body=await request.json()}catch{return out({error:'invalid_request'},400)}
 const id=body?.id;if(typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))return out({error:'invalid_order_id'},400);
 const key=env.LITESALE_MCP_KEY;if(!key||!/^lsk_[\w-]+$/.test(key))return out({error:'missing_secret'},503);
 const endpoint='https://api.litesale.store/mcp/k/'+encodeURIComponent(key);
 async function rpc(method,num,params,session){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),15000);
  try{
   const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};if(session)headers['Mcp-Session-Id']=session;
   const res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:num,method,params}),signal:ctrl.signal});
   const txt=await res.text();if(!res.ok)throw Error('upstream_http_'+res.status);
   const data=(res.headers.get('content-type')||'').includes('text/event-stream')?JSON.parse(txt.split(/\r?\n/).filter(s=>s.startsWith('data:')&&s.includes('{')).at(-1)?.slice(5).trim()||'{}'):JSON.parse(txt);
   if(data.error)throw Error('mcp_error_'+data.error.code);
   return {value:data.result,session:res.headers.get('mcp-session-id')||session};
  }finally{clearTimeout(timeout)}
 }
 try{
  const init=await rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'corvex-order-detail',version:'1.0'}});
  const list=await rpc('tools/list',2,{},init.session);
  const tool=list.value?.tools?.find(x=>x.name==='get_order');if(!tool)return out({error:'get_order_unavailable'},502);
  const props=tool.inputSchema?.properties||{},required=tool.inputSchema?.required||[];
  const field=['order_id','id','orderId','order_number'].find(x=>x in props)||(required.length===1?required[0]:null);
  if(!field||required.some(x=>x!==field))return out({error:'unsupported_get_order_schema',required},422);
  const result=await rpc('tools/call',3,{name:'get_order',arguments:{[field]:id}},list.session);
  if(result.value?.isError)return out({error:'get_order_failed'},502);
  let data=result.value?.structuredContent;
  if(data==null){const txt=(result.value?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');data=JSON.parse(txt)}
  const o=data?.order??data?.data?.order??data?.data??data;
  if(!o||typeof o!=='object'||Array.isArray(o))return out({error:'unexpected_order_shape'},502);
  const product=o.product_name??o.product?.name??o.product??o.items??o.order_items??o.products??o.line_items??o.variant??(o.product_id!=null?'منتج #'+o.product_id:null);
  const amount=o.total??o.total_amount??o.total_price??o.grand_total??o.order_total??o.price??o.amount??o.total_jod??o.price_total??o.pricing??null;
  // Prefer actual product metadata when LiteSale exposes a read-only get_product tool.
  let productName=null,productLookup='unavailable';
  const pid=o.product_id??o.product?.id;
  if(pid!=null){
   const ptool=list.value?.tools?.find(t=>t.name==='get_product');
   if(ptool){
    const pp=ptool.inputSchema?.properties||{},pr=ptool.inputSchema?.required||[];
    const pf=['product_id','id','productId'].find(x=>x in pp)||(pr.length===1?pr[0]:null);
    if(pf&&pr.every(x=>x===pf)){
     try{
      const p=await rpc('tools/call',4,{name:'get_product',arguments:{[pf]:pid}},result.session);
      if(!p.value?.isError){
       let pd=p.value?.structuredContent;
       if(pd==null){const pt=(p.value?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\\n');pd=JSON.parse(pt)}
       const item=pd?.product??pd?.data?.product??pd?.data??pd;
       const candidate=item?.name??item?.title??item?.product_name;
       if(typeof candidate==='string'&&candidate.trim()){productName=candidate.slice(0,180);productLookup='found'}
      }
     }catch{productLookup='failed'}
    }else productLookup='unsupported_schema';
   }
  }
  const choices=o.raw_additional_choices??o.additional_choices??o.selected_options??o.choices??null;
  const choiceValues=(choices&&typeof choices==='object')?choices:{};
  const findChoice=(regex)=>{const entries=Object.entries(choiceValues).filter(([k])=>regex.test(k));for(const [,v] of entries){if(typeof v==='string'||typeof v==='number')return String(v);if(v&&typeof v==='object'){const val=v.value??v.label??v.name??v.selected;if(typeof val==='string'||typeof val==='number')return String(val)}}return null};
  const selectedColor=o.color??o.variant?.color??o.selected_color??findChoice(/color|colour|لون/i)??null;
  const selectedSize=o.size??o.variant?.size??o.selected_size??findChoice(/size|مقاس|قياس/i)??null;
  // Customer-entered weight only; never infer from quantity, shipping weight or size.
  const weightKeys=/^(?:weight|customer_weight|body_weight|selected_weight|weight_kg|customerWeight|وزن|الوزن|وزن العميل|وزنك|الوزن بالكيلو|الوزن بالكيلوغرام)$/i;
  const weightLabel=/وزن|weight/i;
  const normalizeWeight=(v)=>{
   if(v&&typeof v==='object')v=v.value??v.selected??v.answer??v.label??v.text??null;
   if(typeof v!=='number'&&typeof v!=='string')return null;
   const s=String(v).trim().replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(',', '.');
   const m=s.match(/^(\d{2,3}(?:\.\d)?)(?:\s*(?:kg|kgs|كيلو|كغ|كيلوغرام))?$/i);
   if(!m)return null;
   const n=Number(m[1]);return n>=20&&n<=300?n:null;
  };
  let customerWeight=null,weightSource=null;
  const candidates=[['weight',o.weight],['customer_weight',o.customer_weight],['body_weight',o.body_weight],['weight_kg',o.weight_kg],['customer.weight',o.customer?.weight],['customer.weight_kg',o.customer?.weight_kg]];
  for(const [k,v] of candidates){const n=normalizeWeight(v);if(n!==null){customerWeight=n;weightSource=k;break}}
  if(customerWeight===null){
   const walk=(v,path='',depth=0)=>{
    if(customerWeight!==null||depth>5||!v||typeof v!=='object')return;
    if(Array.isArray(v)){for(let i=0;i<Math.min(v.length,35);i++)walk(v[i],path+'['+i+']',depth+1);return}
    const label=v.label??v.name??v.title??v.question??v.field_name??v.key;
    if(typeof label==='string'&&weightLabel.test(label)&&!/shipping|package|parcel|شحن|طرد/i.test(label)){
     const n=normalizeWeight(v.value??v.answer??v.selected??v.input??v.text);
     if(n!==null){customerWeight=n;weightSource=path+'.'+label;return}
    }
    for(const [k,x] of Object.entries(v).slice(0,50)){
     if(weightKeys.test(k)){const n=normalizeWeight(x);if(n!==null){customerWeight=n;weightSource=path?path+'.'+k:k;return}}
     if(x&&typeof x==='object')walk(x,path?path+'.'+k:k,depth+1);
    }
   };
   for(const [k,v] of [['raw_additional_choices',o.raw_additional_choices],['additional_choices',o.additional_choices],['selected_options',o.selected_options],['choices',o.choices],['custom_fields',o.custom_fields],['form_data',o.form_data],['form_fields',o.form_fields],['answers',o.answers]])walk(v,k);
  }
  // Diagnose custom-form structure without exposing unrelated customer fields.
  const customFieldHints=[];
  const inspect=(v,path,depth=0)=>{
   if(depth>5||customFieldHints.length>=35||v==null)return;
   if(typeof v==='string'){
    if((v.startsWith('{')||v.startsWith('['))&&v.length<20000){try{inspect(JSON.parse(v),path+'(json)',depth+1)}catch{}}
    return;
   }
   if(typeof v!=='object')return;
   if(Array.isArray(v)){for(let i=0;i<Math.min(v.length,25);i++)inspect(v[i],path+'['+i+']',depth+1);return}
   const label=v.label??v.title??v.question??v.field_label??v.name??v.key;
   if(typeof label==='string'&&/وزن|weight|لون|color|colour|عرض|offer|bundle/i.test(label)){
    const raw=v.value??v.answer??v.selected??v.input??v.text??v.field_value??null;
    const val=(typeof raw==='string'||typeof raw==='number')?String(raw).slice(0,80):null;
    customFieldHints.push({path,label:label.slice(0,80),value:val});
    if(customerWeight===null&&/وزن|weight/i.test(label)&&!/شحن|طرد|shipping|parcel/i.test(label)){
     const n=normalizeWeight(raw);if(n!==null){customerWeight=n;weightSource=path}
    }
   }
   for(const [k,x] of Object.entries(v).slice(0,45)){
    if(/وزن|weight|لون|color|colour|عرض|offer|bundle/i.test(k)&&!/(?:shipping|parcel|package|شحن|طرد)/i.test(k)){
     const raw=(x&&typeof x==='object')?(x.value??x.answer??x.selected??x.text):x;
     if(typeof raw==='string'||typeof raw==='number'){
      customFieldHints.push({path:path+'.'+k,label:k.slice(0,80),value:String(raw).slice(0,80)});
      if(customerWeight===null&&/وزن|weight/i.test(k)){const n=normalizeWeight(raw);if(n!==null){customerWeight=n;weightSource=path+'.'+k}}
     }
    }
    if(x&&typeof x==='object')inspect(x,path+'.'+k,depth+1);
    else if(typeof x==='string'&&(x.startsWith('{')||x.startsWith('[')))inspect(x,path+'.'+k,depth+1);
   }
  };
  for(const [k,v] of Object.entries(o)){if(/additional|choice|form|custom|answer|field|option|metadata/i.test(k))inspect(v,k)}
  // LiteSale custom-form answers are often keyed by their Arabic field labels.
  // Prefer the exact submitted answer over defaults or product variants.
  const customAnswers=o.additional_choices??o.raw_additional_choices??null;
  const readAnswer=(key)=>{
   if(!customAnswers||typeof customAnswers!=='object')return null;
   const raw=customAnswers[key];
   if(raw==null)return null;
   return raw&&typeof raw==='object'?(raw.value??raw.answer??raw.selected??raw.text??null):raw;
  };
  const submittedWeight=normalizeWeight(readAnswer('الوزن'));
  if(submittedWeight!==null){customerWeight=submittedWeight;weightSource='additional_choices.الوزن'}
  const submittedColor=readAnswer('لون الجاكيت')??readAnswer('اللون');
  const submittedOffer=readAnswer('العرض')??readAnswer('اختيار العرض')??readAnswer('الكمية')??null;
  const submittedWeightRaw=readAnswer('الوزن')??readAnswer('وزن العميل')??null;
  // Textual sizing may be submitted under weight, size, or custom-form choices.
  const answerSources=[o.additional_choices,o.raw_additional_choices,o.selected_options,o.choices,o.custom_fields,o.form_data,o.form_fields,o.answers];
  const getAnswerValue=v=>v&&typeof v==='object'?(v.value??v.answer??v.selected??v.text??v.label??null):v;
  const sizeWords=/اصغر\s*مقاس|أصغر\s*مقاس|ازغر\s*مقاس|اكبر\s*مقاس|أكبر\s*مقاس/i;
  let textualSize=null;
  for(const src of answerSources){
   if(!src)continue;
   let obj=src;
   if(typeof obj==='string'){try{obj=JSON.parse(obj)}catch{continue}}
   const entries=Array.isArray(obj)?obj.map(x=>[String(x?.label??x?.name??x?.key??''),getAnswerValue(x)]):Object.entries(obj);
   for(const [key,raw] of entries){
    const val=getAnswerValue(raw);
    if(typeof val!=='string'||!val.trim())continue;
    if(sizeWords.test(val)||(/وزن|weight|مقاس|size/i.test(key)&&!normalizeWeight(val)&&/مقاس|صغير|كبير|small|large/i.test(val))){textualSize=val.trim().slice(0,100);break}
   }
   if(textualSize)break;
  }
  const weightLabelText=textualSize??((typeof submittedWeightRaw==='string'&&submittedWeightRaw.trim()&&!normalizeWeight(submittedWeightRaw))?submittedWeightRaw.trim().slice(0,100):null);
  let actualColor=(typeof submittedColor==='string'&&submittedColor.trim())?submittedColor.trim():selectedColor;
  const offerText=String(submittedOffer??'');
  const totalValue=Number(o.price_total??o.total??o.total_amount??o.total_price??o.grand_total??o.order_total??o.amount??NaN);
  const isCasualJacket=/جاكيت\s*جوخ\s*كاج(?:و)?ال/i.test(String(productName??product??''));
  const isTwoOffer=/قطعتين|قطعتان|2\s*قطع|٢\s*قطع|2\s*جاكيت|٢\s*جاكيت/i.test(offerText);
  const twoJackets=isCasualJacket&&isTwoOffer&&totalValue===20;
  if(twoJackets)actualColor='أسود + بيج';
  const schemaPaths=[]; const scan=(v,path='',depth=0)=>{if(!v||typeof v!=='object'||depth>3||schemaPaths.length>=90)return;for(const [k,x] of Object.entries(v).slice(0,35)){const p=path?path+'.'+k:k; if(/price|total|amount|cost|subtotal|discount|shipping|currency|product|item|variant|line|payment|order_value|quantity|weight|وزن/i.test(k)){schemaPaths.push({path:p,type:Array.isArray(x)?'array':typeof x,value:(typeof x==='number'||(typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x)))?String(x).slice(0,35):undefined});}if(x&&typeof x==='object')scan(Array.isArray(x)?x[0]:x,p+(Array.isArray(x)?'[0]':''),depth+1);if(schemaPaths.length>=90)break}};scan(o);
  return out({ok:true,diagnostic:{candidate_fields:schemaPaths,custom_field_hints:customFieldHints.slice(0,35)},detail:{id:o.id??o.order_id??id,product:productName??product,product_id:pid??null,product_lookup:productLookup,amount,quantity:twoJackets?2:(o.quantity??o.qty??o.items?.length??null),address:o.address??o.shipping_address??o.customer?.address??null,city:o.city??o.customer?.city??null,color:actualColor,size:selectedSize,weight_kg:customerWeight,weight_text:weightLabelText,weight_source:weightSource,notes:o.notes??o.customer_notes??null},available_fields:Object.keys(o).slice(0,45),read_only:true,imported:0});
 }catch(e){return out({error:String(e?.message||'detail_failed').slice(0,130)},502)}
}
