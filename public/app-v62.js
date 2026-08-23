const state={token:localStorage.getItem('corvex_token')||'',user:null,view:'dashboard',orders:[],selected:new Set(),stats:{},batches:[],regionGroups:[],dynamicPlaceToGov:new Map(),dynamicPlaces:[]};
const $=s=>document.querySelector(s);const app=$('#app');
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2400)}
async function api(path,opts={}){const headers={'content-type':'application/json',...(opts.headers||{})};if(state.token)headers.authorization=`Bearer ${state.token}`;const r=await fetch('/api'+path,{...opts,headers});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||'حدث خطأ');Object.assign(e,d,{status:r.status});throw e}return d}

function can(p){
  return state.user?.role==='admin'||(state.user?.permissions||[]).includes(p);
}
function isTrackingOnly(){
  return state.user?.role!=='admin'&&(state.user?.permissions||[]).includes('tracking_readonly');
}
function homeView(){
  if(can('dashboard'))return 'dashboard';
  if(can('orders_view'))return 'orders';
  if(can('reports'))return 'reports';
  return 'orders';
}
async function loadRegionIndex(force=false){
  try{
    if(!force){
      const cached=sessionStorage.getItem('corvex_regions_v27');
      if(cached){
        const parsed=JSON.parse(cached);
        state.regionGroups=parsed;
        const map=new Map();
        for(const g of state.regionGroups){
          for(const r of (g.regions||[])){
            for(const alias of placeAliases(r.name))map.set(alias,g.governorate||g.name);
          }
          for(const alias of placeAliases(g.name))map.set(alias,g.governorate||g.name);
        }
        state.dynamicPlaceToGov=map;
        state.dynamicPlaces=[...map.keys()].sort((a,b)=>b.length-a.length);
        return;
      }
    }
    const d=await api('/regions');
    state.regionGroups=d.groups||[];
    sessionStorage.setItem('corvex_regions_v27',JSON.stringify(state.regionGroups));
    const map=new Map();
    for(const g of state.regionGroups){
      for(const r of (g.regions||[])){
        for(const alias of placeAliases(r.name))map.set(alias,g.governorate||g.name);
      }
      for(const alias of placeAliases(g.name))map.set(alias,g.governorate||g.name);
    }
    state.dynamicPlaceToGov=map;
    state.dynamicPlaces=[...map.keys()].sort((a,b)=>b.length-a.length);
  }catch(e){}
}
function esc(v=''){return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function fmtDate(v){if(!v)return'';return new Date(v+'Z').toLocaleString('ar-JO',{dateStyle:'short',timeStyle:'short'})}
function money(v){return Number(v||0).toFixed(2)}
function normalizeDigits(v=''){
  const map = {
    '٠':'0','١':'1','٢':'2','٣':'3','٤':'4',
    '٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
    '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4',
    '۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'
  };
  return String(v).replace(/[٠-٩۰-۹]/g, d=>map[d]||d);
}

function normalizeArabic(v=''){
  return normalizeDigits(v)
    .toLowerCase()
    .replace(/[إأآٱ]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ؤ/g,'و')
    .replace(/ئ/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/[ًٌٍَُِّْـ]/g,'')
    .replace(/[^\u0600-\u06FFa-z0-9+\s]/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const COMMON_NAMES = new Set(`
محمد احمد محمود مصطفى عبدالله عبدالرحمن ابراهيم اسماعيل يوسف يزن ياسين ياسر عمر عثمان علي حسن حسين حسام حمزة خالد خليل رائد رامي سامر سامي سائد سعيد سعد سيف سلطان سليمان شادي شاهر شريف صفوان طارق طلال عادل عدي عدنان عمار عامر علاء عيسى غسان فادي فارس فراس فيصل قيس كريم كرم لؤي ليث ماهر مازن مالك مراد معاذ معن موسى مؤمن ناصر نايف هاني هيثم وائل وسام وسيم وليد زيد زياد زكريا بهاء براء بشار بلال تامر تيم جمال جميل جهاد جواد حاتم حارث ربيع ركان رعد سفيان شاكر ادم ايهم امجد انس اياد ايمن اشرف اكرم نور
فاطمة مريم سارة هبة اية لين ليان لجين جنى جود رنا رانيا ريهام ريم روان رولا ربى زينب زينة زهراء سمر سما سمية سناء سوسن شذى شهد شيماء صفاء ضحى عبير عائشة علا غدير فرح كندة لمى لانا لارا ليلى لينا ميس نادين نسرين نهى هناء هيا يارا ياسمين تالا تيا حلا حنان خلود دانا دعاء ديمة راما رند ريتال بيان بسمة بشرى اسراء ايمان امل ابتسام اسمهان
`.trim().split(/\s+/).map(normalizeArabic));

`
ادهم أديب ارسلان اكرم الياس امير ايهاب باسل باسم باهر بدر برهان ثائر جابر جعفر حازم خضر دريد ذياب زاهر زهير سرمد سهيل شهم صهيب ضرغام عاصم عباس عبد عز عروة عكرمة عمران عواد فؤاد كاظم كامل كنان مجد مجدي محسن مروان منذر مهدي مهند نايل نبيل نزار نضال هشام هلال همام هزاع رشيد صالح صابر صادق صبحي صدام ضياء عارف عاطف عبدالحليم عبدالكريم عبدالرزاق عبدالسلام عبدالقادر عبداللطيف عبدالمجيد عبدالوهاب عطا عوني غالب ماهر ممدوح منصور ناجي نجيب نهاد
اسيل الاء اروى اريج بتول بيسان تسنيم جمان جمانة جودي ديالا رزان رنيم زلفى سلسبيل سيرين صبا طيبة غنى كادي كارما كوثر ماريا ماسة مها منال منى ميرا ميرنا نبال ندى نورهان وعد ولاء
`.trim().split(/\s+/).map(normalizeArabic).forEach(n=>COMMON_NAMES.add(n));

function learnedArabicNames(){
  try{return new Set((JSON.parse(localStorage.getItem('corvex_learned_names')||'[]')||[]).map(normalizeArabic))}catch{return new Set()}
}
function isKnownArabicGivenName(word){
  const n=normalizeArabic(String(word||''));
  return COMMON_NAMES.has(n)||learnedArabicNames().has(n);
}
function learnAcceptedArabicName(value){
  const n=normalizeArabic(String(value||''));
  if(!n||n==='لا يوجد')return;
  const first=n.split(/\s+/).filter(Boolean)[0];
  if(!first||first.length<2)return;
  const learned=learnedArabicNames();
  learned.add(first);
  localStorage.setItem('corvex_learned_names',JSON.stringify([...learned].slice(-1000)));
}

const JORDAN_GOVERNORATES = {
  "عمان": ["عمان", "الجاردنز", "جاردنز", "عبدون", "دير غبار", "الصويفية", "الرابية", "ام اذينة", "أم أذينة", "الكرسي", "تلاع العلي", "خلدا", "دابوق", "ام السماق", "أم السماق", "الشميساني", "جبل الحسين", "جبل عمان", "جبل النصر", "جبل التاج", "جبل الزهور", "جبل الاشرفية", "الأشرفية", "الاشرفية", "العبدلي", "راس العين", "رأس العين", "المقابلين", "الياسمين", "مرج الحمام", "البيادر", "بيادر وادي السير", "وسط البلد", "الوحدات", "القويسمة", "الموقر", "الجويدة", "جاوا", "اليادودة", "خريبة السوق", "ناعور", "وادي السير", "صويلح", "الجبيهة", "طبربور", "ماركا", "ماركا الشمالية", "ماركا الجنوبية", "ابو نصير", "أبو نصير", "شفا بدران", "شفا بدران", "ضاحية الرشيد", "ضاحية الامير راشد", "ضاحية الأمير راشد", "المدينة الرياضية", "شارع المدينة المنورة", "شارع مكة", "الدوار السابع", "السابع", "الدوار الثامن", "الثامن", "الدوار السادس", "السادس", "الدوار الخامس", "الخامس", "الدوار الرابع", "الرابع", "الدوار الثالث", "الثالث", "الدوار الثاني", "الثاني", "الدوار الاول", "الاول", "أبو علندا", "ابو علندا", "القسطل", "سحاب", "الجيزة", "اللبن", "نتل", "ام الرصاص", "أم الرصاص", "حسبان", "الطنيب", "المشتى", "اليادوده", "أم البساتين", "ام البساتين", "منجا", "ام العمد", "أم العمد", "الماضونة", "الرقيم", "خشافية الشوابكة", "خشافية الدبايبة", "الموقر", "الذهيبة الغربية", "الذهيبة الشرقية", "رجوم الشامي", "الفيصلية عمان", "الزميلات", "الطالبيه", "الطالبية", "الماضونة", "بدر الجديدة", "بدر نزال", "نزال", "حي نزال", "الهاشمي الشمالي", "الهاشمي الجنوبي", "الهاشمي", "المحطة", "النزهة", "طبربور طارق", "طارق", "ضاحية الاقصى", "ضاحية الأقصى", "ماركا طارق", "عرجان عمان", "خلدا ام السماق", "أبو السوس", "ابو السوس", "الكمالية", "الرباحية", "الرباحية الشمالية", "الرباحية الجنوبية", "الظهير", "النهارية", "حسبان الجديدة"],
  "إربد": ["اربد", "إربد", "الرمثا", "الحصن", "ايدون", "إيدون", "حوارة", "بني عبيد", "بني كنانة", "سما الروسان", "الشجرة", "الطرة", "المزار الشمالي", "الوسطية", "كفر اسد", "كفر أسد", "دير ابي سعيد", "دير أبي سعيد", "الكورة", "الاغوار الشمالية", "الأغوار الشمالية", "الشونة الشمالية", "الطيبة اربد", "الطيبة", "النعيمة", "سال", "بشرى", "بيت راس", "بيت رأس", "حكما", "كفر يوبا", "كفر يوبا", "زحر", "حور", "كفر جايز", "مرو", "عالية", "ناتفة", "فوعرا", "كفر أسد", "سموع", "قفقفا اربد", "حريما", "سحم الكفارات", "ملكا", "ام قيس", "أم قيس", "خرجا", "حبراص", "حرثا", "يبلا", "الشونة الشمالية", "وقاص", "كريمة", "المنشية", "المشارع", "العدسية", "الشيخ حسين", "دير السعنة", "كفر راكب", "جديتا", "تبنة", "كفر عوان", "بيت ايدس", "بيت إيدس", "جنين الصفا", "ارحابا", "إرحابا", "زمال", "سموع الكورة", "كفر الماء", "كفر الماء", "حوفا الوسطية", "قم", "كفر سوم", "الرفيد", "سمر", "عقربا", "حرتا", "رحابا", "كفر ابيل", "كفر أبيل", "صمد", "مخيم اربد", "مخيم إربد"],
  "الزرقاء": ["الزرقاء", "الرصيفة", "الهاشمية", "الضليل", "بيرين", "الازرق", "الأزرق", "حي معصوم", "الغويرية", "الزواهرة", "جبل طارق", "جبل الامير حسن", "جبل الأمير حسن", "جبل النصر الزرقاء", "حي رمزي", "حي الأمير محمد", "حي الامير محمد", "الزرقاء الجديدة", "الزرقاء القديمة", "السخنة", "عوجان", "المصانع", "الحلابات", "الحلابات الشرقية", "الحلابات الغربية", "ام رمانة", "أم رمانة", "خالدية الزرقاء", "الكمشة", "صروت", "عين الصفراء", "الغباوي", "جناعة", "وادي الحجر", "حي الحسين", "حي شاكر", "حي الجندي", "ماركا الزرقاء", "المدينة الصناعية الزرقاء", "مخيم حطين", "حطين", "مخيم الزرقاء"],
  "المفرق": ["المفرق", "رحاب", "بلعما", "منشية بني حسن", "ام الجمال", "أم الجمال", "الرويشد", "الصفاوي", "الخالدية", "حوشا", "الباعج", "ام القطين", "أم القطين", "صبحا", "الدفيانة", "سما السرحان", "مغير السرحان", "رباع السرحان", "الزعتري", "منشية السلطة", "نايفة", "رحاب المفرق", "ثغرة الجب", "البويضة", "حويجة", "الحمرا", "الفحيلية", "دير الكهف", "الرويشد", "المنشية", "الرحبة", "الحرش", "الهاشمية المفرق", "بلعما الجديدة"],
  "عجلون": ["عجلون", "كفرنجة", "كفرنجه", "عنجرة", "صخرة", "عبين", "عبلين", "راسون", "الوهادنة", "اشتفينا", "عين جنا", "عرجان", "باعون", "حلاوة", "الهاشمية عجلون", "الطيارة", "الشفا", "سامتا", "منطقة القلعة", "الصفصافة", "محنا", "خشيبة", "مخيم عجلون", "وادي الطواحين", "ام الينابيع", "أم الينابيع", "الحرث", "المرجم", "الوهادنة"],
  "جرش": ["جرش", "سوف", "ساكب", "برما", "المصطبة", "الكتة", "الكته", "قفقفا", "ريمون", "مخيم جرش", "دبين", "جبة", "جبا", "الحدادة", "مقبلة", "نحلة", "مرصع", "الجزازة", "الكفير", "بليلا", "الكفرين جرش", "الرحمانية", "منشية جرش", "المشيرفة جرش", "الرشايدة جرش", "دير الليات", "ظهر السرو", "عين الديك", "ام الزيتون جرش", "أم الزيتون جرش"],
  "البلقاء": ["السلط", "البلقاء", "عين الباشا", "البقعة", "الفحيص", "ماحص", "الشونة الجنوبية", "دير علا", "الكريمة", "الصبيحي", "زي", "علان", "يرقا", "ام جوزة", "أم جوزة", "العارضة", "سويمة", "الكرامة", "الرامة", "الروضة", "الشونة الجنوبية", "الشونة الوسطى", "معدي", "مثلث العارضة", "ابو عبيدة", "أبو عبيدة", "الطوال الجنوبي", "الطوال الشمالي", "الدامية", "ضرار", "دير علا", "خزما", "الشيخ حسين البلقاء", "العيرا", "وادي شعيب", "الصبيحي", "سلط القديمة", "السرو", "جلعد", "صافوط", "ابو نصير البلقاء", "أبو نصير البلقاء", "السلط الجديدة", "نقب الدبور"],
  "مادبا": ["مادبا", "ذيبان", "مليح", "ماعين", "مكاور", "الفيصلية", "لب", "جرينة", "منشية ماعين", "المريجمات", "الفيحاء مادبا", "الفيصلية مادبا", "عيون موسى", "نيبو", "جبل نيبو", "حسبان مادبا", "حنينا", "العريض", "ام الرصاص مادبا", "أم الرصاص مادبا", "الهيدان", "دلاغة مادبا", "ذيبان الجديدة", "خريبة السوق مادبا"],
  "الكرك": ["الكرك", "مؤتة", "المزار الجنوبي", "الربة", "القصر", "فقوع", "غور الصافي", "الاغوار الجنوبية", "الأغوار الجنوبية", "الثنية", "مرود", "ادر", "أدر", "بتير الكرك", "العدنانية", "القطرانة", "الحسينية الكرك", "عي", "كفر راكب الكرك", "الطيبة الكرك", "ذات راس", "ذات رأس", "الربة", "سماكية", "منشية ابو حمور", "منشية أبو حمور", "المرج", "المنشية الكرك", "غور المزرعة", "غور حديثة", "النقع", "صرفا", "الجدعا", "حمود", "الجدعة", "الوسية"],
  "الطفيلة": ["الطفيلة", "بصيرا", "الحسا", "القادسية", "غرندل", "عين البيضاء", "عفرا", "ضانا", "الرشادية", "العيص", "الحسين", "ارويم", "أرويم", "صنفحة", "شيظم", "عيمة", "سلع", "ابو بنا", "أبو بنا", "البرنيس", "المسيرة", "عين البيضاء الطفيلة", "الحسا الطفيلة", "بصيرا الجديدة"],
  "معان": ["معان", "الشوبك", "وادي موسى", "البتراء", "الحسينية", "الجفر", "اذرح", "أذرح", "المريغة", "راس النقب", "رأس النقب", "الطيبة معان", "الراجف", "الهيشة", "البيضا", "ام صيحون", "أم صيحون", "المنصورة معان", "دلاغة", "قرين", "بسطا", "ايل", "إيل", "الجربا", "المحمدية", "الشوبك الجديدة", "الفرذخ", "الحميمة معان", "الشراه", "الجعفرية معان"],
  "العقبة": ["العقبة", "القويرة", "وادي رم", "الديسة", "الريشة", "الحميمة", "رحمة", "القريقرة", "وادي عربة", "بئر مذكور", "بير مذكور", "الريشة العقبة", "الحميمة العقبة", "الشامية", "القرية", "المنطقة الصناعية العقبة", "الشاطئ الجنوبي", "الرميلة العقبة", "الخامسة العقبة", "التاسعة العقبة", "العاشرة العقبة"]
};

JORDAN_GOVERNORATES["عمان"].push("زيزيا", "الزيزيا");


function placeAliases(p){
  const n = normalizeArabic(p);
  const out = new Set([n]);

  if(n.startsWith('ال') && n.length > 3){
    out.add(n.slice(2));
  }else{
    out.add('ال' + n);
  }

  return [...out];
}

const PLACE_TO_GOV = new Map();
for(const [gov, places] of Object.entries(JORDAN_GOVERNORATES)){
  for(const p of places){
    for(const alias of placeAliases(p)){
      PLACE_TO_GOV.set(alias, gov);
    }
  }
}

const JORDAN_PLACES = [...PLACE_TO_GOV.keys()].sort((a,b)=>{
  const bw = b.split(/\s+/).length;
  const aw = a.split(/\s+/).length;
  if(bw !== aw) return bw-aw;
  return b.length-a.length;
});

const ADDRESS_WORDS = [
  'بجانب','جنب','قرب','مقابل','خلف','امام','شارع','دوار','حي','حاره','اشاره','موقع','الموقع','المكان','عنوان','العنوان','عنواني','سكان','ساكن',
  'مسجد','مدرسه','جامعه','مجمع','سوق','مخيم','اسكان','عماره','بنايه','صيدليه',
  'مستشفى','مول','فرع','السابع','الثامن','السادس','الرابع','الثالث','الاول'
].map(normalizeArabic);

const PRODUCT_WORDS = [
  'قطعه','قطع','قطعتين','بلايز','بلوز','بلوزه','تيشيرت','تيشيرتات','تيشرت','تي شيرت','تشيرت','بولو',
  'تركي','تريننغ','طقم','اطقم','بنطلون','بناطيل','شورت','بيجاما','جاكيت','هودي','قميص',
  'فستان','عبايه','تنوره','جينز','رياضه','سحاب','جيوب','جيب','بزرار','بزار','ريبوك','نايك','اديداس','بوما','زارا'
].map(normalizeArabic);

const DETAIL_WORDS = [
  'وزن','الوزن','وزني','مقاس','المقاس','قياس','لون','اللون','الوان',
  'اسود','ابيض','اخضر','ازرق','احمر','زهري','وردي','رمادي','رصاصي','سكني',
  'كحلي','بني','بيج','xl','xxl','xxxl','xxxxl','ميديوم','سمول','لارج'
].map(normalizeArabic);

const PRICE_WORDS = [
  'شامل السعر','السعر شامل','شامل التوصيل','مع التوصيل','وتوصيل','و توصيل',
  'السعر','سعر','المجموع','دينار','دنانير','د.ا','jd','jod'
].map(normalizeArabic);


const PARSER_INSTRUCTION_WORDS = [
  'تعديل','غير','تغيير','تصحيح','ملاحظه','ملاحظة','تنبيه','رجاء','يرجى',
  'استلام','توصيل','اتصال','اتصل','خصم','بدي','عاوز','اريد','أريد','طلب','تبديل','استبدال','مرتجع','ارجاع','إرجاع'
].map(normalizeArabic);

const COLOR_WORDS_V38 = [
  'اسود','ابيض','زيتي','زيتوني','اخضر','ازرق','احمر','زهري','وردي','رمادي',
  'رصاصي','سكني','كحلي','بني','بيج','خمري','عنابي','موف','بنفسجي','اصفر',
  'برتقالي','سكري','اوف وايت','اوفويت','سماوي','تركواز','فضي','ذهبي','ماروني',
  'نبيتي','كاكي','فستقي','نيلي','اورانج','برتقالي'
].map(normalizeArabic);

function phraseMatch(text, phrase){
  const n=' '+normalizeArabic(text)+' ';
  const p=' '+normalizeArabic(phrase)+' ';
  return !!normalizeArabic(phrase) && n.includes(p);
}

function containsPhraseFrom(text, list){
  return list.some(x=>phraseMatch(text,x));
}

function actualColorsInLine(line){
  const n=normalizeArabic(String(line||''));
  const tokens=n.split(/\s+/).filter(Boolean);
  const normalizedTokens=new Set();
  for(const t of tokens){
    normalizedTokens.add(t);
    let x=t;
    if(x.startsWith('و')&&x.length>2)x=x.slice(1);
    normalizedTokens.add(x);
    if(x.startsWith('ال')&&x.length>3)normalizedTokens.add(x.slice(2));
  }

  return COLOR_WORDS_V38.filter(c=>{
    if(c.includes(' '))return phraseMatch(n,c)||phraseMatch(n,'و'+c);
    return phraseMatch(n,c)||normalizedTokens.has(c)||normalizedTokens.has('ال'+c);
  });
}

function isQuantityLine(line){
  const n=normalizeArabic(String(line||''));
  return /\b\d+\s*(?:قطعه|قطع)\b/.test(n) ||
    /(?:قطعه|قطعة)\s*(?:واحده|واحدة)/.test(n) ||
    /(?:قطعتين|ثلاث\s+قطع|ثلاثه\s+قطع|ثلاثة\s+قطع|اربع\s+قطع|اربعه\s+قطع|أربع\s+قطع|خمس\s+قطع|سته\s+قطع|ست\s+قطع)/.test(n);
}

function isHeightLine(line){
  const n=normalizeArabic(String(line||''));
  return /(?:الطول|طولي|طوله|طول)\s*\d+/.test(n);
}

function isInstructionLine(line){
  const n=normalizeArabic(String(line||''));
  return PARSER_INSTRUCTION_WORDS.some(w=>phraseMatch(n,w));
}

function containsAny(n, words){
  return words.some(w => n.includes(w));
}

function canonicalJordanPhone(value){
  const digits=normalizeDigits(String(value||'')).replace(/\D/g,'');
  if(/^9627[789]\d{7}$/.test(digits))return '0'+digits.slice(3);
  if(/^7[789]\d{7}$/.test(digits))return '0'+digits;
  return digits;
}
function phonesFrom(line){
  const c=normalizeDigits(line).replace(/[\s-]/g,'');
  const matches=c.match(/(?:\+?962|0)?7[789]\d{7}/g)||[];
  return [...new Set(matches.map(canonicalJordanPhone).filter(Boolean))];
}

function phoneFrom(line){
  return phonesFrom(line)[0] || '';
}

function priceFrom(line){
  const n=normalizeArabic(String(line||''));
  if(!/\d/.test(n))return '';

  const number='(-?\\d+(?:\\.\\d+)?)';
  const currency='(?:دينار|دنانير|د\\s*ا|jd|jod)';
  const afterNumber=new RegExp(number+'\\s*(?:'+currency+'\\s*)?(?:شامل(?:\\s+السعر)?(?:\\s+و?\\s*التوصيل)?|مع\\s+التوصيل|و\\s*توصيل)(?=\\s|$)');
  const beforeNumber=new RegExp('(?:السعر|سعر|المجموع|شامل\\s+السعر(?:\\s+و?\\s*التوصيل)?|شامل\\s+التوصيل|مع\\s+التوصيل)(?:\\s+شامل\\s+السعر)?(?:\\s+و?\\s*التوصيل)?[^0-9-]{0,24}'+number);
  const withCurrency=new RegExp(number+'\\s*'+currency+'(?=\\s|$|مرتجع|ارجاع|استرجاع)');

  const match=n.match(afterNumber)||n.match(beforeNumber)||n.match(withCurrency);
  return match ? match[1] : '';
}

function isPriceLine(line){
  return priceFrom(line)!=='';
}

function isReturnOrderText(value){
  const n=normalizeArabic(String(value||''));
  return /(?:مرتجع|ارجاع|استرجاع)/.test(n);
}

function instructionFromPriceLine(line){
  let raw=normalizeDigits(String(line||''));
  raw=raw.replace(/-?\d+(?:\.\d+)?\s*(?:دنانير|دينار|د\.?ا|jd|jod)/ig,' ');
  raw=raw.replace(/(?:السعر\s*)?-?\d+(?:\.\d+)?\s*(?:دنانير|دينار|د\.?ا|jd|jod)?\s*(?:شامل(?:\s+السعر)?(?:\s+و?\s*التوصيل)?|مع\s+التوصيل|و\s*توصيل)/ig,' ');
  raw=raw.replace(/(?:السعر|سعر|المجموع|شامل\s+السعر|شامل\s+التوصيل|مع\s+التوصيل)(?:\s+شامل\s+السعر)?(?:\s+و?\s*التوصيل)?\s*-?\d+(?:\.\d+)?\s*(?:دنانير|دينار|د\.?ا|jd|jod)?/ig,' ');
  raw=raw.replace(/شامل\s+السعر|شامل\s+التوصيل|مع\s+التوصيل|(?:و\s*)?التوصيل|(?:و\s*)?توصيل|المجموع|السعر|سعر|دنانير|دينار/ig,' ');
  raw=raw.replace(/[💥🌼⭐🚨✨❤❤️]/gu,' ');
  raw=raw.replace(/^[\s،,.:;!_\/\\و-]+/,'').replace(/\s+/g,' ').trim();
  return raw;
}


const SHIPPING_ALIASES = {"عمان":["اسكان الكهرباء","إسكان الكهرباء","بسمان","بدر نزال","زهران","اليرموك","طارق","وادي السير","أحد","احد","حي رغدان","حي المدرج","حي الصالحين","الغروس","ام الاسود","أم الأسود","السويسة","الرباحية","زبدا","الرواق","الجرن","حي الرواق","حي الجرن","الخشافية الشمالية","الدبابية","المناخر","قاعفور","البيضا","رميدان","المدونة","حسبان","ناعور"],"الزرقاء":["الهاشمية الزرقاء","بيرين الزرقاء","الضليل الزرقاء","الأزرق","الازرق"],"إربد":["الرمثا","الشونة الشمالية","دير أبي سعيد","دير ابي سعيد","الطيبة إربد","الطيبة اربد","الشجرة الرمثا","الطرة الرمثا","سحم الكفارات","سحم الكفارات إربد"],"البلقاء":["دير علا","ديرعلا","الشونة الجنوبية","العارضة السلط","زي السلط","عيرا السلط","يرقا السلط"],"الكرك":["مؤتة","مؤته","الثنية الكرك","الربة","الربه","فقوع","عي","غور المزرعة","غور المزرعه"],"معان":["الحسينية معان","الحسينيه معان","الجفر","اذرح","أذرح","الطيبة البترا","الطيبه البترا"],"المفرق":["أم الجمال","ام الجمال","رحاب المفرق","منشية بني حسن","منشيه بني حسن","سما السرحان","صبحا المفرق"],"الطفيلة":["بصيرا","بصيرة","القادسية الطفيلة","القادسيه الطفيله","الحسا الطفيلة","الحسا الطفيله"],"مأدبا":["مادبا","مأدبا","ماعين مادبا","مليح مادبا","ذيبان مادبا","الفيصلية مادبا","الفيصليه مادبا"],"جرش":["سوف جرش","ساكب جرش","برما جرش","المصطبة جرش","المصطبه جرش","قفقفا جرش","الكته","الكتة جرش"],"عجلون":["كفرنجا","كفرنجة","عنجرة عجلون","عبين عجلون","عبلين","راسون","صخرة عجلون","صخره عجلون"],"العقبة":["القويرة","القويره","الديسة","الديسي","وادي رم","وادي عربة العقبة","وادي عربه العقبه"]};


const EXPLICIT_GOVERNORATES = [
  ['عمان',['عمان','عمّان']],
  ['الزرقاء',['الزرقاء']],
  ['إربد',['إربد','اربد']],
  ['المفرق',['المفرق']],
  ['السلط',['السلط']],
  ['البلقاء',['البلقاء']],
  ['الكرك',['الكرك']],
  ['الطفيلة',['الطفيلة','الطفيله']],
  ['معان',['معان']],
  ['العقبة',['العقبة','العقبه']],
  ['مأدبا',['مأدبا','مادبا']],
  ['جرش',['جرش']],
  ['عجلون',['عجلون']]
];


const PRIORITY_LOCAL_ALIASES = [
  ['عمان',['منطقة بدر الجديدة','منطقه بدر الجديده','بدر الجديدة','بدر الجديده','زيزيا','الزيزيا','الجاردنز','جاردنز']],
  ['الزرقاء',['جبل فيصل','ضاحية الأمير حسن','ضاحية الامير حسن','الازرق الشمالي','الأزرق الشمالي','عوجان الرصيفه','عوجان الرصيفة','الرصيفه','الرصيفة']],
  ['عمان',['سحاب','القويسمة','القويسمه','شارع الإذاعة والتلفزيون','شارع الاذاعه والتلفزيون','شارع الاذاعة والتلفزيون','شارع الاذاعه و التلفزيون','شارع الاذاعة و التلفزيون','ناعور','اسكان الكهرباء','إسكان الكهرباء']],
  ['جرش',['مخيم جرش','مخيم غزة','مخيم غزه']],
  ['إربد',['ارحابا','إرحابا','الأغوار الشمالية','الاغوار الشمالية','الأغوار الشمالي','الاغوار الشمالي']],
  ['السلط',['السلط','صبيحي','الصبيحي']],
  ['عمان',['الدوار الثامن','دوار الثامن','الثامن','الدوار السابع','دوار السابع','السابع','الدوار السادس','دوار السادس','السادس','الدوار الخامس','دوار الخامس','الخامس','الدوار الرابع','دوار الرابع','الرابع','الدوار الثالث','دوار الثالث','الثالث','الدوار الثاني','دوار الثاني','الثاني','الدوار الأول','دوار الاول','دوار الأول','الاول','الأول']]
];

function priorityLocalMatch(line){
  const n=normalizeArabic(String(line||''));
  let best=null;
  for(const [gov,names] of PRIORITY_LOCAL_ALIASES){
    for(const raw of names){
      const a=normalizeArabic(raw);
      if(a && phraseMatch(n,a) && (!best || a.length>best.alias.length)){
        best={governorate:gov,alias:a,raw};
      }
    }
  }
  return best;
}

function explicitGovernorateMatch(line){
  const n=normalizeArabic(String(line||''));
  const compact=n.replace(/\s+/g,'');
  let best=null;
  for(const [gov,names] of EXPLICIT_GOVERNORATES){
    for(const raw of names){
      const a=normalizeArabic(raw);
      const ac=a.replace(/\s+/g,'');
      const normalHit=phraseMatch(n,a);
      const gluedHit=ac.length>=4 && compact.includes(ac);
      if((normalHit||gluedHit) && (!best || a.length>best.alias.length)){
        best={governorate:gov,alias:a,raw};
      }
    }
  }
  return best;
}

function shippingAliasMatch(line){
  const n=normalizeArabic(String(line||''));
  let best=null;
  for(const [gov,names] of Object.entries(SHIPPING_ALIASES)){
    for(const raw of names){
      const a=normalizeArabic(raw);
      if(a && phraseMatch(n,a) && (!best || a.length>best.alias.length)){
        best={alias:a,governorate:gov,raw};
      }
    }
  }
  return best;
}

function findBestPlace(line){
  const priorityLocal=priorityLocalMatch(line);
  if(priorityLocal){
    return {place:priorityLocal.alias,governorate:priorityLocal.governorate,words:priorityLocal.alias.split(/\s+/).length,chars:priorityLocal.alias.length,isGovernorateName:false};
  }

  const explicitGov=explicitGovernorateMatch(line);
  if(explicitGov){
    return {place:explicitGov.alias,governorate:explicitGov.governorate,words:explicitGov.alias.split(/\s+/).length,chars:explicitGov.alias.length,isGovernorateName:true};
  }

  const aliasHit=shippingAliasMatch(line);
  if(aliasHit){
    return {place:aliasHit.alias,governorate:aliasHit.governorate,words:aliasHit.alias.split(/\s+/).length,chars:aliasHit.alias.length,isGovernorateName:false};
  }
  const n=normalizeArabic(line);
  const matches=[];
  const dyn=state.dynamicPlaces||[];
  for(const p of dyn){
    if(phraseMatch(n,p)){
      const gov=state.dynamicPlaceToGov.get(p)||'';
      matches.push({place:p,governorate:gov,words:p.split(/\s+/).length,chars:p.length,isGovernorateName:p===normalizeArabic(gov)});
    }
  }
  for(const p of JORDAN_PLACES){
    if(phraseMatch(n,p)){
      const gov=PLACE_TO_GOV.get(p)||'';
      matches.push({place:p,governorate:gov,words:p.split(/\s+/).length,chars:p.length,isGovernorateName:p===normalizeArabic(gov)});
    }
  }
  if(!matches.length)return null;
  matches.sort((a,b)=>{
    if(a.isGovernorateName!==b.isGovernorateName)return a.isGovernorateName?1:-1;
    if(b.words!==a.words)return b.words-a.words;
    return b.chars-a.chars;
  });
  return matches[0];
}

function splitAreaAddress(line){
  const rawLine=String(line||'').trim();
  const rawNorm=normalizeArabic(rawLine);
  const hasAddressPrefix=/^(?:سكان|ساكن|ساكنه|ساكنة|عنواني|العنوان|عنوان|المكان|موقع|الموقع)\b/.test(rawNorm);

  const priorityLocal=priorityLocalMatch(line);
  if(priorityLocal){
    return {area:priorityLocal.governorate,address:String(line||'').trim()};
  }

  const explicitGov=explicitGovernorateMatch(line);
  if(explicitGov){
    return {area:explicitGov.governorate,address:String(line||'').trim()};
  }

  const aliasHit=shippingAliasMatch(line);
  if(aliasHit){
    return {area:aliasHit.governorate,address:String(line||'').trim()};
  }
  const original = String(line).trim();
  const hit = findBestPlace(original);

  if(!hit) return {area:'', address:''};

  return {
    area: hit.governorate,
    address: original
  };
}

function isLikelyProductOrDetail(line){
  const n = normalizeArabic(line);
  if(containsAny(n, PRODUCT_WORDS)) return true;
  if(containsAny(n, DETAIL_WORDS)) return true;
  if(/\b(?:s|m|l|xl|xxl|xxxl|xxxxl)\b/i.test(line)) return true;
  if(/^\s*\d+\s+/.test(String(line)) && !isPriceLine(line)) return true;
  return false;
}


function hasStrongAddressCue(line){
  const n=normalizeArabic(String(line||''));
  if(/^(?:سكان|ساكن|ساكنه|ساكنة|عنواني|العنوان|عنوان|المكان|موقع|الموقع|المنطقه|المنطقة)\b/.test(n))return true;
  return ADDRESS_WORDS.some(w=>phraseMatch(n,w));
}

function looksLikeFutureLocationInstruction(line){
  const n=normalizeArabic(String(line||''));
  return /(?:يبعث|يبعت|يعطي|ابعت|ابعث).*(?:لوكيشن|الوكيشن|موقع)/.test(n) ||
    /(?:لوكيشن|الوكيشن).*(?:لاحقا|بعدين|بعدها)/.test(n);
}


function findBestPlaceRawOnly(line){
  const n=normalizeArabic(String(line||''));
  const candidates=[];
  for(const p of (state.dynamicPlaces||[])){
    if(phraseMatch(n,p))candidates.push(p);
  }
  for(const p of JORDAN_PLACES){
    if(phraseMatch(n,p))candidates.push(p);
  }
  return candidates.some(p=>String(p).length>=4);
}


function isOnlyColorsLine(line){
  const tokens=normalizeArabic(String(line||'')).split(/\s+/).filter(Boolean);
  if(!tokens.length)return false;
  const colorSet=new Set(COLOR_WORDS_V38.filter(x=>!x.includes(' ')));
  let found=false;
  for(let token of tokens){
    if(token==='و'||token==='اللون'||token==='الوان'||token==='الالوان')continue;
    if(token.startsWith('و')&&token.length>2)token=token.slice(1);
    if(token.startsWith('ال')&&token.length>3)token=token.slice(2);
    if(!colorSet.has(token))return false;
    found=true;
  }
  return found;
}

function isHardNonNameLine(line){
  const raw=String(line||'').trim();
  const n=normalizeArabic(raw);

  if(!raw)return true;
  if(isOnlyColorsLine(raw))return true;
  if(phoneFrom(raw)||isPriceLine(raw))return true;
  if(/\d/.test(normalizeDigits(raw)))return true;
  if(isInstructionLine(raw)||looksLikeFutureLocationInstruction(raw))return true;

  if(/^(?:سكان|ساكن|ساكنه|ساكنة|عنواني|العنوان|عنوان|المكان|موقع|الموقع|المنطقه|المنطقة|طلب|تبديل|استبدال|مرتجع|ارجاع|إرجاع)\b/.test(n))return true;

  if(containsAny(n,PRODUCT_WORDS))return true;
  if(isQuantityLine(raw)||isHeightLine(raw))return true;

  if(/(?:وزن|الوزن|وزني|وزنه|الطول|طولي|مقاس|المقاس|قياس|سايز|السايز|size|لون|اللون|الوان|الالوان|ترند|موديل|عرض)/i.test(n))return true;

  // Strong operational location signals are never names.
  if(priorityLocalMatch(raw)||explicitGovernorateMatch(raw)||shippingAliasMatch(raw))return true;
  if(ADDRESS_WORDS.some(w=>phraseMatch(n,w)))return true;

  return false;
}

function pickCustomerName(lines){
  const phoneIndexes=[];
  for(let i=0;i<lines.length;i++)if(phoneFrom(lines[i]))phoneIndexes.push(i);
  const firstPhone=phoneIndexes.length?phoneIndexes[0]:-1;

  const explicitValue=raw=>{
    const m=String(raw||'').trim().match(/^(?:اسم المستلم|المستلم|الاسم|اسم)\s*[:：\-]?\s*(.+)$/);
    return m?String(m[1]||'').trim():'';
  };
  const validNameValue=raw=>{
    const value=explicitValue(raw)||String(raw||'').trim();
    const n=normalizeArabic(value);
    if(isHardNonNameLine(value)||findBestPlaceRawOnly(value))return '';
    const words=n.split(/\s+/).filter(Boolean);
    if(words.length<1||words.length>4)return '';
    if(!isKnownArabicGivenName(words[0]))return '';
    return value;
  };

  // An explicit "الاسم:" label is authoritative anywhere in the order.
  for(let i=0;i<lines.length;i++){
    const value=explicitValue(lines[i]);
    if(value){
      const accepted=validNameValue(lines[i]);
      if(accepted)return {name:accepted,index:i};
    }
  }

  // Normal orders: only the nearest valid known Arabic name before the first phone.
  if(firstPhone>0){
    for(let i=firstPhone-1;i>=0&&i>=firstPhone-3;i--){
      const value=validNameValue(lines[i]);
      if(value)return {name:value,index:i};
    }
    return {name:'',index:-1};
  }

  // If the phone is first, do not guess a later line as a name.
  if(firstPhone===0)return {name:'',index:-1};

  // No phone: accept only a known name in the first two lines.
  for(let i=0;i<Math.min(lines.length,2);i++){
    const value=validNameValue(lines[i]);
    if(value)return {name:value,index:i};
  }
  return {name:'',index:-1};
}

function isLikelyName(line,index,lines=[]){
  const raw=String(line||'').trim();
  const n=normalizeArabic(raw.replace(/^(?:اسم المستلم|المستلم|الاسم|اسم)\s*[:：\-]?\s*/,''));
  if(!/[\u0600-\u06FF]/.test(raw)||/\d/.test(normalizeDigits(raw)))return false;
  if(phoneFrom(raw)||isPriceLine(raw)||isHardNonNameLine(raw))return false;
  if(priorityLocalMatch(raw)||explicitGovernorateMatch(raw)||shippingAliasMatch(raw)||findBestPlaceRawOnly(raw))return false;
  const words=n.split(/\s+/).filter(Boolean);
  if(words.length<1||words.length>4||!isKnownArabicGivenName(words[0]))return false;
  const firstPhone=lines.findIndex(x=>!!phoneFrom(x));
  if(firstPhone===0&&!/^(?:اسم المستلم|المستلم|الاسم|اسم)/.test(normalizeArabic(raw)))return false;
  return firstPhone<0?index<=1:index<firstPhone&&firstPhone-index<=3;
}

function isColorLine(line){
  return actualColorsInLine(line).length>0;
}


const QUANTITY_ONLY_WORDS = new Set(['قطعه','قطع','قطعتين'].map(normalizeArabic));
const PRODUCT_CORE_WORDS = PRODUCT_WORDS.filter(w=>!QUANTITY_ONLY_WORDS.has(w));

function firstNumberNearWord(line,wordRegex){
  const s=normalizeDigits(String(line||''));
  const after=s.match(new RegExp('(?:'+wordRegex+')\\s*(?:[:=-]?\\s*)?(\\d{2,3})','i'));
  if(after)return after[1];
  const before=s.match(new RegExp('(\\d{2,3})\\s*(?:'+wordRegex+')','i'));
  return before?before[1]:'';
}

function extractWeightValue(line){
  return firstNumberNearWord(line,'وزن|الوزن|وزني');
}

function extractHeightValue(line){
  return firstNumberNearWord(line,'طول|الطول|طولي|طوله');
}

function extractQuantityText(line){
  const n=normalizeArabic(String(line||''));
  const m=n.match(/(\d+\s*(?:قطعه|قطع)|قطعه\s*(?:واحده|واحدة)|قطعتين|ثلاث\s+(?:قطع|الوان)|ثلاثه\s+قطع|ثلاثة\s+قطع|اربع\s+قطع|اربعه\s+قطع|أربع\s+قطع|خمس\s+قطع|ست\s+قطع|سته\s+قطع)/);
  return m?m[1]:'';
}


const MODEL_WORDS = ['ترند','كلاسيك','اوفر سايز','أوفر سايز','اوفرسايز','ستريت','موديل','سكيني','وايد ليج'].map(normalizeArabic);

function modelWordsInLine(line){
  const n=normalizeArabic(String(line||''));
  return MODEL_WORDS.filter(w=>phraseMatch(n,w));
}

function extractWeightText(line){
  const raw=normalizeDigits(String(line||''));
  const n=normalizeArabic(raw);
  if(!/وزن|الوزن|وزني|وزنه|وزنوا/.test(n))return '';

  const range=raw.match(/(?:وزن\w*[^0-9]{0,12})?(\d{2,3})\s*(?:الى|إلى|ل|:|-)\s*(\d{2,3})/i);
  if(range)return `${range[1]}-${range[2]}`;

  const num=raw.match(/(?:وزن\w*[^0-9]{0,12})(\d{2,3})/i);
  return num?num[1]:'';
}

function extractHeightText(line){
  const raw=normalizeDigits(String(line||''));
  const n=normalizeArabic(raw);
  if(!/طول|الطول|طولي|طوله/.test(n))return '';
  const m=raw.match(/(?:طول\w*[^0-9]{0,12})(\d{2,3})/i);
  return m?m[1]:'';
}


function hasWhatsappCue(line){
  const raw=String(line||'');
  const n=normalizeArabic(raw);
  return /واتس|واتساب|whatsapp|what'?s?app|\bwa\b/i.test(raw) || /واتس|واتساب/.test(n);
}

function englishFragments(line){
  const raw=String(line||'');
  const parts=raw.match(/[A-Za-z][A-Za-z0-9+._/-]*/g)||[];
  return [...new Set(parts)];
}

function classifyNoteLineMulti(line){
  const raw=String(line||'').trim();
  const n=normalizeArabic(raw);
  const out=[];
  if(isPriceLine(raw))return out;

  // Product description wins. If color/model are embedded in the same product line,
  // preserve the whole product description instead of deleting words.
  if(containsAny(n,PRODUCT_CORE_WORDS)){
    out.push({label:'الطلب',value:raw});
    const size=(raw.match(/\b(?:xxxxl|xxxl|xxl|xl|xlarge|xlarg|x-large|large|medium|small|m|l|s)\b/i)||[])[0]||((n.match(/(?:اكس\s*لارج|لارج|ميديوم|سمول)/)||[])[0]||'');
    if(size)out.push({label:'المقاس',value:size});
    return out;
  }

  const weight=extractWeightText(raw)||extractWeightValue(raw);
  const height=extractHeightText(raw)||extractHeightValue(raw);
  if(weight)out.push({label:'الوزن',value:weight});
  if(height)out.push({label:'الطول',value:height});

  const qty=extractQuantityText(raw);
  if(qty)out.push({label:'العدد',value:qty});

  if(/مقاس|المقاس|قياس|سايز|السايز|size|xlarge|xlarg|x-large|اكس\s*لارج|\b(?:s|m|l|xl|xxl|xxxl|xxxxl)\b/i.test(raw)){
    out.push({label:'المقاس',value:raw});
  }

  const colors=actualColorsInLine(raw);
  if(colors.length)out.push({label:'اللون',value:colors.join(' و ')});

  const models=modelWordsInLine(raw);
  if(models.length)out.push({label:'الموديل',value:models.join(' و ')});

  // Color/model line may contain meaningful leftover words. Keep them.
  if(colors.length||models.length){
    let leftover=n;
    [...colors,...models].forEach(w=>{
      leftover=leftover.replace(new RegExp('(^|\\s)(?:و)?(?:ال)?'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=\\s|$)','g'),' ');
    });
    leftover=leftover.replace(/\s+/g,' ').trim();
    if(leftover && !/^(?:لون|اللون|الوان|الالوان)$/.test(leftover)){
      out.push({label:'تفصيل',value:leftover});
    }
  }

  if(!colors.length && /^\s*\d+\s*(?:الوان|ألوان)\s*$/i.test(normalizeDigits(raw))){
    out.push({label:'الألوان',value:raw.replace(/([0-9٠-٩])(?=الوان|ألوان)/,'$1 ')});
  }

  if(out.length)return out;

  if(/^\s*\d+(?:\.\d+)?\s*$/.test(normalizeDigits(raw))||/(?:تقريبا|حوالي)\s*\d+/i.test(n)){
    return [{label:'تفصيل',value:raw}];
  }

  return [{label:'ملاحظة',value:raw}];
}

function classifyNoteLine(line){
  return classifyNoteLineMulti(line)[0]||{label:'ملاحظة',value:String(line).trim()};
}


const PRODUCT_COST_RULES = [
  {name:'بنطلون جيوب سحاب',cost:2.30,terms:['بنطلون جيوب سحاب','بنطلون بجيوب سحاب','جيوب سحاب']},
  {name:'بنطلون رياضة سحاب',cost:2.70,terms:['بنطلون رياضه سحاب','بنطلون رياضي سحاب','بنطلون رياضة سحاب']},
  {name:'بنطلون تركي',cost:2.70,terms:['بنطلون تركي','تركي']},
  {name:'بنطلون زرار',cost:2.20,terms:['بنطلون زرار','بنطلون زر','زرار']},
  {name:'بنطلون جيوب',cost:2.20,terms:['بنطلون جيوب','جيوب عادي','بنطلون بجيوب']},
  {name:'تيشيرت سادة تريكو',cost:2.50,terms:['تيشيرت ساده تريكو','تيشرت ساده تريكو','تيشيرت سادة تريكو']},
  {name:'بجامة جاكار / ترينغ',cost:4.25,terms:['بجامه جاكار','بجامة جاكار','تريننغ','ترينغ']},
  {name:'تيشيرت بولو',cost:3.50,terms:['تيشيرت بولو تريكو','تيشرت بولو تريكو','بولو تريكو','بولو ترند','تيشيرت بولو','تيشرت بولو','بولو']}
];

function safeSmallQuantity(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>=1&&n<=50?n:0;
}
function quantityFromProductSegment(segment){
  const s=normalizeDigits(segment);
  const piece=s.match(/(\d+)\s*(?:قطعه|قطعة|قطع|حبه|حبة)/);
  const pieceQty=piece?safeSmallQuantity(piece[1]):0;
  if(pieceQty)return pieceQty;
  const count=s.match(/(?:العدد|عدد)\s*[:：-]?\s*(\d+)/);
  const countQty=count?safeSmallQuantity(count[1]):0;
  if(countQty)return countQty;
  const leading=s.match(/^\s*(\d+)\b/);
  const leadingQty=leading?safeSmallQuantity(leading[1]):0;
  return leadingQty||1;
}

function calculateGoodsCost(text){
  const normalized=normalizeArabic(text);
  const rawSegments=String(text||'').split(/(?:\+|،|;|؛|\n)/).map(x=>normalizeArabic(x)).filter(Boolean);
  const segments=[];
  for(const raw of rawSegments){
    const hits=PRODUCT_COST_RULES.reduce((n,r)=>n+(r.terms.some(t=>raw.includes(normalizeArabic(t)))?1:0),0);
    if(hits<=1){segments.push(raw);continue}
    const numbered=raw.split(/(?=\b\d+\s*(?:بنطلون|تيشيرت|تيشرت|بولو|بجامه|ترين))/).map(x=>x.trim()).filter(Boolean);
    segments.push(...(numbered.length>1?numbered:[raw]));
  }
  const items=[];
  for(const segment of segments){
    const rule=PRODUCT_COST_RULES.find(r=>r.terms.some(t=>segment.includes(normalizeArabic(t))));
    if(!rule)continue;
    const quantity=quantityFromProductSegment(segment);
    items.push({name:rule.name,quantity,unitCost:rule.cost,total:Number((quantity*rule.cost).toFixed(2))});
  }
  if(items.length===1 && items[0].quantity===1){
    const wordCounts={واحد:1,واحده:1,اثنين:2,اتنين:2,ثنتين:2,قطعتين:2,ثلاث:3,ثلاثه:3,اربعه:4,خمس:5,سته:6};
    const colorCount=normalized.match(/(?:^|\s)(\d+|واحد|واحده|اثنين|اتنين|ثنتين|ثلاث|ثلاثه|اربعه|خمس|سته)\s*(?:ال)?الوان/);
    if(colorCount){
      const q=Number(colorCount[1])||wordCounts[colorCount[1]]||1;
      items[0].quantity=q;
      items[0].total=Number((q*items[0].unitCost).toFixed(2));
    }
  }
  const total=Number(items.reduce((sum,x)=>sum+x.total,0).toFixed(2));
  return {total,items};
}

function costBreakdownText(items=[]){
  return items.length?items.map(x=>`${x.quantity} × ${x.name} (${money(x.unitCost)}) = ${money(x.total)}`).join(' • '):'لم يتم التعرف على صنف له كوست تلقائي';
}

function parseSmart(text){
  const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const used=new Set();

  let name='';
  let phone='';
  let extraPhones=[];
  let area='';
  let address='';
  let amount='';
  let priceInstruction='';

  // 1) Phones first. Exact duplicate phone is not treated as an extra number.
  const allPhones=[];
  for(let i=0;i<lines.length;i++){
    const ps=phonesFrom(lines[i]);
    if(ps.length){
      ps.forEach(p=>{if(!allPhones.includes(p))allPhones.push(p)});
      used.add(i);
    }
  }
  phone=allPhones[0]||'';
  extraPhones=allPhones.slice(1);

  // 2) Explicit price line.
  for(let i=lines.length-1;i>=0;i--){
    if(isPriceLine(lines[i])){
      amount=priceFrom(lines[i]);
      priceInstruction=instructionFromPriceLine(lines[i]);
      used.add(i);
      break;
    }
  }

  // 3) الاسم — V42: قفل الاسم من موقعه بالنسبة للهاتف
  const pickedName=pickCustomerName(lines);
  if(pickedName.name){
    name=pickedName.name;
    used.add(pickedName.index);
  }else{
    name='لا يوجد';
  }

  // 4) Detect ALL real location lines. Explicit governorate/local priority wins.
  const locationRows=[];
  for(let i=0;i<lines.length;i++){
    if(used.has(i)||isPriceLine(lines[i]))continue;

    const line=lines[i];
    const n=normalizeArabic(line);

    // A promise to send a location later is not an address by itself.
    if(looksLikeFutureLocationInstruction(line) && !priorityLocalMatch(line) && !explicitGovernorateMatch(line) && !shippingAliasMatch(line)){
      continue;
    }

    // Product/detail/instruction lines without a recognized place cannot become addresses.
    const hit=splitAreaAddress(line);
    if(!hit.area)continue;

    const rawPlaceHit=findBestPlace(line);
    const trustedGeneric=rawPlaceHit && String(rawPlaceHit.place||'').length>=5 && !/^(?:صحيح|تمام|اوكي|نعم|لا)$/.test(n);
    const addressPrefix=/^(?:سكان|ساكن|ساكنه|ساكنة|عنواني|العنوان|عنوان|المكان|موقع|الموقع|المنطقه|المنطقة)\b/.test(n);
    const explicitGovHit=!!explicitGovernorateMatch(line);
    const explicitLocation=!!(priorityLocalMatch(line)||explicitGovHit||shippingAliasMatch(line)||ADDRESS_WORDS.some(w=>phraseMatch(n,w)));

    // Merchandise descriptions always win over a locality alias unless the line is explicitly an address/governorate line.
    if(containsAny(n,PRODUCT_WORDS) && !addressPrefix && !explicitGovHit)continue;
    if(isLikelyName(line,i,lines) && !explicitLocation)continue;
    if((isColorLine(line)||isQuantityLine(line)||isHeightLine(line)||/وزن|مقاس|الطول|طولي/.test(n)) && !explicitLocation)continue;

    const strongLocation=explicitLocation||trustedGeneric;
    if(!strongLocation)continue;

    locationRows.push({i,area:hit.area,address:hit.address,line});
  }

  if(locationRows.length){
    // Explicit governorate in any location line has the highest authority.
    const explicitRow=locationRows.find(r=>explicitGovernorateMatch(r.line));
    area=(explicitRow?.area)||locationRows[0].area;

    // If several conditional/local addresses exist in the same governorate, preserve all of them.
    const sameGov=locationRows.filter(r=>r.area===area);
    address=sameGov.map(r=>r.address).filter(Boolean).join(' - ');
    sameGov.forEach(r=>used.add(r.i));
  }

  if(locationRows.length){
    // Explicit governorate in any location line has the highest authority.
    const explicitRow=locationRows.find(r=>explicitGovernorateMatch(r.line));
    area=(explicitRow?.area)||locationRows[0].area;

    // If several conditional/local addresses exist in the same governorate, preserve all of them.
    const sameGov=locationRows.filter(r=>r.area===area);
    address=sameGov.map(r=>r.address).filter(Boolean).join(' - ');
    sameGov.forEach(r=>used.add(r.i));
  }

  // 5) Extra descriptive address lines directly adjacent to a detected address.
  if(address!==''){
    const extras=[];
    for(let i=0;i<lines.length;i++){
      if(used.has(i)||isPriceLine(lines[i]))continue;
      const n=normalizeArabic(lines[i]);
      if(containsAny(n,ADDRESS_WORDS) && !containsAny(n,PRODUCT_WORDS) && !isLikelyName(lines[i],i,lines)){
        extras.push(lines[i]);
        used.add(i);
      }
    }
    address=[address,...extras].filter(Boolean).join(' - ');
  }

  // Delivery/contact timing is never an address.
  const isTimingOrContactInstruction=line=>{
    const n=normalizeArabic(String(line||''));
    return /(?:بعد|قبل)\s*(?:الساعه|ساعة|ساعه)|(?:التسليم|التوصيل|دوام|الدوام|اتصل|اتصال|تواصل|رن|يرن)/.test(n);
  };

  // An explicit address cue such as شارع/دوار/منطقة wins wherever it appears,
  // even when the customer placed it before the phone.
  if(!address){
    for(let i=0;i<lines.length;i++){
      if(used.has(i)||phoneFrom(lines[i])||isPriceLine(lines[i]))continue;
      const n=normalizeArabic(lines[i]);
      const detailLike=containsAny(n,PRODUCT_WORDS)||isColorLine(lines[i])||isQuantityLine(lines[i])||
        /وزن|الوزن|وزني|مقاس|المقاس|الطول|طولي/.test(n);
      if(!detailLike&&!isTimingOrContactInstruction(lines[i])&&hasStrongAddressCue(lines[i])){
        address=lines[i];
        area=splitAreaAddress(lines[i]).area||'عمان';
        used.add(i);
        break;
      }
    }
  }

  // If the locality has no known cue, use the first plain line after the phone,
  // skipping timing/contact instructions and continuing until a real address is found.
  if(!address){
    const firstPhoneIndex=lines.findIndex(x=>!!phoneFrom(x));
    if(firstPhoneIndex>=0){
      for(let i=firstPhoneIndex+1;i<lines.length;i++){
        if(used.has(i)||isPriceLine(lines[i])||isTimingOrContactInstruction(lines[i]))continue;
        const n=normalizeArabic(lines[i]);
        const detailLike=containsAny(n,PRODUCT_WORDS)||isColorLine(lines[i])||isQuantityLine(lines[i])||
          /وزن|الوزن|وزني|مقاس|المقاس|الطول|طولي/.test(n);
        if(detailLike)break;
        address=lines[i];
        area=splitAreaAddress(lines[i]).area||'عمان';
        used.add(i);
        break;
      }
    }
  }

  // No location at all: business rule requested by user.
  if(!area && !address){
    area='عمان';
    address='لا يوجد';
  }

  // 6) Notes are copied as written. Do not add labels or reinterpret product details.
  const noteRows=[];
  extraPhones.forEach(p=>noteRows.push(p));
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(isPriceLine(line)){
      if(priceInstruction)noteRows.push(priceInstruction);
      continue;
    }
    if(used.has(i))continue;
    if(phoneFrom(line))continue;
    if(name!=='لا يوجد'&&line===name)continue;
    noteRows.push(line);
  }

  if(amount!=='' && isReturnOrderText(text))amount=String(-Math.abs(Number(amount)||0));
  const goodsCost=calculateGoodsCost(text);
  return {name,phone,area,address,amount,notes:noteRows.join('\n'),cost:goodsCost.total,costItems:goodsCost.items};
}
async function boot(){
  try{const setup=await api('/setup');if(setup.needs_setup){renderSetup();return}}catch{}
  if(!state.token){renderLogin();return}
  try{
    const me=await api('/me');
    state.user=me.user;
    if(state.user?.role==='admin' && localStorage.getItem('corvex_schema_v66')!=='1'){
      try{await api('/migrate',{method:'POST'});localStorage.setItem('corvex_schema_v66','1')}catch{}
    }
    renderShell();
    await show(homeView())
  }catch{localStorage.removeItem('corvex_token');state.token='';renderLogin()}
}
function renderLogin(){app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-brand"><div class="logo-mark">C</div><h1>CORVEX SPORT</h1><p>نظام إدارة وطباعة الطلبات</p></div><div class="field"><label>اسم المستخدم</label><input id="lu" class="input"></div><br><div class="field"><label>كلمة المرور</label><input id="lp" type="password" class="input"></div><button id="loginBtn" class="btn btn-primary" style="width:100%;margin-top:18px">تسجيل الدخول</button></div></div>`;$('#loginBtn').onclick=async()=>{try{const d=await api('/login',{method:'POST',body:JSON.stringify({username:$('#lu').value,password:$('#lp').value})});state.token=d.token;state.user=d.user;localStorage.setItem('corvex_token',state.token);
    if(state.user?.role==='admin' && localStorage.getItem('corvex_schema_v66')!=='1'){
      try{await api('/migrate',{method:'POST'});localStorage.setItem('corvex_schema_v66','1')}catch{}
    }
    renderShell();show(homeView())}catch(e){toast(e.message)}}}
function renderSetup(){app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-brand"><div class="logo-mark">C</div><h1>تهيئة CORVEX SPORT</h1><p>أنشئ أول حساب مدير</p></div><div class="field"><label>الاسم الظاهر</label><input id="sd" class="input" value="Admin"></div><br><div class="field"><label>اسم المستخدم</label><input id="su" class="input" value="admin"></div><br><div class="field"><label>كلمة المرور</label><input id="sp" type="password" class="input"></div><button id="setupBtn" class="btn btn-accent" style="width:100%;margin-top:18px">إنشاء النظام</button></div></div>`;$('#setupBtn').onclick=async()=>{try{await api('/setup',{method:'POST',body:JSON.stringify({display_name:$('#sd').value,username:$('#su').value,password:$('#sp').value})});toast('تمت التهيئة');renderLogin()}catch(e){toast(e.message)}}}
function renderShell(){
  app.innerHTML=`<div class="shell">
    <header class="topbar">
      <button id="mobileMenuBtn" class="mobile-menu-btn" aria-label="القائمة">☰</button>
      <button id="topLogoHome" class="logo" type="button" style="border:0;background:transparent;color:inherit;cursor:pointer;text-align:inherit"><div class="logo-mark">C</div><div>CORVEX SPORT<small>ORDER DESK</small></div></button>
      <div class="top-actions"><span class="pill">${esc(state.user?.display_name||'')}</span><button id="logout" class="btn btn-soft">خروج</button></div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <nav class="nav">
          ${can('dashboard')?'<button data-view="dashboard">⌂ لوحة التحكم</button>':''}

          ${can('stores')?`
          <div class="nav-group">
            <button class="nav-parent" data-nav-toggle="storesMenu">▣ المتاجر <span>⌄</span></button>
            <div id="storesMenu" class="nav-sub">
              <button data-view="stores">المتاجر</button>
              <button data-view="store-add">＋ إضافة متجر</button>
            </div>
          </div>`:''}

          ${(can('orders_add')||can('orders_view'))?`
          <div class="nav-group">
            <button class="nav-parent" data-nav-toggle="ordersMenu">▤ الطلبات <span>⌄</span></button>
            <div id="ordersMenu" class="nav-sub">
              ${can('orders_view')?'<button data-view="orders">جميع الطلبات</button>':''}
              ${can('orders_view')&&!isTrackingOnly()?'<button data-view="store-orders">طلبات المتاجر</button>':''}
              ${state.user?.role==='admin'?'<button data-view="deleted-orders">الطلبات المحذوفة</button>':''}
              ${can('orders_add')?'<button data-view="new">＋ إضافة طلب</button>':''}
            </div>
          </div>`:''}

          ${can('couriers')?`
          <div class="nav-group">
            <button class="nav-parent" data-nav-toggle="couriersMenu">🚚 المناديب <span>⌄</span></button>
            <div id="couriersMenu" class="nav-sub">
              <button data-view="couriers">المناديب</button>
              ${can('couriers_add')?'<button data-view="courier-add">＋ إضافة مندوب</button>':''}
            </div>
          </div>`:''}

          ${can('print')?'<button data-view="print">▣ جاهز للطباعة</button>':''}
          ${can('batches')?'<button data-view="batches">↻ دفعات الطباعة</button>':''}
          ${can('profits')?'<button data-view="daily-profits">💰 الأرباح اليومية</button>':''}
          ${can('reports')?'<button data-view="reports">▦ الكشوفات وExcel</button>':''}${can('delivery_reconcile')?'<button data-view="delivery-reconcile">⇄ تسوية شركة التوصيل</button>':''}
          ${can('regions')?'<button data-view="regions">⌖ المناطق</button>':''}
          ${can('users')?'<button data-view="users">♟ المستخدمون</button>':''}
          ${can('permissions')?'<button data-view="permissions">⚙ الصلاحيات</button>':''}
        </nav>
      </aside>
      <main id="content" class="content"></main>
      <div id="sidebarOverlay" class="sidebar-overlay"></div>
    </div>
  </div>`;

  document.querySelectorAll('[data-nav-toggle]').forEach(b=>b.onclick=()=>{
    const box=document.getElementById(b.dataset.navToggle);
    box?.classList.toggle('open');
    b.classList.toggle('open');
  });

  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    show(b.dataset.view);
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('#sidebarOverlay')?.classList.remove('show');
  });

  const mobileMenuBtn=$('#mobileMenuBtn');
  const sidebar=$('.sidebar');
  const sidebarOverlay=$('#sidebarOverlay');

  if(mobileMenuBtn){
    mobileMenuBtn.onclick=()=>{
      sidebar?.classList.toggle('open');
      sidebarOverlay?.classList.toggle('show');
    };
  }
  if(sidebarOverlay){
    sidebarOverlay.onclick=()=>{
      sidebar?.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    };
  }

  $('#topLogoHome').onclick=()=>show(homeView());

  $('#logout').onclick=async()=>{
    try{await api('/logout',{method:'POST'})}catch{}
    localStorage.removeItem('corvex_token');
    state.token='';
    state.user=null;
    renderLogin();
  };
}
async function show(v){
  if(isTrackingOnly()&&!['orders','reports'].includes(v))v=homeView();
  state.view=v;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  if(v==='dashboard')return dashboard();
  if(v==='new')return newOrder();
  if(v==='orders')return ordersView();
  if(v==='deleted-orders')return deletedOrdersView();
  if(v==='store-orders')return storeOrdersHub();
  if(v==='print')return printView();
  if(v==='batches')return batchesView();
  if(v==='daily-profits')return dailyProfitsView();
  if(v==='reports')return reportsView();
  if(v==='delivery-reconcile')return deliveryReconcileView();
  if(v==='stores')return storesView();
  if(v==='store-add')return storeAddView();
  if(v==='couriers')return couriersView();
  if(v==='courier-add')return courierAddView();
  if(v==='regions')return regionsView();
  if(v==='permissions')return permissionsView();
  if(v==='users')return usersView();
}
async function deletedOrdersView(){
  const c=$('#content');
  if(state.user?.role!=='admin'){c.innerHTML='<div class="empty">صلاحية مدير مطلوبة</div>';return}
  c.innerHTML='<div class="empty">جاري تحميل الطلبات المحذوفة...</div>';
  try{
    const d=await api('/deleted-orders');
    const orders=d.orders||[];
    c.innerHTML=`<div class="page-title"><div><h1>الطلبات المحذوفة</h1><div class="sub">يمكن استرجاع الطلب خلال 48 ساعة من حذفه</div></div><span class="pill">${orders.length} طلب</span></div>
      <div class="card"><div id="deletedOrdersList">${orders.length?orders.map(o=>{
        const mins=Math.max(0,Number(o.remaining_minutes||0));
        const hours=Math.floor(mins/60),minutes=mins%60;
        return `<div class="batch-card"><div><b>#${esc(o.order_code||'')}</b><div class="batch-meta">${esc(o.recipient_name||'لا يوجد')} • ${esc(o.phone||'')} • حذفه ${esc(o.deleted_by_name||'المدير')} • متبقّي ${hours}س ${minutes}د</div></div><button class="btn btn-accent restore-deleted-order" data-archive-id="${o.archive_id}">استرجاع الطلب</button></div>`;
      }).join(''):'<div class="empty">لا توجد طلبات محذوفة قابلة للاسترجاع</div>'}</div></div>`;
    document.querySelectorAll('.restore-deleted-order').forEach(btn=>btn.onclick=async()=>{
      if(!confirm('استرجاع هذا الطلب إلى جميع الطلبات؟'))return;
      btn.disabled=true;
      try{await api('/deleted-orders/'+btn.dataset.archiveId+'/restore',{method:'POST'});toast('تم استرجاع الطلب');deletedOrdersView()}
      catch(e){btn.disabled=false;toast(e.message)}
    });
  }catch(e){c.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}

async function dashboard(){
  const c=$('#content');
  c.innerHTML='<div class="empty">جاري التحميل...</div>';

  try{
    state.stats=await api('/dashboard');
    const byStore=state.stats.outgoing_by_store||[];

    c.innerHTML=`
      <div class="page-title">
        <div><h1>لوحة التحكم</h1><div class="sub">نظرة سريعة على حركة الطلبات</div></div>
        <button class="btn btn-accent" onclick="show('new')">＋ طلب جديد</button>
      </div>

      <div class="grid stats">
        <div class="stat"><b>${state.stats.outgoing_today||0}</b><span>طلبات خرجت اليوم</span></div>
        <div class="stat"><b>${state.stats.today||0}</b><span>طلبات أضيفت اليوم</span></div>
        <div class="stat"><b>${state.stats.unprinted||0}</b><span>غير مطبوعة</span></div>
        <div class="stat"><b>${state.stats.total||0}</b><span>إجمالي الطلبات</span></div>
      </div>

      <div class="card outgoing-today-card">
        <div class="section-head">
          <div><h3>طلبات خرجت اليوم حسب المتجر</h3><div class="sub">الحسبة تعتمد على أول طباعة للطلب، وليس تاريخ إضافته</div></div>
          <b class="outgoing-total">${state.stats.outgoing_today||0}</b>
        </div>

        ${byStore.length?`
          <div class="outgoing-store-grid">
            ${byStore.map(x=>`
              <div class="outgoing-store-item">
                <span>${esc(x.store_name||'متجر غير محدد')}</span>
                <b>${Number(x.outgoing_count||0)}</b>
              </div>`).join('')}
          </div>`:'<div class="empty">لا توجد طلبات خرجت اليوم حتى الآن</div>'}
      </div>

      <div class="card">
        <h3>مسار العمل</h3>
        <p class="sub">الموظف يدخل الطلب ← يظهر ضمن غير المطبوع ← تنشئ دفعة طباعة ← أول طباعة تعتبر تاريخ خروج الشحنة.</p>
      </div>`;
  }catch(e){
    c.innerHTML=`<div class="empty">${esc(e.message)}</div>`;
  }
}

function autoCourierForText(couriers,text){
  const n=normalizeArabic(text||'');
  let best=null;
  let bestLen=-1;

  for(const courier of (couriers||[])){
    if(!courier.is_active || courier.name==='مندوب') continue;
    for(const area of courierAreasList(courier)){
      const a=normalizeArabic(area);
      if(a && n.includes(a) && a.length>bestLen){
        best=courier;
        bestLen=a.length;
      }
    }
  }

  if(best) return best;
  return (couriers||[]).find(c=>c.is_active && c.name==='مندوب') || null;
}

async function newOrder(){
  const c=$('#content');
  if(!state.regionGroups?.length) await loadRegionIndex();

  let stores=[];
  let couriers=[];
  try{
    const [sd,cd]=await Promise.all([api('/stores'),api('/couriers')]);
    stores=(sd.stores||[]).filter(s=>s.is_active);
    couriers=(cd.couriers||[]).filter(x=>x.is_active);
  }catch(e){}

  const fallbackCourier=couriers.find(x=>x.name==='مندوب')||null;

  c.innerHTML=`<div class="page-title"><div><h1>إضافة طلب</h1><div class="sub">إدخال سريع وبسيط</div></div></div>
  <div class="card">
    <div class="store-picker-box">
      <div class="field">
        <label>المتجر صاحب الطلب</label>
        <select id="store" class="select">
          <option value="">اختر المتجر...</option>
          ${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <button id="quickAddStore" class="btn btn-soft" type="button">＋ متجر جديد</button>
    </div>

    ${stores.length?'':'<div class="store-warning">لا يوجد متجر مضاف بعد. أضف متجر أولاً حتى تحفظ الطلب.</div>'}

    <div class="smart-box">
      <div class="field"><label>الصق الطلب هنا</label><textarea id="raw" class="textarea" placeholder="0772207993\nعلجون عرجان\n3 بلايز ريبوك\nالوزن 100\n15 شامل التوصيل"></textarea></div>
      <div class="smart-actions"><button id="parse" class="btn btn-accent">⚡ تعبئة تلقائية</button><button id="clearRaw" class="btn btn-outline">مسح</button></div>
    </div>
    <br>

    <div class="grid form-grid">
      <div class="field">
        <label>اسم المستلم</label>
        <input id="name" class="input" placeholder="اسم الزبون" value="">
      </div>

      <div class="field auto-courier-field">
        <label>مندوب التوصيل</label>
        <input id="courierNameAuto" class="input auto-courier-input" value="${esc(fallbackCourier?.name||'مندوب')}" readonly>
        <input id="courierIdAuto" type="hidden" value="${fallbackCourier?.id||''}">
        <small id="courierReason" class="sub">يتحدد تلقائيًا حسب المنطقة</small>
      </div>

      <div class="field"><label>رقم الهاتف</label><input id="phone" class="input" inputmode="tel" placeholder="07xxxxxxxx"><div id="duplicateNotice" hidden style="margin-top:8px;padding:8px;border:1px solid #f0b429;border-radius:10px;background:#fff8e1"><small id="duplicateText" style="display:block;margin-bottom:7px;color:#7a4b00"></small><button id="approveDuplicate" type="button" class="btn btn-soft" style="padding:7px 10px;font-size:13px">موافقة — إدخال كتبديل</button></div></div>
      <div class="field"><label>المحافظة</label><input id="area" class="input" placeholder="عمان / إربد / عجلون..."></div>
      <div class="field"><label>قيمة الطلب</label><input id="amount" class="input" inputmode="decimal" placeholder="0.00"></div>
      <div class="field full"><label>العنوان التفصيلي</label><textarea id="address" class="textarea" placeholder="العنوان الكامل"></textarea></div>
      <div class="field full"><label>ملاحظات الطلب / التجهيز</label><textarea id="notes" class="textarea" placeholder="الصنف، اللون، المقاس، الوزن، أي ملاحظات للموظف الذي يجهز الطلب"></textarea></div>
    </div>

    <div class="actions"><button id="saveOrder" class="btn btn-primary">حفظ الطلب</button><button id="saveNext" class="btn btn-accent">حفظ وإضافة طلب جديد</button></div>
  </div>`;

  const refreshCourier=()=>{
    const text=[$('#raw')?.value,$('#area')?.value,$('#address')?.value].filter(Boolean).join(' ');
    const matched=autoCourierForText(couriers,text);
    $('#courierNameAuto').value=matched?.name||'مندوب';
    $('#courierIdAuto').value=matched?.id||'';
    $('#courierReason').textContent=(matched && matched.name!=='مندوب')?'تم اختياره تلقائيًا حسب المنطقة':'لا يوجد مندوب مخصص للمنطقة — تم اختيار مندوب';
  };

  $('#parse').onclick=()=>{
    const p=parseSmart($('#raw').value);
    $('#name').value=p.name||'لا يوجد';
    if(p.phone)$('#phone').value=p.phone;
    $('#amount').value=p.amount||'';
    $('#area').value=p.area||'';
    $('#address').value=p.address||'';
    $('#notes').value=p.notes||'';
    refreshCourier();
    toast('تم الفرز، راجع الحقول قبل الحفظ');
  };

  let duplicateOverride=false;
  let pendingDuplicateNext=false;
  const resetDuplicateApproval=()=>{
    duplicateOverride=false;
    if($('#duplicateNotice'))$('#duplicateNotice').hidden=true;
  };
  $('#raw').addEventListener('input',refreshCourier);
  $('#area').addEventListener('input',refreshCourier);
  $('#address').addEventListener('input',refreshCourier);
  $('#phone').addEventListener('input',resetDuplicateApproval);
  $('#clearRaw').onclick=()=>{$('#raw').value='';refreshCourier()};
  const rememberedStore=localStorage.getItem('corvex_selected_store')||'';
  if(rememberedStore && stores.some(s=>String(s.id)===rememberedStore))$('#store').value=rememberedStore;
  $('#store').onchange=()=>{
    resetDuplicateApproval();
    if($('#store').value)localStorage.setItem('corvex_selected_store',$('#store').value);
    else localStorage.removeItem('corvex_selected_store');
  };

  $('#quickAddStore').onclick=()=>show('store-add');

  async function save(next){
    try{
      if(!$('#store').value){toast('اختر المتجر صاحب الطلب');return}
      refreshCourier();

      const d=await api('/orders',{
        method:'POST',
        body:JSON.stringify({
          store_id:$('#store').value,
          courier_id:$('#courierIdAuto').value,
          recipient_name:$('#name').value.trim()||'لا يوجد',
          phone:canonicalJordanPhone($('#phone').value),
          area:$('#area').value,
          detailed_address:$('#address').value,
          amount:$('#amount').value,
          order_notes:$('#notes').value,
          raw_text:$('#raw').value,
          duplicate_override_reason:duplicateOverride?'exchange':''
        })
      });

      learnAcceptedArabicName($('#name').value);
      toast(`تم حفظ الطلب رقم ${d.order.order_code}`);
      if(next)newOrder();else show('orders');
    }catch(e){
      if(e.duplicate){
        pendingDuplicateNext=next;
        $('#duplicateText').textContent=e.message;
        $('#duplicateNotice').hidden=false;
        $('#duplicateNotice').scrollIntoView({behavior:'smooth',block:'center'});
        toast('الرقم مكرر — وافق فقط إذا كان الطلب تبديل');
        return;
      }
      toast(e.message);
    }
  }

  $('#approveDuplicate').onclick=()=>{
    duplicateOverride=true;
    $('#duplicateNotice').hidden=true;
    save(pendingDuplicateNext);
  };
  $('#saveOrder').onclick=()=>save(false);
  $('#saveNext').onclick=()=>save(true);
  refreshCourier();
}

async function editOrder(id){
  state.view='edit-order';
  const c=$('#content');
  c.innerHTML=`<div class="edit-page-shell"><div class="edit-loading">جاري تحميل بيانات الطلب...</div></div>`;

  try{
    const d=await api('/orders/'+id);
    const o=d.order;
    if(!o) throw new Error('الطلب غير موجود');

    c.innerHTML=`
      <div class="edit-page-shell">
        <div class="edit-page-card">

          <div class="edit-page-head">
            <div>
              <h1>تعديل الطلب #${esc(o.order_code)}</h1>
              <div class="sub">تحديث بيانات الطلب ونتيجة التوصيل</div>
            </div>
            <button id="backToOrders" class="btn btn-soft">العودة للقائمة</button>
          </div>

          <div class="edit-section-title">بيانات الطلب</div>
          <div class="edit-field">
            <label>المتجر صاحب الطلب</label>
            <select id="editStore" class="select">
              <option value="">جاري تحميل المتاجر...</option>
            </select>
          </div>


          <div class="edit-field">
            <label>اسم المستلم</label>
            <input id="editName" class="input" value="${esc(o.recipient_name||'لا يوجد')}">
          </div>

          <div class="edit-field">
            <label>رقم الهاتف</label>
            <input id="editPhone" class="input" inputmode="tel" value="${esc(canonicalJordanPhone(o.phone||''))}">
          </div>

          <div class="edit-field">
            <label>المحافظة</label>
            <input id="editArea" class="input" value="${esc(o.area||'')}">
          </div>

          <div class="edit-field">
            <label>العنوان التفصيلي</label>
            <textarea id="editAddress" class="textarea">${esc(o.detailed_address||'')}</textarea>
          </div>

          <div class="edit-field">
            <label>ملاحظات الطلب</label>
            <textarea id="editNotes" class="textarea edit-notes">${esc(o.order_notes||'')}</textarea>
          </div>

          <div class="edit-field">
            <label>قيمة الطلب</label>
            <input id="editAmount" class="input" inputmode="decimal" value="${Number(o.amount||0)}">
          </div>
          <div class="edit-section-title">نتيجة التوصيل</div><div class="edit-field"><label>مندوب التوصيل</label><select id="editCourier" class="select"><option value="">بدون مندوب</option></select></div>

          <div class="edit-field">
            <label>الحالة</label>
            <select id="editStatus" class="select">
              ${Object.entries(DELIVERY_STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${k===(o.delivery_status||'pending')?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>

          <div class="edit-field">
            <label>القيمة المسلّمة فعليًا</label>
            <input id="editDeliveredAmount" class="input" inputmode="decimal" value="${Number(o.delivered_amount||o.amount||0)}">
          </div>

          <div class="edit-field">
            <label>أجور التوصيل</label>
            <input id="editDeliveryFee" class="input" inputmode="decimal" value="${Number(o.delivery_fee||2)}">
          </div>

          <div class="edit-field">
            <label>الكاش المستلم من شركة التوصيل</label>
            <input id="editCash" class="input" inputmode="decimal" value="${Number(o.cash_collected||0)}">
          </div>

          <div class="edit-field">
            <label>تكلفة البضاعة علينا</label>
            <input id="editCost" class="input" inputmode="decimal" value="${Number(o.cost_of_goods||0)}">
          </div>

          <div class="edit-field">
            <label>عدد القطع المسلّمة</label>
            <input id="editDeliveredPieces" class="input" inputmode="numeric" value="${Number(o.delivered_pieces||0)}">
          </div>

          <div class="edit-field">
            <label>عدد القطع المرتجعة</label>
            <input id="editReturnedPieces" class="input" inputmode="numeric" value="${Number(o.returned_pieces||0)}">
          </div>

          <div class="edit-field">
            <label>ملاحظة التسوية</label>
            <textarea id="editSettlementNote" class="textarea">${esc(o.settlement_note||'')}</textarea>
          </div>

          <div class="edit-profit-box">
            الربح المتوقع: <b id="editProfitPreview">0.00</b> د.أ
          </div>

          <div class="edit-actions-sticky">
            <button id="saveEditOrder" class="btn btn-primary">تحديث</button>
            <button id="cancelEditOrder" class="btn btn-soft">العودة للقائمة</button>
          </div>

        </div>
      </div>
    `;

    const back=()=>show('orders');
    $('#backToOrders').onclick=back;
    $('#cancelEditOrder').onclick=back;

    try{
      const sd=await api('/stores');
      const stores=(sd.stores||[]).filter(s=>s.is_active || s.id===o.store_id);
      $('#editStore').innerHTML='<option value="">اختر المتجر...</option>'+stores.map(s=>`<option value="${s.id}" ${Number(s.id)===Number(o.store_id)?'selected':''}>${esc(s.name)}</option>`).join('');
    }catch(e){
      $('#editStore').innerHTML='<option value="">تعذر تحميل المتاجر</option>';
    }

    
    try{
      const cd=await api('/couriers');
      $('#editCourier').innerHTML='<option value="">بدون مندوب</option>'+(cd.couriers||[]).filter(x=>x.is_active||Number(x.id)===Number(o.courier_id)).map(x=>`<option value="${x.id}" ${Number(x.id)===Number(o.courier_id)?'selected':''}>${esc(x.name)}</option>`).join('');
    }catch(e){}

    const calcProfit=()=>{
      const cash=Number($('#editCash').value||0);
      const cost=Number($('#editCost').value||0);
      $('#editProfitPreview').textContent=money(cash-cost);
    };

    const syncCash=()=>{
      const status=$('#editStatus').value;
      const delivered=Number($('#editDeliveredAmount').value||0);
      if(['delivered','delivered_adjusted'].includes(status) && Number(o.cash_collected||0)===0){
        $('#editCash').value=Math.max(0,delivered-2);
      }
      calcProfit();
    };

    $('#editCash').oninput=calcProfit;
    $('#editCost').oninput=calcProfit;
    $('#editDeliveredAmount').oninput=syncCash;
    $('#editStatus').onchange=syncCash;
    calcProfit();

    $('#saveEditOrder').onclick=async()=>{
      const btn=$('#saveEditOrder');
      btn.disabled=true;
      btn.textContent='جاري التحديث...';

      try{
        await api('/orders/'+id,{
          method:'PUT',
          body:JSON.stringify({
            store_id:$('#editStore').value,
            courier_id:$('#editCourier').value,
            recipient_name:$('#editName').value,
            phone:canonicalJordanPhone($('#editPhone').value),
            area:$('#editArea').value,
            detailed_address:$('#editAddress').value,
            amount:$('#editAmount').value,
            cost_of_goods:$('#editCost').value,
            order_notes:$('#editNotes').value
          })
        });

        await api('/orders/'+id+'/outcome',{
          method:'PUT',
          body:JSON.stringify({
            delivery_status:$('#editStatus').value,
            delivered_amount:$('#editDeliveredAmount').value,
            delivery_fee:$('#editDeliveryFee').value,
            cash_collected:$('#editCash').value,
            cost_of_goods:$('#editCost').value,
            delivered_pieces:$('#editDeliveredPieces').value,
            returned_pieces:$('#editReturnedPieces').value,
            settlement_note:$('#editSettlementNote').value
          })
        });

        toast('تم تحديث الطلب بنجاح');
        show('orders');
      }catch(e){
        btn.disabled=false;
        btn.textContent='تحديث';
        toast(e.message);
      }
    };

  }catch(e){
    toast(e.message);
    show('orders');
  }
}


async function getActiveStores(){
  try{
    const d=await api('/stores');
    return (d.stores||[]).filter(s=>s.is_active);
  }catch(e){return []}
}
function setDatePreset(preset,fromEl,toEl){
  const now=new Date();
  const iso=d=>d.toISOString().slice(0,10);
  let from='',to='';
  if(preset==='today'){from=to=iso(now)}
  else if(preset==='yesterday'){const d=new Date(now);d.setDate(d.getDate()-1);from=to=iso(d)}
  else if(preset==='last7'){const d=new Date(now);d.setDate(d.getDate()-6);from=iso(d);to=iso(now)}
  else if(preset==='last30'){const d=new Date(now);d.setDate(d.getDate()-29);from=iso(d);to=iso(now)}
  else if(preset==='this_month'){const d=new Date(now.getFullYear(),now.getMonth(),1);from=iso(d);to=iso(now)}
  else if(preset==='all'){from='';to=''}
  else return;
  fromEl.value=from;toEl.value=to;
}

async function ordersView(){
  const c=$('#content');
  const stores=await getActiveStores();
  c.innerHTML=`
    <div class="page-title"><div><h1>الطلبات والبحث</h1><div class="sub">فلترة حسب المتجر، حالة الشحنة، التاريخ، الكود أو الهاتف</div></div></div>
    <div class="card">
      <div class="filter-panel">
        <div class="filter-group"><label>المتجر</label><select id="os" class="select"><option value="">كل المتاجر</option>${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div class="filter-group"><label>عرض فقط</label><select id="statusFilter" class="select">
          <option value="">الكل</option>
          <option value="pending">قيد التوصيل</option>
          <option value="delivered">تم التسليم</option>
          <option value="refused_fee_paid">رفض ودفع أجور</option>
          <option value="refused_no_fee">رفض وعدم دفع أجور</option>
          <option value="canceled_before_arrival">ملغي قبل الوصول</option>
          <option value="partial">استلام جزئي</option>
        </select></div>
        <div class="filter-group"><label>الطباعة</label><select id="ps" class="select"><option value="">الكل</option><option value="0">غير مطبوع</option><option value="1">مطبوع</option></select></div>
        <div class="filter-group"><label>الفترة</label><select id="datePreset" class="select"><option value="all">كل المدة</option><option value="today">اليوم</option><option value="yesterday">الأمس</option><option value="last7">آخر 7 أيام</option><option value="last30">آخر 30 يوم</option><option value="this_month">هذا الشهر</option><option value="custom">فترة مخصصة</option></select></div>
        <div class="filter-group"><label>من تاريخ</label><input id="fdSearch" type="date" class="input"></div>
        <div class="filter-group"><label>إلى تاريخ</label><input id="tdSearch" type="date" class="input"></div>
        <div class="filter-group wide"><label>بحث سريع</label><input id="q" class="input" placeholder="كود / هاتف / اسم / عنوان"></div>
        <div class="filter-group"><label>من كود</label><input id="fc" class="input" inputmode="numeric"></div>
        <div class="filter-group"><label>إلى كود</label><input id="tc" class="input" inputmode="numeric"></div>
        <div class="filter-actions"><button id="searchBtn" class="btn btn-primary">بحث</button><button id="resetSearch" class="btn btn-soft">مسح الفلاتر</button></div>
      </div>
      <div id="ordersTable"></div>
    </div>`;
  $('#datePreset').onchange=()=>setDatePreset($('#datePreset').value,$('#fdSearch'),$('#tdSearch'));
  $('#searchBtn').onclick=loadOrders;
  $('#resetSearch').onclick=()=>{
    ['os','statusFilter','ps','q','fc','tc','fdSearch','tdSearch'].forEach(id=>{const e=$('#'+id);if(e)e.value=''});
    $('#datePreset').value='all';
    loadOrders();
  };
  await loadOrders();
}
async function loadOrders(){
  const p=new URLSearchParams();
  if($('#q')?.value)p.set('q',$('#q').value);
  if($('#fc')?.value)p.set('from_code',$('#fc').value);
  if($('#tc')?.value)p.set('to_code',$('#tc').value);
  if($('#ps')?.value!=='')p.set('printed',$('#ps').value);
  if($('#statusFilter')?.value)p.set('status',$('#statusFilter').value);
  if($('#os')?.value)p.set('store_id',$('#os').value);
  if($('#fdSearch')?.value)p.set('from_date',$('#fdSearch').value);
  if($('#tdSearch')?.value)p.set('to_date',$('#tdSearch').value);
  const d=await api('/orders?'+p.toString());
  state.orders=d.orders;
  renderOrdersTable('#ordersTable',state.orders,false);
}
const DELIVERY_STATUS_LABELS={
  pending:'قيد التوصيل',
  delivered:'تم التسليم',
  delivered_adjusted:'تم التسليم وتعديل قيمة',
  refused_fee_paid:'رفض ودفع أجور',
  refused_no_fee:'رفض وعدم دفع أجور',
  canceled_before_arrival:'ملغي قبل الوصول',
  partial:'استلام جزئي'
};

function deliveryBadge(o){
  const s=o.delivery_status||'pending';
  const ok=['delivered','delivered_adjusted'].includes(s);
  const warn=['pending','partial'].includes(s);
  return `<span class="badge ${ok?'badge-ok':warn?'badge-warn':'badge-danger'}">${DELIVERY_STATUS_LABELS[s]||s}</span>`;
}

async function openOutcome(id){
  const old=document.querySelector('.modal-backdrop');
  if(old) old.remove();

  const overlay=document.createElement('div');
  overlay.className='modal-backdrop outcome-modal';
  overlay.innerHTML=`
    <div class="modal-card outcome-card" dir="rtl">
      <div class="outcome-loading">جاري تحميل بيانات الطلب...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');

  const close=()=>{overlay.remove();document.documentElement.classList.remove('modal-open');document.body.classList.remove('modal-open');};
  overlay.onclick=e=>{if(e.target===overlay) close();};

  try{
    const d=await api('/orders/'+id);
    const o=d.order;
    if(!o) throw new Error('لم يتم العثور على الطلب');

    const card=overlay.querySelector('.outcome-card');
    card.innerHTML=`
      <div class="modal-head">
        <h3>تحديث نتيجة الطلب #${esc(o.order_code)}</h3>
        <button type="button" class="btn btn-soft outcome-close">✕</button>
      </div>

      <div class="outcome-form">
        <div class="field">
          <label>الحالة</label>
          <select id="outStatus" class="select">
            ${Object.entries(DELIVERY_STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${k===(o.delivery_status||'pending')?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>حالة الطباعة</label>
          <select id="outPrinted" class="select">
            <option value="1" ${Number(o.printed||0)===1?'selected':''}>مطبوع</option>
            <option value="0" ${Number(o.printed||0)===0?'selected':''}>غير مطبوع</option>
          </select>
          <div class="sub">عند اختيار غير مطبوع يرجع الطلب لقائمة جاهز للطباعة، مع بقاء سجل الطباعة القديم محفوظًا.</div>
        </div>

        <div class="field">
          <label>القيمة المسلّمة فعليًا</label>
          <input id="outDeliveredAmount" class="input" inputmode="decimal" value="${Number(o.delivered_amount||o.amount||0)}">
        </div>

        <div class="field">
          <label>أجور التوصيل</label>
          <div class="fixed-fee-wrap">
            <input id="outDeliveryFee" class="input" inputmode="decimal" value="${Number(o.delivery_fee||2)}">
            
          </div>
        </div>

        <div class="field">
          <label>الكاش المستلم من شركة التوصيل</label>
          <input id="outCash" class="input" inputmode="decimal" value="${Number(o.cash_collected||0)}">
        </div>

        <div class="field">
          <label>تكلفة البضاعة علينا</label>
          <input id="outCost" class="input" inputmode="decimal" value="${Number(o.cost_of_goods||0)}">
        </div>

        <div class="field">
          <label>عدد القطع المسلّمة</label>
          <input id="outDeliveredPieces" class="input" inputmode="numeric" value="${Number(o.delivered_pieces||0)}">
        </div>

        <div class="field">
          <label>عدد القطع المرتجعة</label>
          <input id="outReturnedPieces" class="input" inputmode="numeric" value="${Number(o.returned_pieces||0)}">
        </div>

        <div class="field">
          <label>ملاحظة التسوية</label>
          <textarea id="outNote" class="textarea">${esc(o.settlement_note||'')}</textarea>
        </div>
      </div>

      <div class="settlement-preview" style="font-size:20px;line-height:1.8">
        <div>قيمة الطلب: <b id="orderValuePreview">${money(o.amount||0)}</b> د.أ</div>
        <div>المبلغ المستلم فعليًا: <b id="receivedPreview">0.00</b> د.أ</div>
        <div>كوست البضاعة: <b id="costPreview">0.00</b> د.أ</div>
        <div>أجور التوصيل: <b id="feePreview">0.00</b> د.أ</div>
        <div style="margin-top:8px;padding:12px;border-radius:12px;background:#102a43;color:#fff;font-size:28px">صافي الربح: <b id="profitPreview">0.00</b> د.أ</div>
      </div>

      <div class="actions outcome-actions">
        <button type="button" id="saveOutcome" class="btn btn-accent">حفظ النتيجة</button>
        <button type="button" class="btn btn-soft outcome-close">إلغاء</button>
      </div>
    `;

    card.querySelectorAll('.outcome-close').forEach(x=>x.onclick=close);

    const calc=()=>{
      const status=card.querySelector('#outStatus').value;
      const received=Number(card.querySelector('#outDeliveredAmount').value||0);
      const cost=Number(card.querySelector('#outCost').value||0);
      const fee=Number(card.querySelector('#outDeliveryFee').value||0);
      const revenueStatuses=['delivered','delivered_adjusted','partial'];
      const net=revenueStatuses.includes(status)?received-cost-fee:0;
      card.querySelector('#receivedPreview').textContent=money(revenueStatuses.includes(status)?received:0);
      card.querySelector('#costPreview').textContent=money(cost);
      card.querySelector('#feePreview').textContent=money(fee);
      card.querySelector('#profitPreview').textContent=money(net);
    };

    const syncDefaultCash=()=>{
      const status=card.querySelector('#outStatus').value;
      const amount=Number(card.querySelector('#outDeliveredAmount').value||0);
      const cashInput=card.querySelector('#outCash');
      const existing=Number(o.cash_collected||0);
      if(existing===0 && ['delivered','delivered_adjusted'].includes(status)){
        cashInput.value=Math.max(0, amount-Number(card.querySelector('#outDeliveryFee').value||0));
      }
      calc();
    };
    card.querySelector('#outCash').oninput=calc;
    card.querySelector('#outCost').oninput=calc;
    card.querySelector('#outDeliveryFee').oninput=()=>{syncDefaultCash();calc()};
    card.querySelector('#outStatus').onchange=syncDefaultCash;
    card.querySelector('#outDeliveredAmount').oninput=syncDefaultCash;
    syncDefaultCash();

    card.querySelector('#saveOutcome').onclick=async()=>{
      const saveBtn=card.querySelector('#saveOutcome');
      saveBtn.disabled=true;
      saveBtn.textContent='جاري الحفظ...';
      try{
        await api('/orders/'+id+'/outcome',{
          method:'PUT',
          body:JSON.stringify({
            delivery_status:card.querySelector('#outStatus').value,
            printed:Number(card.querySelector('#outPrinted').value),
            delivered_amount:card.querySelector('#outDeliveredAmount').value,
            delivery_fee:2,
            cash_collected:card.querySelector('#outCash').value,
            cost_of_goods:card.querySelector('#outCost').value,
            delivered_pieces:card.querySelector('#outDeliveredPieces').value,
            returned_pieces:card.querySelector('#outReturnedPieces').value,
            settlement_note:card.querySelector('#outNote').value
          })
        });
        toast('تم حفظ نتيجة الطلب');
        close();
        if(state.view==='orders') loadOrders();
        if(state.view==='dashboard') dashboard();
        if(state.view==='print') printView();
      }catch(e){
        saveBtn.disabled=false;
        saveBtn.textContent='حفظ النتيجة';
        toast(e.message);
      }
    };
  }catch(e){
    const card=overlay.querySelector('.outcome-card');
    card.innerHTML=`
      <div class="outcome-error">
        <b>تعذر فتح نتيجة الطلب</b>
        <div>${esc(e.message||'حدث خطأ')}</div>
        <button type="button" class="btn btn-soft outcome-close">إغلاق</button>
      </div>`;
    card.querySelector('.outcome-close').onclick=close;
  }
}

function renderOrdersTable(sel,orders,selectable=true){
  const el=$(sel);
  if(!orders.length){el.innerHTML='<div class="empty">لا توجد طلبات</div>';return}
  const allowEdit=can('orders_edit')&&!isTrackingOnly();
  const allowDelete=can('orders_delete')&&!isTrackingOnly();
  const allowPrintChange=can('print')&&!isTrackingOnly();
  el.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr>${selectable?'<th><input id="allcheck" class="check" type="checkbox"></th>':''}<th>رقم الطلب</th><th>الكود</th><th>المتجر</th><th>الاسم</th><th>الهاتف</th><th>المحافظة / العنوان</th><th>القيمة</th><th>الملاحظات</th><th>الموظف</th><th>الحالة</th><th>الطباعة</th><th>التاريخ</th>${allowDelete?'<th>حذف</th>':''}</tr></thead><tbody>${orders.map((o,index)=>`<tr>${selectable?`<td><input class="rowcheck check" type="checkbox" data-id="${o.id}"></td>`:''}<td><b>${index+1}</b></td><td class="code">${allowEdit?`<button type="button" class="order-code-link" data-edit-order="${o.id}">${o.order_code}</button>`:`<span>${o.order_code}</span>`}</td><td><b>${esc(o.store_name||'—')}</b></td><td>${esc(o.recipient_name)}</td><td>${esc(o.phone)}</td><td class="address-cell"><button type="button" class="address-preview" data-address="${encodeURIComponent([o.area,o.detailed_address].filter(Boolean).join(' - '))}" aria-label="عرض العنوان كامل">${esc(o.area||'—')}<span class="address-short">${o.detailed_address?` • ${esc(String(o.detailed_address).replace(/\s+/g,' ').trim())}`:''}</span></button></td><td>${money(o.amount)}</td><td class="notes-cell"><button type="button" class="notes-preview" data-notes="${encodeURIComponent(o.order_notes||'')}" aria-label="عرض الملاحظات كاملة">${esc((o.order_notes||'').replace(/\s+/g,' ').trim()||'—')}</button></td><td>${esc(o.created_by_name||'')}</td><td>${deliveryBadge(o)}</td><td>${allowPrintChange?`<select class="select print-status-select" data-order-id="${o.id}" style="min-width:105px"><option value="1" ${o.printed?'selected':''}>مطبوع</option><option value="0" ${!o.printed?'selected':''}>غير مطبوع</option></select>`:`<span class="badge ${o.printed?'badge-ok':'badge-warn'}">${o.printed?'مطبوع':'غير مطبوع'}</span>`}</td><td>${fmtDate(o.created_at)}</td>${allowDelete?`<td><button type="button" class="btn btn-danger delete-order-btn" data-delete-order="${o.id}" data-order-code="${o.order_code}">حذف</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
  document.querySelectorAll('.order-code-link').forEach(btn=>{btn.onclick=()=>editOrder(Number(btn.dataset.editOrder));});
  document.querySelectorAll('.delete-order-btn').forEach(btn=>{
    btn.onclick=async()=>{
      const id=Number(btn.dataset.deleteOrder),code=btn.dataset.orderCode||id;
      if(!confirm(`حذف الطلب #${code}؟\nيمكن للمدير استرجاعه خلال 48 ساعة.`))return;
      btn.disabled=true;btn.textContent='جاري الحذف...';
      try{await api('/orders/'+id,{method:'DELETE'});state.orders=(state.orders||[]).filter(o=>Number(o.id)!==id);btn.closest('tr')?.remove();toast(`تم حذف الطلب #${code}`)}
      catch(e){btn.disabled=false;btn.textContent='حذف';toast(e.message)}
    };
  });
  document.querySelectorAll('.print-status-select').forEach(sel=>{sel.onchange=async()=>{sel.disabled=true;try{await api('/orders/'+sel.dataset.orderId+'/printed',{method:'PUT',body:JSON.stringify({printed:Number(sel.value)})});toast('تم تغيير حالة الطباعة')}catch(e){toast(e.message)}finally{sel.disabled=false}}});
  let infoPopover=document.querySelector('#infoPopover');
  if(!infoPopover){infoPopover=document.createElement('div');infoPopover.id='infoPopover';infoPopover.className='notes-popover';document.body.appendChild(infoPopover)}
  const hideInfoPopover=()=>{infoPopover.classList.remove('show');document.querySelectorAll('.notes-preview.open,.address-preview.open').forEach(x=>x.classList.remove('open'))};
  const bindInfoPreview=(selector,dataKey)=>{
    document.querySelectorAll(selector).forEach(btn=>{
      const showInfo=()=>{
        const text=decodeURIComponent(btn.dataset[dataKey]||'')||'لا توجد معلومات';infoPopover.textContent=text;
        const r=btn.getBoundingClientRect(),maxW=Math.min(420,window.innerWidth-24);infoPopover.style.maxWidth=maxW+'px';infoPopover.classList.add('show');btn.classList.add('open');
        const pw=infoPopover.offsetWidth,ph=infoPopover.offsetHeight;infoPopover.style.left=Math.max(12,Math.min(window.innerWidth-pw-12,r.left+r.width/2-pw/2))+'px';
        let top=r.bottom+8;if(top+ph>window.innerHeight-12)top=Math.max(12,r.top-ph-8);infoPopover.style.top=top+'px';
      };
      btn.addEventListener('mouseenter',showInfo);btn.addEventListener('mouseleave',()=>{if(!btn.classList.contains('open'))hideInfoPopover()});
      btn.addEventListener('click',e=>{e.stopPropagation();const wasOpen=btn.classList.contains('open');hideInfoPopover();if(!wasOpen)showInfo()});
    });
  };
  bindInfoPreview('.notes-preview','notes');bindInfoPreview('.address-preview','address');
  if(!window.__corvexInfoBound){
    document.addEventListener('click',e=>{if(!e.target.closest('.notes-preview')&&!e.target.closest('.address-preview')&&!e.target.closest('#infoPopover'))hideInfoPopover()});
    window.addEventListener('scroll',hideInfoPopover,true);window.addEventListener('resize',hideInfoPopover);window.__corvexInfoBound=true;
  }
  if(selectable){$('#allcheck').onchange=e=>document.querySelectorAll('.rowcheck').forEach(x=>x.checked=e.target.checked)}
}
async function printView(){
  const c=$('#content');
  const stores=await getActiveStores();
  c.innerHTML=`
    <div class="page-title"><div><h1>جاهز للطباعة</h1><div class="sub">كل متجر له دفعة طباعة مستقلة</div></div><div><span id="printCount" class="pill" style="background:#e9eff4;color:#102a43">0 طلب</span></div></div>
    <div class="card">
      <div class="store-print-picker no-print"><div class="field"><label>اختر المتجر أولاً</label><select id="printStore" class="select"><option value="">اختر المتجر...</option>${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div></div>
      <div class="actions no-print" style="margin-top:0;margin-bottom:14px"><button id="selAll" class="btn btn-soft">تحديد الكل</button><button id="makeBatch" class="btn btn-accent">إنشاء دفعة وطباعة المحدد</button></div>
      <div id="printTable"><div class="empty">اختر متجر لعرض طلباته غير المطبوعة</div></div>
    </div>`;
  const loadStore=async()=>{
    const sid=$('#printStore').value;
    if(!sid){state.orders=[];$('#printCount').textContent='0 طلب';$('#printTable').innerHTML='<div class="empty">اختر متجر لعرض طلباته غير المطبوعة</div>';return}
    const d=await api('/unprinted?store_id='+encodeURIComponent(sid));state.orders=d.orders;$('#printCount').textContent=state.orders.length+' طلب';renderOrdersTable('#printTable',state.orders,true)
  };
  $('#printStore').onchange=loadStore;
  $('#selAll').onclick=()=>document.querySelectorAll('.rowcheck').forEach(x=>x.checked=true);
  $('#makeBatch').onclick=async()=>{
    if(!$('#printStore').value)return toast('اختر المتجر أولاً');
    const ids=[...document.querySelectorAll('.rowcheck:checked')].map(x=>Number(x.dataset.id));
    if(!ids.length)return toast('حدد طلباً واحداً على الأقل');
    try{const r=await api('/print-batches',{method:'POST',body:JSON.stringify({order_ids:ids})});openPrintWindow(r.orders,`دفعة ${r.batch.store_name||''} - ${r.batch.batch_code}`);toast(`تم إنشاء دفعة ${r.batch.order_count} طلب لمتجر ${r.batch.store_name||''}`);setTimeout(loadStore,600)}catch(e){toast(e.message)}
  };
}
function nextDeliveryDateLabel(){
  const d=new Date();
  const addDays=d.getDay()===4?2:1;
  d.setDate(d.getDate()+addDays);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function labelHtml(o){
  const noteLines=String(o.order_notes||'-').split(/\\n+/).map(x=>x.trim()).filter(Boolean);
  const noteColumns=[];
  for(let i=0;i<noteLines.length;i+=6)noteColumns.push(noteLines.slice(i,i+6));
  const notesHtml=noteColumns.map(col=>`<div class="note-column">${col.map(line=>`<div class="note-line">${esc(line)}</div>`).join('')}</div>`).join('');
  const returnText=String(o.order_notes||'')+' '+String(o.raw_text||'');
  const hasReturn=['تبديل','استبدال','مرتجع','ارجاع','إرجاع'].some(x=>phraseMatch(returnText,x));
  const returnAlert=hasReturn?'<div class="return-alert">⚠ يوجد مرتجع</div>':'';
  return `<div class="label"><div class="label-head"><span class="label-code">#${o.order_code}</span><b class="label-brand">CORVEX SPORT</b><span class="label-spacer"></span></div><div class="label-store">اسم المتجر: ${esc(o.store_name||'—')}</div><div class="recipient-date-row"><div><strong>المستلم:</strong> ${esc(o.recipient_name)}</div><strong class="delivery-date">${nextDeliveryDateLabel()}</strong></div><div><strong>الهاتف:</strong> ${esc(o.phone)}</div><div><strong>العنوان:</strong> ${esc(o.area)} ${esc(o.detailed_address)}</div><div><strong>القيمة:</strong> ${money(o.amount)} د.أ</div><div class="note" style="--note-cols:${Math.max(1,noteColumns.length)}">${notesHtml}</div>${returnAlert}</div>`;
}
function openPrintWindow(orders,title='طباعة'){const w=window.open('','_blank');const pages=[];for(let i=0;i<orders.length;i+=8)pages.push(orders.slice(i,i+8));w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif}.page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:3mm;page-break-after:always}.page:last-child{page-break-after:auto}.label{border:1px solid #555;padding:4mm;font-size:10.5pt;overflow:hidden}.label-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid #999;padding-bottom:2mm;margin-bottom:2mm;font-size:12pt}.label-code{justify-self:start}.label-brand{justify-self:center;text-align:center}.label-spacer{justify-self:end}.label-store{text-align:center;font-size:12pt;font-weight:900;margin:0 0 1mm;padding-bottom:1mm;border-bottom:1px solid #777}.recipient-date-row{display:flex;align-items:center;justify-content:space-between;gap:3mm}.delivery-date{direction:ltr;white-space:nowrap}.note{margin-top:1mm;border-top:1px dashed #aaa;padding-top:1mm;font-weight:700;display:grid;grid-template-columns:repeat(var(--note-cols),minmax(0,1fr));gap:2mm;line-height:1.22;word-break:break-word}.note-column{min-width:0}.note-column+.note-column{border-right:1px dotted #bbb;padding-right:2mm}.note-line{margin:0 0 .55mm}.return-alert{margin-top:1mm;padding:.8mm 1.5mm;border:2px solid #000;text-align:center;font-size:13pt;font-weight:900;background:#fff}</style></head><body>${pages.map(pg=>`<section class="page">${pg.map(labelHtml).join('')}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}
async function batchesView(){
  const c=$('#content');
  const stores=await getActiveStores();
  c.innerHTML=`<div class="page-title"><div><h1>دفعات الطباعة</h1><div class="sub">كل ضغطة طباعة تُسجّل دفعة واحدة مهما كان عدد أوراقها</div></div></div><div class="card"><div class="toolbar"><select id="batchStore" class="select"><option value="">كل المتاجر</option>${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div><div id="batchList"></div></div>`;
  const loadBatches=async()=>{
    const q=$('#batchStore').value?('?store_id='+encodeURIComponent($('#batchStore').value)):'';
    const d=await api('/print-batches'+q);state.batches=d.batches;
    $('#batchList').innerHTML=state.batches.length?state.batches.map(b=>`<div class="batch-card"><div><b>${esc(b.batch_code)}</b><div class="batch-meta">${esc(b.store_name||'متجر غير محدد')} • ${b.order_count} طلب • ${Math.max(1,Math.ceil(Number(b.order_count||0)/8))} صفحة • طبعة واحدة • ${esc(b.created_by_name||'')} • ${fmtDate(b.created_at)}</div></div><div class="actions" style="margin:0"><button class="btn btn-outline" data-batch="${b.id}" data-mode="all">إعادة الدفعة</button><button class="btn btn-soft" data-batch="${b.id}" data-mode="page">إعادة صفحة</button>${state.user?.role==='admin'?`<button class="btn btn-danger" data-delete-batch="${b.id}" data-batch-code="${esc(b.batch_code)}">حذف الدفعة</button>`:''}</div></div>`).join(''):'<div class="empty">لا توجد دفعات</div>';
    document.querySelectorAll('[data-batch]').forEach(btn=>btn.onclick=async()=>{const d=await api('/print-batches/'+btn.dataset.batch);if(btn.dataset.mode==='all')openPrintWindow(d.orders,`إعادة ${d.batch.batch_code}`);else{const max=Math.ceil(d.orders.length/8);const p=Number(prompt(`رقم الصفحة من 1 إلى ${max}`,'1'));if(p>=1&&p<=max)openPrintWindow(d.orders.slice((p-1)*8,p*8),`صفحة ${p} - ${d.batch.batch_code}`)}})
    document.querySelectorAll('[data-delete-batch]').forEach(btn=>btn.onclick=async()=>{
      if(!confirm(`حذف دفعة ${btn.dataset.batchCode||''}؟\nلن يتم حذف الطلبات نفسها.`))return;
      btn.disabled=true;
      try{await api('/print-batches/'+btn.dataset.deleteBatch,{method:'DELETE'});toast('تم حذف دفعة الطباعة');loadBatches()}
      catch(e){btn.disabled=false;toast(e.message)}
    });
  };
  $('#batchStore').onchange=loadBatches;await loadBatches()
}

function parseDeliveryDelimitedText(text){
  const raw=String(text||'').replace(/^\uFEFF/,'').trim();
  if(!raw)return {headers:[],rows:[]};

  const lines=raw.split(/\r?\n/).filter(x=>x.trim()!=='');
  const sample=lines.slice(0,5).join('\n');
  const candidates=[',','\t',';'];
  let delimiter=',',best=-1;
  for(const d of candidates){
    const score=sample.split(d).length;
    if(score>best){best=score;delimiter=d}
  }

  function splitLine(line){
    const out=[];let cur='',quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(quoted&&line[i+1]==='"'){cur+='"';i++}
        else quoted=!quoted;
      }else if(ch===delimiter&&!quoted){
        out.push(cur.trim());cur='';
      }else cur+=ch;
    }
    out.push(cur.trim());
    return out;
  }

  const matrix=lines.map(splitLine);
  const headers=(matrix.shift()||[]).map((h,i)=>h||('عمود '+(i+1)));
  const rows=matrix.map((cells,idx)=>{
    const obj={__row:idx+2};
    headers.forEach((h,i)=>obj[h]=cells[i]??'');
    return obj;
  });
  return {headers,rows};
}

function deliveryHeaderGuess(headers,kind){
  const hs=headers.map(h=>({raw:h,n:normalizeArabic(String(h)).toLowerCase()}));
  const tests={
    phone:['هاتف','الهاتف','رقم الهاتف','موبايل','جوال','phone','mobile','tel'],
    status:['حاله','الحاله','الحالة','status','result','نتيجه','نتيجة'],
    amount:['مبلغ','القيمه','القيمة','تحصيل','المحصل','cash','amount','cod','price'],
    note:['ملاحظه','ملاحظات','note','notes','سبب','reason']
  };
  const list=tests[kind]||[];
  const found=hs.find(x=>list.some(k=>x.n.includes(normalizeArabic(k).toLowerCase())));
  return found?.raw||'';
}

function mapDeliveryCompanyStatus(raw){
  const n=normalizeArabic(String(raw||'')).toLowerCase().replace(/\s+/g,' ').trim();
  if(!n)return '';
  if(n.includes('تم التسليم')||n.includes('تم التسليم')||n.includes('مسلم')||n.includes('delivered')||n==='done')return 'delivered';
  if((n.includes('رفض')||n.includes('راجع')||n.includes('مرتجع'))&&(n.includes('دفع')||n.includes('اجور')||n.includes('أجور')))return 'refused_fee_paid';
  if((n.includes('رفض')||n.includes('راجع')||n.includes('مرتجع'))&&(n.includes('عدم')||n.includes('بدون')||n.includes('لم يدفع')))return 'refused_no_fee';
  if(n.includes('ملغي')||n.includes('الغاء')||n.includes('إلغاء')||n.includes('cancel'))return 'canceled_before_arrival';
  if(n.includes('جزئي')||n.includes('partial'))return 'partial';
  if(n.includes('قيد')||n.includes('توصيل')||n.includes('pending')||n.includes('out for delivery'))return 'pending';
  return '';
}

function deliveryStatusOptions(selected=''){
  return [
    ['','اختر الحالة'],
    ['delivered','تم التسليم'],
    ['refused_fee_paid','رفض ودفع أجور'],
    ['refused_no_fee','رفض وعدم دفع أجور'],
    ['canceled_before_arrival','ملغي قبل الوصول'],
    ['partial','استلام جزئي'],
    ['pending','قيد التوصيل']
  ].map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${l}</option>`).join('');
}

async function deliveryReconcileView(){
  const c=$('#content');
  const stores=await getActiveStores();
  let parsed={headers:[],rows:[]};
  let previewRows=[];

  c.innerHTML=`
    <div class="page-title">
      <div>
        <h1>تسوية شركة التوصيل</h1>
        <div class="sub">اختر المتجر، ارفع الكشف أو الصقه، والمطابقة تتم برقم الهاتف داخل نفس المتجر</div>
      </div>
    </div>

    <div class="card">
      <div class="delivery-upload-grid">
        <div class="field">
          <label>المتجر صاحب الكشف</label>
          <select id="deliveryStore" class="select">
            <option value="">اختر المتجر...</option>
            ${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>رفع كشف CSV / TXT</label>
          <input id="deliveryFile" type="file" class="input" accept=".csv,.txt,.tsv,text/csv,text/plain">
        </div>

        <div class="field full">
          <label>أو الصق الكشف مباشرة من Excel</label>
          <textarea id="deliveryPaste" class="textarea delivery-paste" placeholder="انسخ الأعمدة والصفوف من Excel والصقهم هنا"></textarea>
        </div>
      </div>

      <div id="deliveryMapping" style="display:none"></div>
      <div id="deliveryPreview"></div>
      <div id="deliveryHistory"></div>
    </div>`;

  const loadHistory=async()=>{
    const sid=$('#deliveryStore').value;
    if(!sid){$('#deliveryHistory').innerHTML='';return}
    try{
      const h=await api('/delivery-reconcile/history?store_id='+encodeURIComponent(sid));
      $('#deliveryHistory').innerHTML=`
        <div class="delivery-history-block">
          <h3>سجل كشوف شركة التوصيل</h3>
          ${(h.settlements||[]).length?(h.settlements||[]).map(x=>`
            <div class="settlement-row">
              <div>
                <b>${esc(x.settlement_code)}</b>
                <div class="sub">${fmtDate(x.created_at)} • مطابق ${x.matched_count} • غير مطابق ${x.unmatched_count} • مكرر ${x.duplicate_count}</div>
              </div>
              <div class="delivery-history-money">
                <strong>${money(x.net_due)} د.أ</strong>
                <span>صافي التحصيل</span>
              </div>
            </div>`).join(''):'<div class="empty">لا يوجد كشوف سابقة لهذا المتجر</div>'}
        </div>`;
    }catch(e){$('#deliveryHistory').innerHTML=''}
  };

  const renderMapping=()=>{
    if(!parsed.headers.length){$('#deliveryMapping').style.display='none';return}
    const options=(selected='')=>'<option value="">— اختر —</option>'+parsed.headers.map(h=>`<option value="${encodeURIComponent(h)}" ${h===selected?'selected':''}>${esc(h)}</option>`).join('');
    const phone=deliveryHeaderGuess(parsed.headers,'phone');
    const status=deliveryHeaderGuess(parsed.headers,'status');
    const amount=deliveryHeaderGuess(parsed.headers,'amount');
    const note=deliveryHeaderGuess(parsed.headers,'note');

    $('#deliveryMapping').style.display='block';
    $('#deliveryMapping').innerHTML=`
      <div class="delivery-map-card">
        <h3>تحديد أعمدة الكشف</h3>
        <div class="delivery-map-grid">
          <div class="field"><label>رقم الهاتف *</label><select id="mapPhone" class="select">${options(phone)}</select></div>
          <div class="field"><label>الحالة *</label><select id="mapStatus" class="select">${options(status)}</select></div>
          <div class="field"><label>المبلغ المحصل</label><select id="mapAmount" class="select">${options(amount)}</select></div>
          <div class="field"><label>الملاحظات</label><select id="mapNote" class="select">${options(note)}</select></div>
        </div>
        <div class="sub">تم قراءة ${parsed.rows.length} صف. إذا لم يتعرف النظام على اسم العمود، اختاره يدويًا.</div>
        <button id="matchDeliveryReport" class="btn btn-primary">مطابقة الكشف</button>
      </div>`;

    $('#matchDeliveryReport').onclick=previewReport;
  };

  const parseText=(text)=>{
    parsed=parseDeliveryDelimitedText(text);
    previewRows=[];
    $('#deliveryPreview').innerHTML='';
    renderMapping();
  };

  $('#deliveryFile').onchange=async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const text=await file.text();
    $('#deliveryPaste').value='';
    parseText(text);
  };

  $('#deliveryPaste').oninput=()=>{
    const v=$('#deliveryPaste').value;
    if(v.trim())parseText(v);
  };

  $('#deliveryStore').onchange=loadHistory;
  await loadHistory();

  async function previewReport(){
    const storeId=$('#deliveryStore').value;
    if(!storeId)return toast('اختر المتجر أولاً');

    const phoneCol=decodeURIComponent($('#mapPhone').value||'');
    const statusCol=decodeURIComponent($('#mapStatus').value||'');
    const amountCol=decodeURIComponent($('#mapAmount').value||'');
    const noteCol=decodeURIComponent($('#mapNote').value||'');

    if(!phoneCol)return toast('حدد عمود رقم الهاتف');
    if(!statusCol)return toast('حدد عمود الحالة');

    const rows=parsed.rows.map(r=>({
      phone:r[phoneCol]||'',
      status:mapDeliveryCompanyStatus(r[statusCol]),
      raw_status:r[statusCol]||'',
      amount:amountCol?Number(String(r[amountCol]||'0').replace(/[^\d.\-]/g,''))||0:0,
      note:noteCol?r[noteCol]||'':''
    }));

    try{
      const d=await api('/delivery-reconcile/preview',{
        method:'POST',
        body:JSON.stringify({store_id:storeId,rows})
      });

      previewRows=(d.rows||[]).map((x,i)=>({...x,raw_status:rows[i]?.raw_status||'',status:rows[i]?.status||''}));
      renderDeliveryPreview(d.summary||{});
    }catch(e){toast(e.message)}
  }

  function renderDeliveryPreview(summary){
    const unresolved=previewRows.filter(x=>x.match_type!=='matched').length;
    $('#deliveryPreview').innerHTML=`
      <div class="delivery-summary">
        <div><span>إجمالي الكشف</span><b>${summary.total||0}</b></div>
        <div class="ok"><span>مطابق مؤكد</span><b>${summary.matched||0}</b></div>
        <div class="warn"><span>رقم مكرر</span><b>${summary.duplicate||0}</b></div>
        <div class="bad"><span>غير موجود</span><b>${summary.unmatched||0}</b></div>
      </div>

      <div class="sub delivery-review-note">راجع المكرر وغير المعروف قبل الاعتماد. الطلبات غير المحسومة لن تتغير.</div>

      <div class="table-wrap">
        <table class="table delivery-preview-table">
          <thead>
            <tr><th>#</th><th>الهاتف</th><th>المطابقة</th><th>الطلب</th><th>حالة الكشف</th><th>الحالة المعتمدة</th><th>المبلغ</th><th>ملاحظة</th></tr>
          </thead>
          <tbody>
            ${previewRows.map((r,i)=>{
              let orderCell='—';
              if(r.match_type==='matched'&&r.order){
                orderCell=`#${r.order.order_code} • ${esc(r.order.recipient_name||'لا يوجد')}`;
              }else if(r.match_type==='duplicate'){
                orderCell=`<select class="select delivery-order-choice" data-i="${i}">
                  <option value="">اختر الطلب الصحيح...</option>
                  ${(r.candidates||[]).map(o=>`<option value="${o.id}">#${o.order_code} • ${esc(o.recipient_name||'لا يوجد')} • ${money(o.amount)}</option>`).join('')}
                </select>`;
              }
              const badge=r.match_type==='matched'
                ?'<span class="match-badge match-ok">مطابق</span>'
                :r.match_type==='duplicate'
                  ?'<span class="match-badge match-warn">مكرر</span>'
                  :'<span class="match-badge match-bad">غير موجود</span>';

              return `<tr>
                <td>${r.row_index}</td>
                <td>${esc(r.phone||'')}</td>
                <td>${badge}</td>
                <td>${orderCell}</td>
                <td>${esc(r.raw_status||'')}</td>
                <td><select class="select delivery-status-choice" data-i="${i}">${deliveryStatusOptions(r.status||'')}</select></td>
                <td><input class="input delivery-amount-choice" data-i="${i}" inputmode="decimal" value="${Number(r.amount||0)}"></td>
                <td><input class="input delivery-note-choice" data-i="${i}" value="${esc(r.note||'')}"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="delivery-commit-bar">
        <div><b>المطابقة تعتمد على الهاتف داخل المتجر المختار فقط.</b><div class="sub">إذا تكرر نفس الهاتف، اختر الطلب الصحيح يدويًا.</div></div>
        <button id="commitDeliveryReport" class="btn btn-accent">اعتماد وتسكير الكشف</button>
      </div>`;

    $('#commitDeliveryReport').onclick=commitReport;
  }

  async function commitReport(){
    const storeId=$('#deliveryStore').value;
    if(!storeId)return;

    const rows=previewRows.map((r,i)=>{
      const manual=document.querySelector(`.delivery-order-choice[data-i="${i}"]`);
      const orderId=r.match_type==='matched'?Number(r.order?.id||0):Number(manual?.value||0);
      const status=document.querySelector(`.delivery-status-choice[data-i="${i}"]`)?.value||'';
      const amount=Number(document.querySelector(`.delivery-amount-choice[data-i="${i}"]`)?.value||0);
      const note=document.querySelector(`.delivery-note-choice[data-i="${i}"]`)?.value||'';
      return {order_id:orderId,phone:r.phone,status,amount,note,match_type:r.match_type};
    });

    const resolvable=rows.filter(r=>r.order_id);
    const missingStatus=resolvable.filter(r=>!r.status);
    if(!resolvable.length)return toast('لا توجد طلبات مطابقة للاعتماد');
    if(missingStatus.length)return toast('يوجد طلب مطابق بدون حالة معتمدة');

    if(!confirm(`سيتم تحديث ${resolvable.length} طلب. هل تريد اعتماد وتسكير الكشف؟`))return;

    try{
      const source=$('#deliveryFile').files?.[0]?.name||'كشف ملصوق';
      const d=await api('/delivery-reconcile/commit',{
        method:'POST',
        body:JSON.stringify({store_id:storeId,source_name:source,rows})
      });
      const s=d.settlement;
      $('#deliveryPreview').innerHTML=`
        <div class="card delivery-done">
          <h2>تم اعتماد الكشف ✓</h2>
          <div class="accounting-stats">
            <div><span>رقم التسوية</span><b>${esc(s.settlement_code)}</b></div>
            <div><span>تم تحديث</span><b>${s.matched_count}</b></div>
            <div><span>تم التسليم</span><b>${s.delivered_count}</b></div>
            <div><span>رفض / رجوع</span><b>${s.refused_count}</b></div>
            <div><span>إجمالي التحصيل</span><b>${money(s.collected_amount)}</b></div>
            <div><span>أجور التوصيل</span><b>${money(s.delivery_fees)}</b></div>
            <div><span>الصافي</span><b>${money(s.net_due)}</b></div>
          </div>
        </div>`;
      await loadHistory();
      toast('تم تحديث الطلبات وتسكير الكشف');
    }catch(e){toast(e.message)}
  }
}

function renderReportTable(orders){
  const box=$('#reportTable');
  if(!orders.length){box.innerHTML='<div class="empty">لا توجد طلبات مطابقة</div>';return}
  box.innerHTML=`<div class="table-wrap"><table class="table" style="min-width:980px"><thead><tr>
    <th>الكود</th><th>المتجر</th><th>الاسم</th><th>المحافظة</th><th>العنوان</th><th>رقم الهاتف</th><th>القيمة</th><th>الحالة</th><th>الملاحظات</th><th>التاريخ</th>
  </tr></thead><tbody>${orders.map(o=>`<tr>
    <td class="code">#${esc(o.order_code)}</td><td>${esc(o.store_name||'—')}</td><td>${esc(o.recipient_name||'لا يوجد')}</td><td>${esc(o.area||'—')}</td><td>${esc(o.detailed_address||'—')}</td><td>${esc(o.phone||'')}</td><td>${money(o.amount)}</td><td>${esc(DELIVERY_STATUS_LABELS[o.delivery_status||'pending']||o.delivery_status||'')}</td><td style="white-space:pre-line;min-width:180px">${esc(o.order_notes||'—')}</td><td style="direction:ltr;white-space:nowrap">${esc(o.first_print_date||'—')}</td>
  </tr>`).join('')}</tbody></table></div>`;
}


async function dailyProfitsView(){
  const c=$('#content');
  const stores=await getActiveStores();
  const today=new Date().toISOString().slice(0,10);
  c.innerHTML=`
    <div class="page-title"><div><h1>الأرباح اليومية</h1><div class="sub">طلبات تم التسليم والتسليم الجزئي فقط</div></div></div>
    <div class="card">
      <div class="toolbar">
        <input id="profitDate" type="date" class="input" value="${today}">
        <select id="profitStore" class="select"><option value="">كل المتاجر</option>${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <button id="loadProfits" class="btn btn-primary">عرض</button>
      </div>
      <div id="profitSummary"></div>
      <div id="profitOrders"></div>
    </div>`;

  const recalc=()=>{
    const cards=[...document.querySelectorAll('.profit-order-card')];
    let sales=0,costs=0,fees=0;
    cards.forEach(card=>{
      const amount=Number(card.querySelector('.profit-amount').value||0);
      const cost=Number(card.querySelector('.profit-cost').value||0);
      const fee=Number(card.querySelector('.profit-fee').value||0);
      const net=amount-cost-fee;
      card.querySelector('.profit-net').textContent=money(net);
      sales+=amount;costs+=cost;fees+=fee;
    });
    $('#profitSummary').innerHTML=`<div class="accounting-stats" style="margin:14px 0"><div><span>إجمالي الفواتير / المستلم</span><b>${money(sales)}</b></div><div><span>إجمالي كوست البضاعة</span><b>${money(costs)}</b></div><div><span>إجمالي أجور التوصيل</span><b>${money(fees)}</b></div><div><span>صافي الربح</span><b>${money(sales-costs-fees)}</b></div></div>`;
  };

  const load=async()=>{
    const p=new URLSearchParams({statuses:'delivered,delivered_adjusted,partial',date_basis:'settled',from_date:$('#profitDate').value,to_date:$('#profitDate').value});
    if($('#profitStore').value)p.set('store_id',$('#profitStore').value);
    const d=await api('/orders?'+p.toString()),orders=d.orders||[];
    const cardsHtml=orders.map(o=>`
      <div class="card profit-order-card" data-id="${o.id}" data-status="${o.delivery_status}" style="margin:12px 0;padding:14px">
        <div class="section-head"><div><b>#${o.order_code} — ${esc(o.store_name||'')}</b><div class="sub">${esc(o.recipient_name||'لا يوجد')} • ${esc(o.phone||'')} • ${deliveryBadge(o)}</div></div><button class="btn btn-soft profit-ai" data-id="${o.id}">✨ حساب الكوست بالذكاء</button></div>
        <div class="grid form-grid" style="margin-top:12px">
          <div class="field"><label>المبلغ المستلم فعليًا</label><input class="input profit-amount" inputmode="decimal" value="${Number(o.delivered_amount||o.amount||0)}"></div>
          <div class="field"><label>كوست البضاعة</label><input class="input profit-cost" inputmode="decimal" value="${Number(o.cost_of_goods||0)}"></div>
          <div class="field"><label>أجور التوصيل</label><input class="input profit-fee" inputmode="decimal" value="${Number(o.delivery_fee||2)}"></div>
          <div class="field"><label>صافي الربح</label><div style="background:#102a43;color:#fff;border-radius:12px;padding:13px;font-size:24px"><b class="profit-net">0.00</b> د.أ</div></div>
        </div>
        <div class="sub" style="white-space:pre-line;margin:10px 0">${esc(o.order_notes||'')}</div>
        <button class="btn btn-accent profit-save" data-id="${o.id}">حفظ الحساب</button>
      </div>`).join('');
    $('#profitOrders').innerHTML=orders.length?cardsHtml+`<div class="actions" style="justify-content:center;margin-top:18px"><button id="profitAiAll" class="btn btn-primary" style="min-width:260px">✨ حساب كل الطلبات وجمع الإجماليات</button></div>`:'<div class="empty">لا توجد طلبات مسلّمة بهذا التاريخ</div>';

    const analyzeOne=async(card,o)=>{
      const d=await api('/ai-parse-order',{method:'POST',body:JSON.stringify({text:o.raw_text||o.order_notes||''})});
      card.querySelector('.profit-cost').value=money(d.parsed?.cost_of_goods||0);
      recalc();
    };

    document.querySelectorAll('.profit-order-card input').forEach(x=>x.oninput=recalc);
    document.querySelectorAll('.profit-ai').forEach(btn=>btn.onclick=async()=>{
      const card=btn.closest('.profit-order-card'),o=orders.find(x=>Number(x.id)===Number(btn.dataset.id));
      btn.disabled=true;btn.textContent='جاري التحليل...';
      try{await analyzeOne(card,o);toast('تم حساب الكوست — راجعه ثم احفظ')}
      catch(e){toast(e.message)}
      finally{btn.disabled=false;btn.textContent='✨ حساب الكوست بالذكاء'}
    });

    if($('#profitAiAll'))$('#profitAiAll').onclick=async()=>{
      const btn=$('#profitAiAll');btn.disabled=true;
      let done=0,failed=0;
      for(const o of orders){
        btn.textContent=`جاري حساب ${done+failed+1} من ${orders.length}...`;
        const card=document.querySelector(`.profit-order-card[data-id="${o.id}"]`);
        try{await analyzeOne(card,o);done++}catch{failed++}
      }
      recalc();
      btn.disabled=false;btn.textContent='✨ حساب كل الطلبات وجمع الإجماليات';
      toast(failed?`تم حساب ${done} طلب وتعذر ${failed}`:`تم حساب وجمع ${done} طلب`);
    };

    document.querySelectorAll('.profit-save').forEach(btn=>btn.onclick=async()=>{
      const card=btn.closest('.profit-order-card'),o=orders.find(x=>Number(x.id)===Number(btn.dataset.id));
      btn.disabled=true;
      try{
        const amount=Number(card.querySelector('.profit-amount').value||0);
        const fee=Number(card.querySelector('.profit-fee').value||0);
        await api('/orders/'+o.id+'/outcome',{method:'PUT',body:JSON.stringify({
          delivery_status:o.delivery_status,printed:Number(o.printed||0),delivered_amount:amount,
          delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:Number(card.querySelector('.profit-cost').value||0),
          delivered_pieces:Number(o.delivered_pieces||0),returned_pieces:Number(o.returned_pieces||0),settlement_note:o.settlement_note||''
        })});
        toast('تم حفظ حساب الطلب');recalc();
      }catch(e){toast(e.message)}finally{btn.disabled=false}
    });
    recalc();
  };
  $('#loadProfits').onclick=load;$('#profitStore').onchange=load;$('#profitDate').onchange=load;
  await load();
}
async function reportsView(){
  const c=$('#content');
  const stores=await getActiveStores();

  c.innerHTML=`
    <div class="page-title">
      <div><h1>الكشوفات وExcel</h1><div class="sub">كشوف الطلبات + عدد الشحنات التي خرجت فعليًا حسب أول طباعة</div></div>
    </div>

    <div class="card">
      <h3>كشف الطلبات</h3>
      <div class="toolbar">
        <select id="reportStore" class="select">
          <option value="">كل المتاجر</option>
          ${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
        <details id="reportStatusPicker" style="position:relative">
          <summary class="btn btn-soft" style="list-style:none;white-space:nowrap">الحالات: <span id="reportStatusCount">الكل</span></summary>
          <div class="card" style="position:absolute;z-index:20;top:calc(100% + 6px);right:0;width:245px;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.18)">
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="pending"><span>قيد التوصيل</span></label>
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="delivered"><span>تم التسليم</span></label>
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="delivered_adjusted"><span>تم التسليم وتعديل قيمة</span></label>
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="refused_fee_paid"><span>رفض ودفع أجور</span></label>
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="refused_no_fee"><span>رفض وعدم دفع أجور</span></label>
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="canceled_before_arrival"><span>ملغي قبل الوصول</span></label>
            <label class="perm-check"><input class="report-status-check" type="checkbox" value="partial"><span>استلام جزئي</span></label>
          </div>
        </details>
        <input id="fd" type="date" class="input">
        <input id="td" type="date" class="input">
        <button id="rr" class="btn btn-primary">عرض</button>
        <button id="rp" class="btn btn-outline">طباعة كشف</button>
        <button id="rx" class="btn btn-accent">تنزيل Excel/CSV</button>
      </div>
      <div id="reportTable"></div>
    </div>

    <div class="card outgoing-report-card">
      <h3>الشحنات الخارجة حسب الطباعة</h3>
      <div class="sub">كل طلب يُحسب مرة واحدة فقط بتاريخ أول طباعة، وإعادة الطباعة لا تغيّر الكشف</div>

      <div class="toolbar">
        <select id="outgoingStore" class="select">
          <option value="">كل المتاجر</option>
          ${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
        <input id="ofd" type="date" class="input">
        <input id="otd" type="date" class="input">
        <button id="outgoingToday" class="btn btn-soft">اليوم</button>
        <button id="outgoingYesterday" class="btn btn-soft">أمس</button>
        <button id="outgoingLoad" class="btn btn-primary">عرض</button>
      </div>

      <div id="outgoingSummary"></div>
    </div>`;

  const today=new Date().toISOString().slice(0,10);
  $('#fd').value=today;
  $('#td').value=today;
  $('#ofd').value=today;
  $('#otd').value=today;

  async function load(){
    const p=new URLSearchParams({from_date:$('#fd').value,to_date:$('#td').value,date_basis:'first_printed'});
    if($('#reportStore').value)p.set('store_id',$('#reportStore').value);
    const statuses=[...document.querySelectorAll('.report-status-check:checked')].map(x=>x.value);
    if(statuses.length)p.set('statuses',statuses.join(','));
    const d=await api('/orders?'+p);
    state.orders=d.orders;
    renderReportTable(state.orders);
    const realized=state.orders.filter(o=>['delivered','delivered_adjusted','partial'].includes(o.delivery_status));
    const sales=realized.reduce((s,o)=>s+Number(o.delivered_amount||0),0);
    const costs=realized.reduce((s,o)=>s+Number(o.cost_of_goods||0),0);
    const fees=realized.reduce((s,o)=>s+Number(o.delivery_fee||0),0);
    const net=sales-costs-fees;
    const table=$('#reportTable');
    table.insertAdjacentHTML('afterbegin',`<div class="accounting-stats" style="margin-bottom:14px"><div><span>إجمالي المبيعات الفعلية</span><b>${money(sales)}</b></div><div><span>إجمالي كوست البضاعة</span><b>${money(costs)}</b></div><div><span>إجمالي أجور التوصيل</span><b>${money(fees)}</b></div><div><span>صافي الربح</span><b>${money(net)}</b></div></div>`);
  }

  async function loadOutgoing(){
    const p=new URLSearchParams();
    if($('#ofd').value)p.set('from_date',$('#ofd').value);
    if($('#otd').value)p.set('to_date',$('#otd').value);
    if($('#outgoingStore').value)p.set('store_id',$('#outgoingStore').value);

    const d=await api('/outgoing-report?'+p.toString());
    const rows=d.rows||[];

    $('#outgoingSummary').innerHTML=`
      <div class="outgoing-report-total">إجمالي الشحنات الخارجة: <b>${d.total||0}</b></div>
      ${rows.length?`
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>التاريخ</th><th>المتجر</th><th>عدد الطلبات الخارجة</th></tr></thead>
            <tbody>
              ${rows.map(r=>`<tr><td>${esc(r.print_date||'')}</td><td>${esc(r.store_name||'متجر غير محدد')}</td><td><b>${Number(r.orders_count||0)}</b></td></tr>`).join('')}
            </tbody>
          </table>
        </div>`:'<div class="empty">لا توجد شحنات خارجة في هذه الفترة</div>'}`;
  }

  $('#rr').onclick=load;
  $('#rp').onclick=()=>printReport(state.orders);
  $('#rx').onclick=()=>downloadCsv(state.orders);
  $('#reportStore').onchange=load;
  document.querySelectorAll('.report-status-check').forEach(x=>x.onchange=()=>{
    const count=document.querySelectorAll('.report-status-check:checked').length;
    $('#reportStatusCount').textContent=count?String(count):'الكل';
    load();
  });

  $('#outgoingLoad').onclick=loadOutgoing;
  $('#outgoingStore').onchange=loadOutgoing;
  $('#outgoingToday').onclick=()=>{$('#ofd').value=today;$('#otd').value=today;loadOutgoing()};
  $('#outgoingYesterday').onclick=()=>{
    const d=new Date();
    d.setDate(d.getDate()-1);
    const y=d.toISOString().slice(0,10);
    $('#ofd').value=y;
    $('#otd').value=y;
    loadOutgoing();
  };

  await load();
  await loadOutgoing();
}
function printReport(orders){const w=window.open('','_blank');w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>كشف CORVEX SPORT</title><style>@page{size:A4 landscape;margin:7mm}body{font-family:Tahoma,Arial}table{width:100%;border-collapse:collapse;font-size:9px;table-layout:auto}th,td{border:1px solid #aaa;padding:4px;text-align:right;vertical-align:top}.notes{white-space:pre-line;max-width:58mm}h2{margin:0 0 8px}</style></head><body><h2>كشف طلبات CORVEX SPORT</h2><table><thead><tr><th>الكود</th><th>المتجر</th><th>الاسم</th><th>المحافظة</th><th>العنوان</th><th>رقم الهاتف</th><th>القيمة</th><th>الحالة</th><th>الملاحظات</th><th>التاريخ</th></tr></thead><tbody>${orders.map(o=>`<tr><td>#${o.order_code}</td><td>${esc(o.store_name||'—')}</td><td>${esc(o.recipient_name||'لا يوجد')}</td><td>${esc(o.area||'—')}</td><td>${esc(o.detailed_address||'—')}</td><td>${esc(o.phone||'')}</td><td>${money(o.amount)}</td><td>${esc(DELIVERY_STATUS_LABELS[o.delivery_status||'pending']||o.delivery_status||'')}</td><td class="notes">${esc(o.order_notes||'—')}</td><td>${esc(o.first_print_date||'—')}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
function downloadCsv(orders){const rows=[['الكود','المتجر','الاسم','المحافظة','العنوان','رقم الهاتف','القيمة','الحالة','الملاحظات','التاريخ'],...orders.map(o=>[o.order_code,o.store_name||'',o.recipient_name,o.area,o.detailed_address,o.phone,o.amount,DELIVERY_STATUS_LABELS[o.delivery_status||'pending']||o.delivery_status||'',o.order_notes,o.first_print_date||''])];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`corvex-report-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}


async function couriersView(){
  const c=$('#content'),d=await api('/couriers'),cs=d.couriers||[];

  c.innerHTML=`
    <div class="page-title">
      <div><h1>المناديب</h1><div class="sub">تعديل • حذف • نسبة التسليم • تسكير الحساب</div></div>
      <button class="btn btn-accent" onclick="show('courier-add')">＋ إضافة مندوب</button>
    </div>

    <div class="card">
      <h3>قائمة المناديب</h3>
      ${cs.length?cs.map(x=>`
        <div class="courier-card">
          <div>
            <b>${esc(x.name)}</b>
            <span class="delivery-rate">${x.delivery_rate}% تسليم</span>
            <div class="sub">الشحنات ${x.assigned_count||0} • تم التسليم ${x.delivered_count||0} • رفض/رجوع ${x.returned_count||0}</div>
            ${x.phone?`<div class="sub">${esc(x.phone)}</div>`:''}
          </div>
          <div class="courier-actions">
            <button class="btn btn-outline custody-courier" data-id="${x.id}">العهدة</button>
            <button class="btn btn-soft edit-courier" data-id="${x.id}">تعديل</button>
            <button class="btn btn-danger delete-courier" data-id="${x.id}">حذف</button>
            <button class="btn btn-accent settle-courier" data-id="${x.id}">تسكير الحساب</button>
            <button class="btn btn-soft courier-history" data-id="${x.id}">سجل الحساب</button>
          </div>
        </div>`).join(''):'<div class="empty">لا يوجد مناديب</div>'}
    </div>
    <div id="settlementArea"></div>`;

  document.querySelectorAll('.edit-courier').forEach(b=>b.onclick=()=>courierAddView(Number(b.dataset.id)));

  document.querySelectorAll('.delete-courier').forEach(b=>b.onclick=async()=>{
    if(!confirm('حذف المندوب؟ إذا كان لديه طلبات سيتم إيقافه بدل حذف تاريخه.'))return;
    try{
      await api('/couriers/'+b.dataset.id,{method:'DELETE'});
      toast('تم');
      couriersView();
    }catch(e){toast(e.message)}
  });

  document.querySelectorAll('.settle-courier').forEach(b=>b.onclick=()=>{
    openCourierSettlement(Number(b.dataset.id),cs.find(x=>Number(x.id)===Number(b.dataset.id)));
  });
  document.querySelectorAll('.custody-courier').forEach(b=>b.onclick=()=>openCourierCustody(Number(b.dataset.id)));
  document.querySelectorAll('.courier-history').forEach(b=>b.onclick=()=>openCourierHistory(Number(b.dataset.id)));
}


async function openCourierCustody(cid){
  const d=await api('/courier-custody?courier_id='+cid);
  const s=d.summary||{},x=d.courier||{};
  $('#settlementArea').innerHTML=`<div class="card accounting-card"><h2>عهدة المندوب: ${esc(x.name||'')}</h2>
  <div class="accounting-stats">
    <div><span>خرج معه</span><b>${s.assigned_count||0}</b></div>
    <div><span>قيمة الشحنات</span><b>${money(s.assigned_value||0)}</b></div>
    <div><span>تم التسليم</span><b>${s.delivered_count||0}</b></div>
    <div><span>رفض / رجوع</span><b>${s.refused_count||0}</b></div>
    <div><span>باقي معه</span><b>${s.pending_count||0}</b></div>
    <div><span>قيمة الباقي</span><b>${money(s.pending_value||0)}</b></div>
    <div><span>الكاش المحصل</span><b>${money(s.cash_collected||0)}</b></div>
  </div></div>`;
}

async function openCourierHistory(cid){
  const d=await api('/courier-settlements?courier_id='+cid);
  $('#settlementArea').innerHTML=`<div class="card accounting-card"><h2>سجل تسكير حساب المندوب</h2>
  ${(d.settlements||[]).length?d.settlements.map(s=>`<div class="settlement-row"><div><b>${esc(s.settlement_code)}</b><div class="sub">${fmtDate(s.created_at)} • ${s.orders_count} طلب • مستلم ${s.delivered_count} • مرتجع ${s.returned_count}</div></div><strong>${money(s.total_due)} د.أ</strong></div>`).join(''):'<div class="empty">لا يوجد تسويات سابقة</div>'}</div>`;
}

async function courierAddView(editId=0){
  const c=$('#content');
  if(!state.regionGroups?.length) await loadRegionIndex();
  let x=null;

  if(editId){
    try{x=(await api('/couriers/'+editId)).courier}catch(e){toast(e.message);return}
  }

  c.innerHTML=`
    <div class="page-title">
      <div><h1>${editId?'تعديل مندوب':'إضافة مندوب'}</h1><div class="sub">${editId?'تعديل معلومات المندوب':'إضافة مندوب توصيل جديد'}</div></div>
      <button class="btn btn-soft" onclick="show('couriers')">العودة للمناديب</button>
    </div>

    <div class="card standalone-form">
      ${[['cn','اسم المندوب'],['cu','اسم المستخدم'],['ca','العنوان'],['cp','الهاتف'],['cd','عمولة الطلب المستلم'],['cr','عمولة الرفض / المرتجع']].map(a=>`<div class="field"><label>${a[1]}</label><input id="${a[0]}" class="input"></div>`).join('')}

      <div class="field">
        <label>مناطق المندوب</label>
        <select id="car" class="select" multiple size="8">
          ${state.regionGroups.map(g=>`<optgroup label="${esc(g.name)}">${(g.regions||[]).map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </div>

      <div class="field"><label>ملاحظات</label><textarea id="cno" class="textarea"></textarea></div>
      <button id="saveCourier" class="btn btn-primary">${editId?'حفظ التعديل':'إضافة المندوب'}</button>
    </div>`;

  if(x){
    $('#cn').value=x.name||'';
    $('#cu').value=x.username||'';
    $('#ca').value=x.address||'';
    $('#cp').value=x.phone||'';
    $('#cd').value=x.delivered_commission||0;
    $('#cr').value=x.returned_commission||0;
    $('#cno').value=x.notes||'';

    const selected=new Set(String(x.areas||'').split(/[،,]/).map(s=>s.trim()).filter(Boolean));
    [...$('#car').options].forEach(o=>o.selected=selected.has(o.value));
  }

  $('#saveCourier').onclick=async()=>{
    const payload={
      name:$('#cn').value,
      username:$('#cu').value,
      address:$('#ca').value,
      phone:$('#cp').value,
      delivered_commission:$('#cd').value,
      returned_commission:$('#cr').value,
      areas:[...$('#car').selectedOptions].map(o=>o.value).join('، '),
      notes:$('#cno').value
    };

    try{
      await api(editId?'/couriers/'+editId:'/couriers',{
        method:editId?'PUT':'POST',
        body:JSON.stringify(payload)
      });
      toast(editId?'تم تعديل المندوب':'تمت إضافة المندوب');
      show('couriers');
    }catch(e){toast(e.message)}
  };
}
async function openCourierSettlement(cid,courier){
 const d=await api('/courier-eligible-orders?courier_id='+cid),os=d.orders||[],box=$('#settlementArea');
 box.innerHTML=`<div class="card courier-settlement"><h2>تسكير حساب ${esc(courier.name)}</h2>${os.length?`<div class="table-wrap"><table class="table"><thead><tr><th>✓</th><th>الكود</th><th>المتجر</th><th>العميل</th><th>الحالة</th><th>العمولة</th></tr></thead><tbody>${os.map(o=>{const ret=!['delivered','delivered_adjusted'].includes(o.delivery_status),v=ret?Number(courier.returned_commission||0):Number(courier.delivered_commission||0);return `<tr><td><input type="checkbox" class="co" data-id="${o.id}" data-v="${v}" checked></td><td>${o.order_code}</td><td>${esc(o.store_name||'—')}</td><td>${esc(o.recipient_name)}</td><td>${deliveryBadge(o)}</td><td>${money(v)}</td></tr>`}).join('')}</tbody></table></div><div class="courier-total">حق المندوب: <b id="due">0.00</b> د.أ</div><button id="doneSettle" class="btn btn-accent">✓ تم</button>`:'<div class="empty">لا توجد طلبات غير محاسبة</div>'}</div>`;
 if(!os.length)return;const calc=()=>$('#due').textContent=money([...document.querySelectorAll('.co:checked')].reduce((s,x)=>s+Number(x.dataset.v||0),0));document.querySelectorAll('.co').forEach(x=>x.onchange=calc);calc();
 $('#doneSettle').onclick=async()=>{const ids=[...document.querySelectorAll('.co:checked')].map(x=>Number(x.dataset.id));if(!ids.length)return toast('حدد طلبات');try{const r=await api('/courier-settlements',{method:'POST',body:JSON.stringify({courier_id:cid,order_ids:ids})});toast('حق المندوب '+money(r.settlement.total_due)+' د.أ');couriersView()}catch(e){toast(e.message)}};
}


async function regionsView(){
  const c=$('#content');await loadRegionIndex();
  c.innerHTML=`<div class="page-title"><div><h1>المناطق</h1><div class="sub">كل مناطق المملكة — ويمكن الإضافة والتعديل والحذف</div></div></div>
  <div class="card region-add-bar">
    <input id="newGroupName" class="input" placeholder="اسم مجموعة جديدة">
    <input id="newGroupGov" class="input" placeholder="المحافظة التي تُسجل على الطلب">
    <button id="addRegionGroup" class="btn btn-primary">إضافة مجموعة</button>
  </div>
  <div class="region-grid">${state.regionGroups.map(g=>`
    <div class="region-card" data-group="${g.id}">
      <div class="region-card-head"><div><h3>${esc(g.name)}</h3><span>${esc(g.governorate||'')}</span></div><div><button class="btn btn-soft edit-group" data-id="${g.id}">تعديل</button><button class="btn btn-danger del-group" data-id="${g.id}">حذف</button></div></div>
      <div class="region-items">${(g.regions||[]).map(r=>`<div class="region-item"><span>${esc(r.name)}</span><div><button class="mini-btn edit-region" data-id="${r.id}" data-name="${encodeURIComponent(r.name)}">✎</button><button class="mini-btn danger del-region" data-id="${r.id}">×</button></div></div>`).join('')}</div>
      <div class="region-add"><input class="input region-new-name" placeholder="إضافة منطقة"><button class="btn btn-accent add-region" data-group="${g.id}">＋</button></div>
    </div>`).join('')}</div>`;

  $('#addRegionGroup').onclick=async()=>{try{await api('/region-groups',{method:'POST',body:JSON.stringify({name:$('#newGroupName').value,governorate:$('#newGroupGov').value})});await loadRegionIndex(true);regionsView()}catch(e){toast(e.message)}};
  document.querySelectorAll('.add-region').forEach(b=>b.onclick=async()=>{const card=b.closest('.region-card'),inp=card.querySelector('.region-new-name');if(!inp.value.trim())return;try{await api('/regions',{method:'POST',body:JSON.stringify({group_id:b.dataset.group,name:inp.value})});await loadRegionIndex(true);regionsView()}catch(e){toast(e.message)}});
  document.querySelectorAll('.edit-region').forEach(b=>b.onclick=async()=>{const old=decodeURIComponent(b.dataset.name),name=prompt('اسم المنطقة',old);if(!name||name===old)return;try{await api('/regions/'+b.dataset.id,{method:'PUT',body:JSON.stringify({name})});await loadRegionIndex(true);regionsView()}catch(e){toast(e.message)}});
  document.querySelectorAll('.del-region').forEach(b=>b.onclick=async()=>{if(!confirm('حذف المنطقة؟'))return;await api('/regions/'+b.dataset.id,{method:'DELETE'});await loadRegionIndex(true);regionsView()});
  document.querySelectorAll('.edit-group').forEach(b=>b.onclick=async()=>{const g=state.regionGroups.find(x=>Number(x.id)===Number(b.dataset.id));const name=prompt('اسم المجموعة',g.name);if(!name)return;const governorate=prompt('المحافظة التي تسجل على الطلب',g.governorate||g.name);if(governorate===null)return;await api('/region-groups/'+g.id,{method:'PUT',body:JSON.stringify({name,governorate})});await loadRegionIndex(true);regionsView()});
  document.querySelectorAll('.del-group').forEach(b=>b.onclick=async()=>{if(!confirm('حذف المجموعة وكل المناطق بداخلها؟'))return;await api('/region-groups/'+b.dataset.id,{method:'DELETE'});await loadRegionIndex(true);regionsView()});
}

const PERMISSION_LABELS={
 dashboard:'لوحة التحكم',stores:'المتاجر',stores_delete:'حذف متجر',orders_add:'إضافة طلب',orders_view:'عرض الطلبات',orders_edit:'تعديل الطلب',
 orders_delete:'حذف الطلب',orders_status:'تغيير حالة الطلب',couriers:'عرض المناديب',couriers_add:'إضافة مندوب',couriers_edit:'تعديل مندوب',
 couriers_delete:'حذف مندوب',couriers_accounting:'محاسبة / تسكير حساب المناديب',print:'جاهز للطباعة',batches:'دفعات الطباعة',
 reports:'الكشوفات وExcel',profits:'الأرباح اليومية',delivery_reconcile:'تسوية شركة التوصيل',regions:'عرض المناطق',regions_edit:'تعديل المناطق',
 users:'المستخدمون',users_delete:'حذف المستخدمين',permissions:'الصلاحيات',tracking_readonly:'متابعة شركة التوصيل — عرض فقط'
};
async function permissionsView(){
  const c=$('#content'),d=await api('/permissions');
  c.innerHTML=`<div class="page-title"><div><h1>الصلاحيات</h1><div class="sub">صلاحيات المستخدمين والمناديب</div></div></div>
  <div class="permission-layout">
    <div class="card">
      <div class="field"><label>نوع الحساب</label><select id="permType" class="select"><option value="user">مستخدم</option><option value="courier">مندوب</option></select></div>
      <div class="field"><label>الحساب</label><select id="permActor" class="select"></select></div>
      <div id="permChecks" class="permission-grid">${d.all_permissions.map(p=>`<label class="perm-check"><input type="checkbox" value="${p}"><span>${PERMISSION_LABELS[p]||p}</span></label>`).join('')}</div>
      <button id="savePermissions" class="btn btn-primary">حفظ الصلاحيات</button>
    </div>
  </div>`;
  const saved=(type,id)=>{const r=(d.permissions||[]).find(x=>x.actor_type===type&&Number(x.actor_id)===Number(id));try{return r?JSON.parse(r.permissions_json||'[]'):[]}catch{return []}};
  const fillActors=()=>{const type=$('#permType').value,list=type==='user'?d.users:d.couriers;$('#permActor').innerHTML=list.map(x=>`<option value="${x.id}">${esc(x.name||x.display_name||x.username)}</option>`).join('');loadChecks()};
  const loadChecks=()=>{const set=new Set(saved($('#permType').value,$('#permActor').value));document.querySelectorAll('#permChecks input').forEach(x=>x.checked=set.has(x.value))};
  $('#permType').onchange=fillActors;$('#permActor').onchange=loadChecks;fillActors();
  $('#savePermissions').onclick=async()=>{const permissions=[...document.querySelectorAll('#permChecks input:checked')].map(x=>x.value);try{await api('/permissions',{method:'PUT',body:JSON.stringify({actor_type:$('#permType').value,actor_id:$('#permActor').value,permissions})});toast('تم حفظ الصلاحيات');permissionsView()}catch(e){toast(e.message)}};
}

async function storesView(){
  const c=$('#content');
  let d;
  try{d=await api('/stores')}catch(e){toast(e.message);return}
  const stores=(d.stores||[]).filter(s=>Number(s.is_active)!==0);

  c.innerHTML=`
    <div class="page-title">
      <div><h1>المتاجر</h1><div class="sub">اضغط على المتجر لعرض شحناته فقط</div></div>
      <button class="btn btn-accent" onclick="show('store-add')">＋ إضافة متجر</button>
    </div>
    <div class="store-browser">
      ${stores.length?stores.map(s=>`
        <div class="store-browser-card" style="display:block;position:relative">
          <button type="button" data-store-open="${s.id}" style="appearance:none;border:0;background:transparent;width:100%;text-align:inherit;padding:0;color:inherit">
            <div class="store-browser-name">${esc(s.name)}</div>
            <div class="store-browser-meta">${Number(s.orders_count||0)} شحنة${s.phone?' • '+esc(s.phone):''}</div>
            ${s.contact_name?`<div class="store-browser-contact">${esc(s.contact_name)}</div>`:''}
            <div class="store-browser-arrow">عرض الشحنات ←</div>
          </button>
          ${can('stores_delete')&&!isTrackingOnly()?`<button type="button" class="btn btn-danger delete-store-btn" data-store-delete="${s.id}" data-store-name="${encodeURIComponent(s.name||'')}" style="margin-top:10px">حذف المتجر</button>`:''}
        </div>`).join(''):'<div class="empty">لا يوجد متاجر</div>'}
    </div>`;

  document.querySelectorAll('[data-store-open]').forEach(b=>b.onclick=()=>storeShipmentsView(Number(b.dataset.storeOpen)));
  document.querySelectorAll('[data-store-delete]').forEach(b=>b.onclick=async()=>{
    const name=decodeURIComponent(b.dataset.storeName||'');
    if(!confirm(`حذف متجر "${name}"؟ سيتم إخفاؤه مع الاحتفاظ بطلباته القديمة.`))return;
    b.disabled=true;
    try{
      const result=await api('/stores/'+b.dataset.storeDelete,{method:'DELETE'});
      toast(result.archived?'تم إخفاء المتجر وحفظ طلباته القديمة':'تم حذف المتجر');
      storesView();
    }catch(e){b.disabled=false;toast(e.message)}
  });
}

async function storeAddView(){
  const c=$('#content');
  c.innerHTML=`
    <div class="page-title">
      <div><h1>إضافة متجر</h1><div class="sub">إضافة متجر / عميل جديد</div></div>
      <button class="btn btn-soft" onclick="show('stores')">العودة للمتاجر</button>
    </div>
    <div class="card standalone-form">
      <div class="field"><label>اسم المتجر</label><input id="storeName" class="input"></div>
      <div class="field"><label>اسم صاحب المتجر / المسؤول</label><input id="storeContact" class="input"></div>
      <div class="field"><label>رقم الهاتف</label><input id="storePhone" class="input" inputmode="tel"></div>
      <div class="field"><label>ملاحظات</label><textarea id="storeNotes" class="textarea"></textarea></div>
      <button id="addStore" class="btn btn-primary">إضافة المتجر</button>
    </div>`;

  $('#addStore').onclick=async()=>{
    try{
      await api('/stores',{method:'POST',body:JSON.stringify({
        name:$('#storeName').value,
        contact_name:$('#storeContact').value,
        phone:$('#storePhone').value,
        notes:$('#storeNotes').value
      })});
      toast('تمت إضافة المتجر');
      show('stores');
    }catch(e){toast(e.message)}
  };
}

async function storeShipmentsView(storeId){
  const c=$('#content');
  const sd=await api('/stores');
  const store=(sd.stores||[]).find(s=>Number(s.id)===Number(storeId))||{name:'المتجر'};

  c.innerHTML=`
    <div class="page-title">
      <div><h1>شحنات ${esc(store.name)}</h1><div class="sub">كل شحنات هذا المتجر فقط</div></div>
      <div class="actions" style="margin:0"><button id="storeAccountBtn" class="btn btn-accent">حساب المتجر</button><button class="btn btn-soft" onclick="show('stores')">العودة للمتاجر</button></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <input id="storeShipmentQ" class="input" placeholder="كود / هاتف / اسم">
        <button id="storeShipmentSearch" class="btn btn-primary">بحث وخيارات</button>
      </div>
      <div id="storeShipmentFilters" class="card hidden" style="margin:0 0 14px;padding:14px">
        <div class="toolbar" style="margin:0">
          <details id="storeShipmentStatusPicker" style="position:relative">
            <summary class="btn btn-soft" style="list-style:none;white-space:nowrap">حالات الطلب: <span id="storeShipmentStatusCount">الكل</span></summary>
            <div class="card" style="position:absolute;z-index:20;top:calc(100% + 6px);right:0;width:245px;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.18)">
              <label class="perm-check"><input class="store-shipment-status-check" type="checkbox" value="pending"><span>قيد التوصيل</span></label>
              <label class="perm-check"><input class="store-shipment-status-check" type="checkbox" value="delivered"><span>تم التسليم</span></label>
              <label class="perm-check"><input class="store-shipment-status-check" type="checkbox" value="delivered_adjusted"><span>تم التسليم وتعديل قيمة</span></label>
              <label class="perm-check"><input class="store-shipment-status-check" type="checkbox" value="refused_fee_paid"><span>رفض ودفع أجور</span></label>
              <label class="perm-check"><input class="store-shipment-status-check" type="checkbox" value="refused_no_fee"><span>رفض وعدم دفع أجور</span></label>
            </div>
          </details>
          <select id="storeShipmentPrinted" class="select">
            <option value="">كل حالات الطباعة</option>
            <option value="1">مطبوع</option>
            <option value="0">غير مطبوع</option>
          </select>
          <button id="storeShipmentApply" class="btn btn-accent">عرض النتائج</button>
        </div>
      </div>
      <div class="actions no-print" style="margin:0 0 14px;align-items:center">
        <span id="storeShipmentCount" class="pill" style="background:#e9eff4;color:#102a43">0 طلب</span>
        <button id="storeShipmentSelectAll" class="btn btn-soft">تحديد الكل</button>
        <select id="storeBulkStatus" class="select" style="min-width:190px">
          <option value="">اختر نتيجة المحدد...</option>
          <option value="delivered">تم التسليم</option>
          <option value="delivered_adjusted">تم التسليم وتعديل قيمة</option>
          <option value="partial">استلام جزئي</option>
          <option value="refused_fee_paid">رفض ودفع أجور</option>
          <option value="refused_no_fee">رفض وعدم دفع أجور</option>
          <option value="canceled_before_arrival">ملغي قبل الوصول</option>
          <option value="pending">قيد التوصيل</option>
        </select>
        <button id="storeBulkStatusApply" class="btn btn-primary">تسكير الطلبات المحددة</button>
        <button id="storeShipmentPrintSelected" class="btn btn-accent">طباعة المحدد معًا</button>
      </div>
      <div id="storeShipmentsTable"></div><div id="storeAccountingArea"></div>
    </div>`;

  $('#storeAccountBtn').onclick=()=>openStoreAccount(storeId,store);

  const load=async()=>{
    const p=new URLSearchParams({store_id:String(storeId)});
    if($('#storeShipmentQ').value)p.set('q',$('#storeShipmentQ').value);
    const statuses=[...document.querySelectorAll('.store-shipment-status-check:checked')].map(x=>x.value);
    if(statuses.length)p.set('statuses',statuses.join(','));
    if($('#storeShipmentPrinted')?.value!=='')p.set('printed',$('#storeShipmentPrinted').value);
    const d=await api('/orders?'+p.toString());
    const orders=d.orders||[];
    $('#storeShipmentCount').textContent=orders.length+' طلب';
    renderOrdersTable('#storeShipmentsTable',orders,true);
  };

  $('#storeShipmentSearch').onclick=()=>{
    $('#storeShipmentFilters').classList.toggle('hidden');
    if(!$('#storeShipmentFilters').classList.contains('hidden'))document.querySelector('.store-shipment-status-check')?.focus();
  };
  document.querySelectorAll('.store-shipment-status-check').forEach(x=>x.onchange=()=>{
    const count=document.querySelectorAll('.store-shipment-status-check:checked').length;
    $('#storeShipmentStatusCount').textContent=count?String(count):'الكل';
  });
  $('#storeShipmentApply').onclick=load;
  $('#storeShipmentQ').onkeydown=e=>{if(e.key==='Enter')load()};
  $('#storeShipmentSelectAll').onclick=()=>{
    const boxes=[...document.querySelectorAll('#storeShipmentsTable .rowcheck')];
    const shouldCheck=boxes.some(x=>!x.checked);
    boxes.forEach(x=>x.checked=shouldCheck);
    const all=$('#storeShipmentsTable #allcheck');
    if(all)all.checked=shouldCheck;
  };
  $('#storeBulkStatusApply').onclick=async()=>{
    const ids=[...document.querySelectorAll('#storeShipmentsTable .rowcheck:checked')].map(x=>Number(x.dataset.id));
    const status=$('#storeBulkStatus').value;
    if(!ids.length)return toast('حدد طلباً واحداً على الأقل');
    if(!status)return toast('اختر نتيجة الطلبات');
    if(!confirm(`تغيير حالة ${ids.length} طلب إلى "${DELIVERY_STATUS_LABELS[status]}"؟`))return;
    try{
      const r=await api('/orders/bulk-status',{method:'PUT',body:JSON.stringify({order_ids:ids,delivery_status:status})});
      toast(`تم تحديث ${r.updated||ids.length} طلب`);
      await load();
    }catch(e){toast(e.message)}
  };
  $('#storeShipmentPrintSelected').onclick=async()=>{
    const ids=[...document.querySelectorAll('#storeShipmentsTable .rowcheck:checked')].map(x=>Number(x.dataset.id));
    if(!ids.length)return toast('حدد طلباً واحداً على الأقل');
    try{
      const r=await api('/print-batches',{method:'POST',body:JSON.stringify({order_ids:ids})});
      openPrintWindow(r.orders,`دفعة ${r.batch.store_name||''} - ${r.batch.batch_code}`);
      toast(`تم تجهيز ${r.batch.order_count} طلب للطباعة`);
      setTimeout(load,600);
    }catch(e){toast(e.message)}
  };
  await load();
}


async function openStoreAccount(storeId,store){
  const [a,e,h]=await Promise.all([
    api('/store-account?store_id='+storeId),
    api('/store-settlement-eligible?store_id='+storeId),
    api('/store-settlements?store_id='+storeId)
  ]);

  const s=a.summary||{},orders=e.orders||[];

  $('#storeAccountingArea').innerHTML=`<div class="card accounting-card">
    <h2>حساب متجر ${esc(store.name||'')}</h2>

    <div class="accounting-stats">
      <div><span>خرج</span><b>${s.outgoing_count||0}</b></div>
      <div><span>تم التسليم</span><b>${s.delivered_count||0}</b></div>
      <div><span>رفض / رجوع</span><b>${s.refused_count||0}</b></div>
      <div><span>قيد التوصيل</span><b>${s.pending_count||0}</b></div>
      <div><span>المبلغ المحصل</span><b>${money(s.collected_amount||0)}</b></div>
      <div><span>أجور التوصيل</span><b>${money(s.delivery_fees||0)}</b></div>
    </div>

    <h3>طلبات جاهزة لتسكير الحساب</h3>
    ${orders.length?`
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>✓</th><th>الكود</th><th>الحالة</th><th>الكاش</th></tr></thead>
          <tbody>${orders.map(o=>`<tr>
            <td><input type="checkbox" class="store-settle-check" data-id="${o.id}" checked></td>
            <td>${o.order_code}</td>
            <td>${deliveryBadge(o)}</td>
            <td>${money(o.cash_collected||0)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <button id="settleStoreDone" class="btn btn-accent">تسكير حساب المحدد</button>
    `:'<div class="empty">لا توجد طلبات غير محاسبة</div>'}

    <h3 style="margin-top:20px">سجل تسويات المتجر</h3>
    ${(h.settlements||[]).length?h.settlements.map(x=>`
      <div class="settlement-row">
        <div><b>${esc(x.settlement_code)}</b><div class="sub">${fmtDate(x.created_at)} • ${x.orders_count} طلب</div></div>
        <strong>${money(x.store_due)} د.أ</strong>
      </div>`).join(''):'<div class="empty">لا يوجد تسويات سابقة</div>'}
  </div>`;

  if($('#settleStoreDone')){
    $('#settleStoreDone').onclick=async()=>{
      const ids=[...document.querySelectorAll('.store-settle-check:checked')].map(x=>Number(x.dataset.id));
      if(!ids.length)return toast('حدد طلباً واحداً على الأقل');
      try{
        const r=await api('/store-settlements',{method:'POST',body:JSON.stringify({store_id:storeId,order_ids:ids})});
        toast('تم تسكير حساب المتجر: '+money(r.settlement.store_due)+' د.أ');
        openStoreAccount(storeId,store);
      }catch(err){toast(err.message)}
    };
  }
}

async function storeOrdersHub(){
  const c=$('#content');
  const d=await api('/stores');
  c.innerHTML=`
    <div class="page-title"><div><h1>طلبات المتاجر</h1><div class="sub">اختر المتجر لفتح طلباته</div></div></div>
    <div class="store-browser">
      ${(d.stores||[]).length?(d.stores||[]).map(s=>`
        <button class="store-browser-card" data-store-orders="${s.id}">
          <div class="store-browser-name">${esc(s.name)}</div>
          <div class="store-browser-meta">${Number(s.orders_count||0)} طلب</div>
          <div class="store-browser-arrow">فتح الطلبات ←</div>
        </button>`).join(''):'<div class="empty">لا يوجد متاجر</div>'}
    </div>`;

  document.querySelectorAll('[data-store-orders]').forEach(b=>b.onclick=()=>storeShipmentsView(Number(b.dataset.storeOrders)));
}
async function usersView(){
  const c=$('#content');
  c.innerHTML='<div class="empty">جاري تحميل المستخدمين...</div>';
  let d;
  try{d=await api('/users')}
  catch(e){
    c.innerHTML=`<div class="card"><div class="empty">${esc(e.message)}</div><button id="retryUsers" class="btn btn-primary">إعادة المحاولة</button></div>`;
    $('#retryUsers').onclick=usersView;
    return;
  }

  c.innerHTML=`
    <div class="page-title">
      <div>
        <h1>المستخدمون</h1>
        <div class="sub">إضافة وتعديل حسابات الموظفين والمدراء</div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <h3>إضافة مستخدم</h3>
        <div class="field"><label>الاسم الظاهر</label><input id="ud" class="input"></div><br>
        <div class="field"><label>اسم المستخدم</label><input id="uu" class="input"></div><br>
        <div class="field"><label>كلمة المرور</label><input id="up" type="password" class="input"></div><br>
        <div class="field"><label>الصلاحية</label>
          <select id="ur" class="select">
            <option value="staff">موظف</option>
            <option value="admin">مدير</option>
          </select>
        </div>
        <button id="addUser" class="btn btn-primary" style="margin-top:15px">إضافة</button>
      </div>

      <div class="card">
        <h3>الحسابات</h3>
        ${d.users.map(u=>`
          <div class="batch-card" style="gap:10px;display:block">
            <div>
              <b style="display:block;font-size:19px;margin-bottom:7px">${esc(u.display_name)}</b>
              <div class="batch-meta" style="white-space:normal;overflow-wrap:anywhere">
                اسم المستخدم: <strong dir="ltr" style="display:inline-block;color:#102a43">@${esc(u.username)}</strong>
              </div>
              <div class="batch-meta" style="margin-top:4px">الصلاحية: ${u.role==='admin'?'مدير':'موظف'}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
              <span class="badge ${u.is_active?'badge-ok':'badge-warn'}">${u.is_active?'فعال':'موقوف'}</span>
              <button type="button" class="btn btn-soft edit-user-btn"
                data-user-id="${u.id}"
                data-display-name="${encodeURIComponent(u.display_name||'')}"
                data-username="${encodeURIComponent(u.username||'')}"
                data-role="${u.role||'staff'}"
                data-active="${Number(u.is_active||0)}">تعديل</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;

  $('#addUser').onclick=async()=>{
    try{
      await api('/users',{
        method:'POST',
        body:JSON.stringify({
          display_name:$('#ud').value,
          username:$('#uu').value,
          password:$('#up').value,
          role:$('#ur').value
        })
      });
      toast('تمت إضافة المستخدم');
      usersView();
    }catch(e){toast(e.message)}
  };

  document.querySelectorAll('.edit-user-btn').forEach(btn=>{
    btn.onclick=()=>openUserEdit({
      id:Number(btn.dataset.userId),
      display_name:decodeURIComponent(btn.dataset.displayName||''),
      username:decodeURIComponent(btn.dataset.username||''),
      role:btn.dataset.role||'staff',
      is_active:Number(btn.dataset.active||0)
    });
  });
}

function openUserEdit(user){
  const old=document.querySelector('.modal-backdrop');
  if(old) old.remove();

  const overlay=document.createElement('div');
  overlay.className='modal-backdrop';
  overlay.innerHTML=`
    <div class="modal-card" dir="rtl">
      <div class="modal-head">
        <h3>تعديل المستخدم</h3>
        <button type="button" class="btn btn-soft user-edit-close">✕</button>
      </div>

      <div class="outcome-form">
        <div class="field">
          <label>الاسم الظاهر</label>
          <input id="editUserDisplay" class="input" value="${esc(user.display_name)}">
        </div>

        <div class="field">
          <label>اسم المستخدم</label>
          <input id="editUserUsername" class="input" value="${esc(user.username)}">
        </div>

        <div class="field">
          <label>كلمة مرور جديدة</label>
          <input id="editUserPassword" type="password" class="input" placeholder="اتركها فارغة لعدم تغييرها">
        </div>

        <div class="field">
          <label>الصلاحية</label>
          <select id="editUserRole" class="select">
            <option value="staff" ${user.role==='staff'?'selected':''}>موظف</option>
            <option value="admin" ${user.role==='admin'?'selected':''}>مدير</option>
          </select>
        </div>

        <div class="field">
          <label>حالة الحساب</label>
          <select id="editUserActive" class="select">
            <option value="1" ${user.is_active===1?'selected':''}>فعال</option>
            <option value="0" ${user.is_active===0?'selected':''}>موقوف</option>
          </select>
        </div>
      </div>

      <div class="actions" style="margin-top:16px">
        <button type="button" id="saveUserEdit" class="btn btn-primary">حفظ التعديل</button>
        <button type="button" class="btn btn-soft user-edit-close">إلغاء</button>
        ${can('users_delete')&&Number(state.user?.id)!==Number(user.id)?'<button type="button" id="deleteUserEdit" class="btn btn-danger">حذف المستخدم</button>':''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');

  const close=()=>{
    overlay.remove();
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
  };
  overlay.onclick=e=>{if(e.target===overlay)close()};
  overlay.querySelectorAll('.user-edit-close').forEach(x=>x.onclick=close);

  const deleteUserBtn=$('#deleteUserEdit');
  if(deleteUserBtn)deleteUserBtn.onclick=async()=>{
    if(!confirm('حذف هذا المستخدم نهائيًا من قائمة الحسابات؟'))return;
    deleteUserBtn.disabled=true;
    try{
      await api('/users/'+user.id,{method:'DELETE'});
      toast('تم حذف المستخدم');
      close();
      usersView();
    }catch(e){deleteUserBtn.disabled=false;toast(e.message)}
  };

  $('#saveUserEdit').onclick=async()=>{
    const btn=$('#saveUserEdit');
    btn.disabled=true;
    btn.textContent='جاري الحفظ...';
    try{
      await api('/users/'+user.id,{
        method:'PUT',
        body:JSON.stringify({
          display_name:$('#editUserDisplay').value,
          username:$('#editUserUsername').value,
          password:$('#editUserPassword').value,
          role:$('#editUserRole').value,
          is_active:Number($('#editUserActive').value)
        })
      });
      toast('تم تعديل المستخدم');
      close();
      usersView();
    }catch(e){
      btn.disabled=false;
      btn.textContent='حفظ التعديل';
      toast(e.message);
    }
  };
}
boot();
