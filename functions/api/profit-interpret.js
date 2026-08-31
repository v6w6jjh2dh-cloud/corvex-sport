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
const normalize=value=>String(value||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();
const explicitMModel=text=>/(?:بلوزه|بلوزة|تيشرت|تيشيرت|تشرت|بلايز)\s*(?:حرف\s*)?(?:m6|m|م6|[اأإ]م6|[اأإ]م|م)(?=\s|$)|(?:^|\s)و?حرف\s*(?:m|م|[اأإ]م)(?=\s|$)|(?:^|\s)(?:m6|م6|[اأإ]م6)(?=\s|$)|(?:^|\s)m(?=\s|$)/i.test(String(text||''));

export async function onRequestPost({request,env}){
 const user=await auth(request,env);if(!await allowed(env,user))return json({error:'لا تملك صلاحية تحليل الأرباح'},403);
 if(!env.OPENAI_API_KEY)return json({error:'الفهم السياقي للأرباح غير مفعّل'},503);
 let body={};try{body=await request.json()}catch{return json({error:'بيانات غير صالحة'},400)}
 if(body.scope!=='profits')return json({error:'هذا المحرك مخصص للأرباح فقط'},400);
 const text=String(body.text||'').trim().slice(0,6000);if(!text)return json({error:'نص الطلب مطلوب'},400);

 let rows=[];try{rows=(await env.DB.prepare("SELECT model_key,name,cost,aliases_json FROM profit_models WHERE active=1 ORDER BY name").all()).results||[]}catch{return json({error:'قائمة موديلات الأرباح غير جاهزة'},503)}
 if(!rows.length)return json({error:'لا توجد موديلات معرفة'},409);
 const models=rows.map(row=>{let aliases=[];try{aliases=JSON.parse(row.aliases_json||'[]')}catch{}const key=String(row.model_key),unsafeM=new Set(['ام','م']);if(key==='m')aliases=aliases.filter(alias=>!unsafeM.has(normalize(alias)));return{key,name:String(row.name),cost:Number(row.cost||0),aliases:aliases.map(String).filter(Boolean).slice(0,80)}});
 let ignored=[];try{ignored=((await env.DB.prepare('SELECT phrase FROM profit_ignored_phrases').all()).results||[]).map(row=>String(row.phrase||'')).filter(Boolean)}catch{}
 const catalog=models.map(model=>`- ${model.key}: ${model.name} | الأسماء البديلة: ${[model.name,...model.aliases].join('، ')}`).join('\n');
 const schema={type:'object',additionalProperties:false,required:['items','unresolved_models'],properties:{
  items:{type:'array',items:{type:'object',additionalProperties:false,required:['model_key','quantity','evidence','confidence'],properties:{model_key:{type:'string',enum:models.map(model=>model.key)},quantity:{type:'integer',minimum:1,maximum:100},evidence:{type:'string'},confidence:{type:'number',minimum:0,maximum:1}}}},
  unresolved_models:{type:'array',items:{type:'string'}}
 }};
 const instructions=`أنت محرك فهم سياقي مخصص حصراً لحساب كوست الطلب داخل صفحة أرباح CORVEX. لا تستخرج الاسم أو الهاتف أو العنوان أو المحافظة أو سعر البيع، ولا تعدّل الطلب.

المطلوب: حدد قطع البيع الجديدة فقط، واربط كل موديل بكميته من قائمة الموديلات المركزية أدناه.

قواعد إلزامية:
1) افصل الموديلات الموجودة في الطلب نفسه. لا تسمح لعدد أو ألوان موديل أن تنتقل إلى موديل آخر.
2) العدد الصريح له الأولوية، سواء جاء قبل الموديل أو بعده: "عدد 3"، "3 قطع"، "3 لون"، "اولد ماني 3"، "3 اولد ماني". افهم الأرقام العربية والإنجليزية والأعداد المكتوبة بالكلمات مثل قطعة، قطعتين، ثلاث، أربعة وخمس.
3) إذا لم يوجد عدد صريح للموديل، احسب عدد ألوانه فقط. مثال "اسود وكحلي وبيج" = 3 قطع.
4) ممنوع اعتبار سعر البيع أو رقم الهاتف أو الوزن أو الطول أو المقاس أو التوصيل أو التاريخ أو عدد الأيام كمية. أمثلة: "68 كيلو" وزن، "18 د مع التوصيل" سعر، "خليه أربع خمس أيام" موعد وليس كمية.
5) كلمة "تعديل" وحدها لا تنشئ بيعاً ثانياً. في "طلب جديد واسترجاع قطعة" أو "طلب جديد واستبدال/تبديل" احسب القطع الجديدة المباعة فقط، ولا تحسب القطع المرجعة ضمن البيع.
6) افهم العامية والأخطاء الإملائية القريبة، لكن اختر فقط model_key موجوداً في القائمة. لا تنشئ موديلات ولا تغيّر الكوست.
7) إذا تكرر اسم بديل داخل وصف الموديل نفسه فهو موديل واحد، وليس قطعتين ولا موديلين.
8) unresolved_models يحتوي فقط عبارة تبدو فعلاً اسم قطعة ملابس وغير موجودة في القائمة. لا تضع فيه اسم شخص أو منطقة أو لون أو وزن أو مقاس أو موعد أو كلمة كيلو.
9) إذا لم تكن واثقاً من الموديل فلا تخمن: ضعه في unresolved_models واجعل confidence أقل من 0.75.
10) "أم" في بداية اسم شخص ليست حرف M وليست موديلًا أبداً. أمثلة ممنوعة: أم فؤاد، أم أمير، أم أحمد، أم محمد، أم علي، أم عمر، أم خالد، أم يوسف، أم يزن، أم ليث، أم شادي، أم جوري، أم رهف، أم نور، أم سارة، أم مريم، أم آية، أم لين، أم لمار، أم ريتال. وكذلك أسماء النساء مثل فاطمة، خديجة، عائشة، زينب، مريم، سارة، نور، آية، رهف، لين، لمار، ريتال، جنى، فرح، إسراء، هبة، رنا، دانا، ديانا ليست موديلات.
11) موديل M يُقبل فقط مع دليل ملابس واضح مثل "تيشيرت ام" أو "بلوزه ام" أو "حرف ام" أو "وحرف ام" أو "بلوزة M" أو الرمز M6/ام6. لا تقبل كلمة "أم" العربية المنفردة كاسم بديل للموديل.

أمثلة واجبة:
- "اولد ماني + 3 لون اسود" = Old Money عدد 3.
- "بلوزه اولد ماني + عدد 3" = Old Money عدد 3.
- "جيوب عادي + السعر 11 شامل التوصيل" = جيوب عادي عدد 1، وليس 11.
- "عدد 2 قطعة، جيب سحاب، اسود وزيتي، عدد 1 قطعة، بلوزة بولو، بني" = جيب سحاب عدد 2 + بولو عدد 1.
- "بنطلون تركي، ثلاث الوان، اسود وكحلي وبيج، وزن 68 كيلو" = بنطلون تركي عدد 3.

عبارات تم تحديدها يدوياً بأنها ليست موديلات ويجب تجاهلها: ${ignored.join('، ')||'لا يوجد'}.

قائمة الموديلات المركزية:
${catalog}`;
 let response;
 try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5-nano',instructions,input:text,reasoning:{effort:'minimal'},text:{format:{type:'json_schema',name:'corvex_profit_interpretation',strict:true,schema}}})})}catch{return json({error:'تعذر الاتصال بمحرك فهم الأرباح'},502)}
 const data=await response.json().catch(()=>({}));if(!response.ok)return json({error:data?.error?.message||'فشل الفهم السياقي للأرباح'},502);
 let parsed={};try{parsed=JSON.parse(outputText(data))}catch{return json({error:'نتيجة فهم الأرباح غير صالحة'},502)}
 const byKey=new Map(models.map(model=>[model.key,model])),combined=new Map(),unresolved=new Set((parsed.unresolved_models||[]).map(value=>String(value||'').trim()).filter(Boolean));
 for(const item of parsed.items||[]){
  const model=byKey.get(String(item.model_key||'')),quantity=Math.max(1,Math.min(100,Number(item.quantity||1))),confidence=Number(item.confidence||0),evidence=String(item.evidence||'').trim();
  if(!model)continue;if(model.key==='m'&&!explicitMModel(text))continue;if(confidence<0.75){if(evidence)unresolved.add(evidence);continue}
  const previous=combined.get(model.key)||{id:model.key,name:model.name,qty:0,cost:0};previous.qty+=quantity;previous.cost=Number((previous.qty*model.cost).toFixed(2));combined.set(model.key,previous);
 }
 const items=[...combined.values()],cost=Number(items.reduce((sum,item)=>sum+item.cost,0).toFixed(2));
 return json({result:{cost,items,found:items.length,unknown:[...unresolved],semantic:true,scope:'profits'},model:data.model||env.OPENAI_MODEL||'gpt-5-nano'});
}
