const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

async function auth(request,env){
 const header=request.headers.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';
 if(!token)return null;
 return env.DB.prepare(`SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

async function allowed(env,user){
 if(!user)return false;if(user.role==='admin')return true;
 const row=await env.DB.prepare("SELECT permissions_json FROM actor_permissions WHERE actor_type='user' AND actor_id=?").bind(user.id).first();
 try{return JSON.parse(row?.permissions_json||'[]').includes('profits')}catch{return false}
}

const outputText=data=>data.output_text||(data.output||[]).flatMap(item=>item.content||[]).find(item=>item.type==='output_text')?.text||'';

export async function onRequestPost({request,env}){
 const user=await auth(request,env);if(!await allowed(env,user))return json({error:'لا تملك صلاحية تحليل الأرباح'},403);
 if(!env.OPENAI_API_KEY)return json({error:'الفهم السياقي غير مفعّل'},503);
 let body={};try{body=await request.json()}catch{return json({error:'بيانات غير صالحة'},400)}
 const text=String(body.text||'').trim().slice(0,6000);if(!text)return json({error:'نص الطلب مطلوب'},400);
 let rows=[];try{rows=(await env.DB.prepare("SELECT model_key,name,cost,aliases_json FROM profit_models WHERE active=1 ORDER BY name").all()).results||[]}catch{return json({error:'قائمة الموديلات غير جاهزة'},503)}
 if(!rows.length)return json({error:'لا توجد موديلات معرفة'},409);
 const models=rows.map(row=>{let aliases=[];try{aliases=JSON.parse(row.aliases_json||'[]')}catch{}return{key:String(row.model_key),name:String(row.name),cost:Number(row.cost||0),aliases:aliases.map(String).filter(Boolean).slice(0,80)}});
 let ignored=[];try{ignored=((await env.DB.prepare('SELECT phrase FROM profit_ignored_phrases').all()).results||[]).map(row=>String(row.phrase||'')).filter(Boolean)}catch{}
 const catalog=models.map(model=>`- ${model.key}: ${model.name} | الأسماء: ${[model.name,...model.aliases].join('، ')}`).join('\n');
 const schema={type:'object',additionalProperties:false,required:['items','unresolved_models'],properties:{
  items:{type:'array',items:{type:'object',additionalProperties:false,required:['model_key','quantity','evidence','confidence'],properties:{model_key:{type:'string',enum:models.map(model=>model.key)},quantity:{type:'integer',minimum:1,maximum:100},evidence:{type:'string'},confidence:{type:'number',minimum:0,maximum:1}}}},
  unresolved_models:{type:'array',items:{type:'string'}}
 }};
 const instructions=`أنت محرك فهم سياقي لطلبات ملابس أردنية. مهمتك تحديد الموديلات المباعة الجديدة وكمياتها فقط من القائمة المعطاة.
قواعد إلزامية:
1) افصل كل موديل عن الآخر واربط كل عدد وألوان بالموديل الأقرب له فقط.
2) العدد الصريح مثل "عدد 3" أو "3 قطع" أو "3 لون" له الأولوية. إذا لم يوجد، عدد الألوان المذكورة للموديل هو الكمية. افهم الأعداد المكتوبة بالكلمات مثل قطعة، قطعتين، ثلاث، أربعة وخمس.
3) لا تعتبر السعر أو الهاتف أو الوزن أو الطول أو المقاس أو التاريخ أو عدد الأيام أو التوصيل كمية. أمثلة: "68 كيلو" وزن، "18 د مع التوصيل" سعر، "بعد 4 أو 5 أيام" موعد.
4) حرف الواو لا يغير اللون: "اسود وكحلي وبيج" ثلاثة ألوان.
5) عبارات "تعديل" و"بدل" لا تنشئ طلبًا ثانيًا. عند "طلب جديد واسترجاع/استبدال/تبديل" احسب قطع البيع الجديدة فقط ولا تحسب القطع المرجعة ضمن البيع.
6) طابق المعنى والأسماء العامية والإملاء القريب مع موديل موجود. لا تنشئ model_key جديدًا ولا تغيّر الكوست.
7) unresolved_models يحتوي فقط عبارات تبدو فعلًا أسماء ملابس غير موجودة بالقائمة، وليس أسماء الأشخاص أو المناطق أو الألوان أو الوزن أو المقاس أو المواعيد.
8) إذا كان الموديل غير مؤكد فلا تخمن: ضعه في unresolved_models. استخدم confidence أقل من 0.75 عند الشك.
العبارات التي ليست موديلات ويجب تجاهلها: ${ignored.join('، ')||'لا يوجد'}.
قائمة الموديلات المركزية:
${catalog}`;
 let response;
 try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5-nano',instructions,input:text,reasoning:{effort:'minimal'},text:{format:{type:'json_schema',name:'corvex_profit_interpretation',strict:true,schema}}})})}catch{return json({error:'تعذر الاتصال بمحرك الفهم'},502)}
 const data=await response.json().catch(()=>({}));if(!response.ok)return json({error:data?.error?.message||'فشل الفهم السياقي'},502);
 let parsed={};try{parsed=JSON.parse(outputText(data))}catch{return json({error:'نتيجة الفهم غير صالحة'},502)}
 const byKey=new Map(models.map(model=>[model.key,model])),combined=new Map(),unresolved=new Set((parsed.unresolved_models||[]).map(value=>String(value||'').trim()).filter(Boolean));
 for(const item of parsed.items||[]){
  const model=byKey.get(String(item.model_key||'')),quantity=Math.max(1,Math.min(100,Number(item.quantity||1))),confidence=Number(item.confidence||0),evidence=String(item.evidence||'').trim();
  if(!model)continue;if(confidence<0.75){if(evidence)unresolved.add(evidence);continue}
  const previous=combined.get(model.key)||{id:model.key,name:model.name,qty:0,cost:0};previous.qty+=quantity;previous.cost=Number((previous.qty*model.cost).toFixed(2));combined.set(model.key,previous);
 }
 const items=[...combined.values()],cost=Number(items.reduce((sum,item)=>sum+item.cost,0).toFixed(2));
 return json({result:{cost,items,found:items.length,unknown:[...unresolved],semantic:true},model:data.model||env.OPENAI_MODEL||'gpt-5-nano'});
}
