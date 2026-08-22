const state={token:localStorage.getItem('corvex_token')||'',user:null,view:'dashboard',orders:[],selected:new Set(),stats:{},batches:[],regionGroups:[],dynamicPlaceToGov:new Map(),dynamicPlaces:[]};
const $=s=>document.querySelector(s);const app=$('#app');
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2400)}
async function api(path,opts={}){const headers={'content-type':'application/json',...(opts.headers||{})};if(state.token)headers.authorization=`Bearer ${state.token}`;const r=await fetch('/api'+path,{...opts,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'حدث خطأ');return d}

function can(p){
  return state.user?.role==='admin'||(state.user?.permissions||[]).includes(p);
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
فاطمة مريم سارة هبة اية لين ليان لجين جنى جود رنا رانيا ريهام ريم روان رولا ربى زينب زينة زهراء سمر سما سمية سناء سوسن شذى شهد شيماء صفاء ضحى عبير عائشة علا غدير فرح كندة لمى لانا لارا ليلى لينا ميس نادين نسرين نهى هناء هيا يارا ياسمين تالا تيا حلا حنان خلود دانا دعاء ديمة راما رند ريتال بيان بسمة بشرى اسراء ايمان امل ابتسام
`.trim().split(/\s+/).map(normalizeArabic));

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
  'بجانب','جنب','قرب','مقابل','خلف','امام','شارع','دوار','حي','حاره','اشاره',
  'مسجد','مدرسه','جامعه','مجمع','سوق','مخيم','اسكان','عماره','بنايه','صيدليه',
  'مستشفى','مول','فرع','السابع','الثامن','السادس','الرابع','الثالث','الاول'
].map(normalizeArabic);

const PRODUCT_WORDS = [
  'قطعه','قطع','قطعتين','بلايز','بلوز','بلوزه','تيشيرت','تيشيرتات','تشيرت','بولو',
  'تريننغ','طقم','اطقم','بنطلون','بناطيل','شورت','بيجاما','جاكيت','هودي','قميص',
  'فستان','عبايه','تنوره','جينز','رياضه','سحاب','ريبوك','نايك','اديداس','بوما','زارا'
].map(normalizeArabic);

const DETAIL_WORDS = [
  'وزن','الوزن','وزني','مقاس','المقاس','قياس','لون','اللون','الوان',
  'اسود','ابيض','اخضر','ازرق','احمر','زهري','وردي','رمادي','رصاصي','سكني',
  'كحلي','بني','بيج','xl','xxl','xxxl','xxxxl','ميديوم','سمول','لارج'
].map(normalizeArabic);

const PRICE_WORDS = [
  'شامل التوصيل','مع التوصيل','السعر','سعر','المجموع','دينار','د.ا','jd','jod'
].map(normalizeArabic);

function containsAny(n, words){
  return words.some(w => n.includes(w));
}

function phonesFrom(line){
  const c = normalizeDigits(line).replace(/[\s-]/g,'');
  const matches = c.match(/(?:\+?962|0)?7[789]\d{7}/g) || [];
  return [...new Set(matches)];
}

function phoneFrom(line){
  return phonesFrom(line)[0] || '';
}

function isPriceLine(line){
  const raw = normalizeDigits(line);
  const n = normalizeArabic(raw);
  return /\d/.test(raw) && containsAny(n, PRICE_WORDS);
}

function priceFrom(line){
  if(!isPriceLine(line)) return '';
  const nums = normalizeDigits(line).match(/\d+(?:\.\d+)?/g) || [];
  return nums.length ? nums[nums.length - 1] : '';
}

function findBestPlace(line){
  const n=normalizeArabic(line);
  const matches=[];
  const dyn=state.dynamicPlaces||[];
  for(const p of dyn){
    if(n.includes(p)){
      const gov=state.dynamicPlaceToGov.get(p)||'';
      matches.push({place:p,governorate:gov,words:p.split(/\s+/).length,chars:p.length,isGovernorateName:p===normalizeArabic(gov)});
    }
  }
  for(const p of JORDAN_PLACES){
    if(n.includes(p)){
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

function isLikelyName(line, index){
  if(!/[\u0600-\u06FF]/.test(String(line))) return false;
  if(/\d/.test(normalizeDigits(line))) return false;
  if(phoneFrom(line)) return false;
  if(isPriceLine(line)) return false;
  if(isLikelyProductOrDetail(line)) return false;
  if(findBestPlace(line)) return false;

  const n = normalizeArabic(line);
  const ws = n.split(/\s+/).filter(Boolean);
  if(ws.length < 1 || ws.length > 4) return false;

  if(ws[0] === 'ابو' || ws[0] === 'ام') return true;
  if(COMMON_NAMES.has(ws[0])) return true;

  // إذا أول سطر عربي قصير وليس مكان/منتج نعتبره اسمًا
  if(index === 0 && ws.length <= 3) return true;

  return false;
}

function classifyNoteLine(line){
  const n = normalizeArabic(line);

  if(isPriceLine(line)){
    return {label:'السعر', value:String(line).trim()};
  }

  if(/وزن|الوزن|وزني/.test(n)){
    return {label:'الوزن', value:String(line).trim()};
  }

  if(/مقاس|المقاس|قياس|\b(?:s|m|l|xl|xxl|xxxl|xxxxl)\b/i.test(String(line))){
    return {label:'المقاس', value:String(line).trim()};
  }

  if(/لون|اللون|الوان|اسود|ابيض|اخضر|ازرق|احمر|زهري|وردي|رمادي|رصاصي|سكني|كحلي|بني|بيج/.test(n)){
    return {label:'اللون', value:String(line).trim()};
  }

  if(containsAny(n, PRODUCT_WORDS) || /^\s*\d+\s+/.test(String(line))){
    return {label:'الطلب', value:String(line).trim()};
  }

  return {label:'ملاحظة', value:String(line).trim()};
}

function parseSmart(text){
  const lines = String(text||'')
    .split(/\n+/)
    .map(x=>x.trim())
    .filter(Boolean);

  const used = new Set();

  let name = '';
  let phone = '';
  let extraPhones = [];
  let area = '';
  let address = '';
  let amount = '';

  // 1) الهواتف
  const allPhones = [];

  for(let i=0;i<lines.length;i++){
    const ps = phonesFrom(lines[i]);

    if(ps.length){
      for(const p of ps){
        if(!allPhones.includes(p)){
          allPhones.push(p);
        }
      }

      used.add(i);
    }
  }

  if(allPhones.length){
    phone = allPhones[0];
    extraPhones = allPhones.slice(1);
  }

  // 2) السعر - فقط من سطر سعر صريح
  for(let i=lines.length-1;i>=0;i--){
    if(isPriceLine(lines[i])){
      amount = priceFrom(lines[i]);
      break;
    }
  }

  // 3) الاسم
  for(let i=0;i<lines.length;i++){
    if(used.has(i)) continue;

    if(isLikelyName(lines[i], i)){
      name = lines[i];
      used.add(i);
      break;
    }
  }

  if(!name){
    name = 'لا يوجد';
  }

  // 4) المحافظة والعنوان - نفحص كل سطر قبل أي تصنيف منتجات
  for(let i=0;i<lines.length;i++){
    if(used.has(i)) continue;
    if(isPriceLine(lines[i])) continue;

    const pa = splitAreaAddress(lines[i]);

    if(pa.area){
      area = pa.area;
      address = pa.address;
      used.add(i);
      break;
    }
  }

  // 5) سطور عنوان إضافية واضحة
  const extraAddress = [];

  for(let i=0;i<lines.length;i++){
    if(used.has(i)) continue;
    if(isPriceLine(lines[i])) continue;

    const n = normalizeArabic(lines[i]);

    if(containsAny(n, ADDRESS_WORDS) && !isLikelyProductOrDetail(lines[i])){
      extraAddress.push(lines[i]);
      used.add(i);
    }
  }

  address = [address, ...extraAddress]
    .filter(Boolean)
    .join(' - ');

  // 6) الملاحظات المرتبة
  const noteRows = [];

  if(phone){
    noteRows.push(`الهاتف: ${phone}`);
  }

  extraPhones.forEach((p,idx)=>{
    noteRows.push(
      `${idx===0 ? 'هاتف إضافي' : 'هاتف إضافي '+(idx+1)}: ${p}`
    );
  });

  for(let i=0;i<lines.length;i++){
    const line = lines[i];

    // لا نكرر أسطر الهاتف
    if(phoneFrom(line)) continue;

    // لا نكرر الاسم المعروف
    if(name !== 'لا يوجد' && line === name) continue;

    // لا نكرر سطر العنوان/المحافظة
    const pa = splitAreaAddress(line);
    if(pa.area) continue;

    // لا نكرر سطر عنوان إضافي التقطناه
    if(used.has(i) && containsAny(normalizeArabic(line), ADDRESS_WORDS)){
      continue;
    }

    const n = normalizeArabic(line);

    // تعليمات مهمة مثل الاستلام/الاتصال/التوصيل تبقى كملاحظة
    if(/استلام|توصيل|اتصال|اتصل|يرجى|ملاحظه|ملاحظة|ضروري|موعد/.test(n)){
      if(isPriceLine(line)){
        noteRows.push(`السعر: ${String(line).trim()}`);
      }else{
        noteRows.push(`ملاحظة: ${String(line).trim()}`);
      }
      continue;
    }

    const item = classifyNoteLine(line);
    noteRows.push(`${item.label}: ${item.value}`);
  }

  const notes = noteRows.join('\n');

  return {
    name,
    phone,
    area,
    address,
    amount,
    notes
  };
}
async function boot(){
  try{const setup=await api('/setup');if(setup.needs_setup){renderSetup();return}}catch{}
  if(!state.token){renderLogin();return}
  try{
    const me=await api('/me');
    state.user=me.user;
    if(state.user?.role==='admin' && localStorage.getItem('corvex_schema_v27')!=='1'){
      try{await api('/migrate',{method:'POST'});localStorage.setItem('corvex_schema_v27','1')}catch{}
    }
    renderShell();
    await show('dashboard')
  }catch{localStorage.removeItem('corvex_token');state.token='';renderLogin()}
}
function renderLogin(){app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-brand"><div class="logo-mark">C</div><h1>CORVEX SPORT</h1><p>نظام إدارة وطباعة الطلبات</p></div><div class="field"><label>اسم المستخدم</label><input id="lu" class="input"></div><br><div class="field"><label>كلمة المرور</label><input id="lp" type="password" class="input"></div><button id="loginBtn" class="btn btn-primary" style="width:100%;margin-top:18px">تسجيل الدخول</button></div></div>`;$('#loginBtn').onclick=async()=>{try{const d=await api('/login',{method:'POST',body:JSON.stringify({username:$('#lu').value,password:$('#lp').value})});state.token=d.token;state.user=d.user;localStorage.setItem('corvex_token',state.token);
    if(state.user?.role==='admin' && localStorage.getItem('corvex_schema_v27')!=='1'){
      try{await api('/migrate',{method:'POST'});localStorage.setItem('corvex_schema_v27','1')}catch{}
    }
    renderShell();show('dashboard')}catch(e){toast(e.message)}}}
function renderSetup(){app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-brand"><div class="logo-mark">C</div><h1>تهيئة CORVEX SPORT</h1><p>أنشئ أول حساب مدير</p></div><div class="field"><label>الاسم الظاهر</label><input id="sd" class="input" value="Admin"></div><br><div class="field"><label>اسم المستخدم</label><input id="su" class="input" value="admin"></div><br><div class="field"><label>كلمة المرور</label><input id="sp" type="password" class="input"></div><button id="setupBtn" class="btn btn-accent" style="width:100%;margin-top:18px">إنشاء النظام</button></div></div>`;$('#setupBtn').onclick=async()=>{try{await api('/setup',{method:'POST',body:JSON.stringify({display_name:$('#sd').value,username:$('#su').value,password:$('#sp').value})});toast('تمت التهيئة');renderLogin()}catch(e){toast(e.message)}}}
function renderShell(){
  app.innerHTML=`<div class="shell">
    <header class="topbar">
      <button id="mobileMenuBtn" class="mobile-menu-btn" aria-label="القائمة">☰</button>
      <div class="logo"><div class="logo-mark">C</div><div>CORVEX SPORT<small>ORDER DESK</small></div></div>
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
              ${can('orders_view')?'<button data-view="store-orders">طلبات المتاجر</button>':''}
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
          ${can('reports')?'<button data-view="reports">▦ الكشوفات وExcel</button>':''}
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

  $('#logout').onclick=async()=>{
    try{await api('/logout',{method:'POST'})}catch{}
    localStorage.removeItem('corvex_token');
    state.token='';
    state.user=null;
    renderLogin();
  };
}
async function show(v){
  state.view=v;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  if(v==='dashboard')return dashboard();
  if(v==='new')return newOrder();
  if(v==='orders')return ordersView();
  if(v==='store-orders')return storeOrdersHub();
  if(v==='print')return printView();
  if(v==='batches')return batchesView();
  if(v==='reports')return reportsView();
  if(v==='stores')return storesView();
  if(v==='store-add')return storeAddView();
  if(v==='couriers')return couriersView();
  if(v==='courier-add')return courierAddView();
  if(v==='regions')return regionsView();
  if(v==='permissions')return permissionsView();
  if(v==='users')return usersView();
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

  c.innerHTML=`<div class="page-title"><div><h1>إضافة طلب</h1><div class="sub">الصق الطلب كامل أو عبّئ الحقول يدويًا</div></div></div>
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

      <div class="field"><label>رقم الهاتف</label><input id="phone" class="input" inputmode="tel" placeholder="07xxxxxxxx"></div>
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

  $('#raw').addEventListener('input',refreshCourier);
  $('#area').addEventListener('input',refreshCourier);
  $('#address').addEventListener('input',refreshCourier);
  $('#clearRaw').onclick=()=>{$('#raw').value='';refreshCourier()};
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
          phone:$('#phone').value,
          area:$('#area').value,
          detailed_address:$('#address').value,
          amount:$('#amount').value,
          order_notes:$('#notes').value,
          raw_text:$('#raw').value
        })
      });

      toast(`تم حفظ الطلب رقم ${d.order.order_code}`);
      if(next)newOrder();else show('orders');
    }catch(e){toast(e.message)}
  }

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
            <input id="editPhone" class="input" inputmode="tel" value="${esc(o.phone||'')}">
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
            <input id="editDeliveryFee" class="input fixed-fee" value="2" readonly>
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
            phone:$('#editPhone').value,
            area:$('#editArea').value,
            detailed_address:$('#editAddress').value,
            amount:$('#editAmount').value,
            order_notes:$('#editNotes').value
          })
        });

        await api('/orders/'+id+'/outcome',{
          method:'PUT',
          body:JSON.stringify({
            delivery_status:$('#editStatus').value,
            delivered_amount:$('#editDeliveredAmount').value,
            delivery_fee:2,
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
          <option value="delivered">تم الاستلام</option>
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
  delivered:'تم الاستلام',
  delivered_adjusted:'تم الاستلام وتعديل قيمة',
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
          <label>القيمة المسلّمة فعليًا</label>
          <input id="outDeliveredAmount" class="input" inputmode="decimal" value="${Number(o.delivered_amount||o.amount||0)}">
        </div>

        <div class="field">
          <label>أجور التوصيل</label>
          <div class="fixed-fee-wrap">
            <input id="outDeliveryFee" class="input fixed-fee" value="2" readonly>
            
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

      <div class="settlement-preview">
        الربح المتوقع: <b id="profitPreview">0.00</b> د.أ
      </div>

      <div class="actions outcome-actions">
        <button type="button" id="saveOutcome" class="btn btn-accent">حفظ النتيجة</button>
        <button type="button" class="btn btn-soft outcome-close">إلغاء</button>
      </div>
    `;

    card.querySelectorAll('.outcome-close').forEach(x=>x.onclick=close);

    const calc=()=>{
      const cash=Number(card.querySelector('#outCash').value||0);
      const cost=Number(card.querySelector('#outCost').value||0);
      card.querySelector('#profitPreview').textContent=money(cash-cost);
    };

    const syncDefaultCash=()=>{
      const status=card.querySelector('#outStatus').value;
      const amount=Number(card.querySelector('#outDeliveredAmount').value||0);
      const cashInput=card.querySelector('#outCash');
      const existing=Number(o.cash_collected||0);
      if(existing===0 && ['delivered','delivered_adjusted'].includes(status)){
        cashInput.value=Math.max(0, amount-2);
      }
      calc();
    };
    card.querySelector('#outCash').oninput=calc;
    card.querySelector('#outCost').oninput=calc;
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

function renderOrdersTable(sel,orders,selectable=true){const el=$(sel);if(!orders.length){el.innerHTML='<div class="empty">لا توجد طلبات</div>';return}el.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr>${selectable?'<th><input id="allcheck" class="check" type="checkbox"></th>':''}<th>الكود</th><th>المتجر</th><th>الاسم</th><th>الهاتف</th><th>المحافظة / العنوان</th><th>القيمة</th><th>الملاحظات</th><th>الموظف</th><th>الحالة</th><th>النتيجة</th><th>الطباعة</th><th>التاريخ</th></tr></thead><tbody>${orders.map(o=>`<tr>${selectable?`<td><input class="rowcheck check" type="checkbox" data-id="${o.id}"></td>`:''}<td class="code"><button type="button" class="order-code-link" data-edit-order="${o.id}">${o.order_code}</button></td><td><b>${esc(o.store_name||'—')}</b></td><td>${esc(o.recipient_name)}</td><td>${esc(o.phone)}</td><td class="address-cell"><button type="button" class="address-preview" data-address="${encodeURIComponent([o.area,o.detailed_address].filter(Boolean).join(' - '))}" aria-label="عرض العنوان كامل">${esc(o.area||'—')}<span class="address-short">${o.detailed_address?` • ${esc(String(o.detailed_address).replace(/\s+/g,' ').trim())}`:''}</span></button></td><td>${money(o.amount)}</td><td class="notes-cell"><button type="button" class="notes-preview" data-notes="${encodeURIComponent(o.order_notes||'')}" aria-label="عرض الملاحظات كاملة">${esc((o.order_notes||'').replace(/\s+/g,' ').trim()||'—')}</button></td><td>${esc(o.created_by_name||'')}</td><td>${deliveryBadge(o)}</td><td><button class="btn btn-soft outcome-btn" data-order-id="${o.id}">تحديث النتيجة</button><div class="sub" style="margin-top:4px">كاش ${money(o.cash_collected||0)} • ربح ${money((o.cash_collected||0)-(o.cost_of_goods||0))}</div></td><td>${o.printed?'<span class="badge badge-ok">مطبوع</span>':'<span class="badge badge-warn">غير مطبوع</span>'}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('')}</tbody></table></div>`;document.querySelectorAll('.order-code-link').forEach(btn=>{btn.onclick=()=>editOrder(Number(btn.dataset.editOrder));});
  document.querySelectorAll('.outcome-btn').forEach(btn=>{btn.onclick=()=>openOutcome(Number(btn.dataset.orderId));});

  let infoPopover=document.querySelector('#infoPopover');
  if(!infoPopover){
    infoPopover=document.createElement('div');
    infoPopover.id='infoPopover';
    infoPopover.className='notes-popover';
    document.body.appendChild(infoPopover);
  }

  const hideInfoPopover=()=>{
    infoPopover.classList.remove('show');
    document.querySelectorAll('.notes-preview.open,.address-preview.open').forEach(x=>x.classList.remove('open'));
  };

  const bindInfoPreview=(selector,dataKey)=>{
    document.querySelectorAll(selector).forEach(btn=>{
      const showInfo=()=>{
        const text=decodeURIComponent(btn.dataset[dataKey]||'')||'لا توجد معلومات';
        infoPopover.textContent=text;
        const r=btn.getBoundingClientRect();
        const maxW=Math.min(420,window.innerWidth-24);
        infoPopover.style.maxWidth=maxW+'px';
        infoPopover.classList.add('show');
        btn.classList.add('open');

        const pw=infoPopover.offsetWidth;
        const ph=infoPopover.offsetHeight;
        let left=Math.max(12,Math.min(window.innerWidth-pw-12,r.left+r.width/2-pw/2));
        let top=r.bottom+8;
        if(top+ph>window.innerHeight-12) top=Math.max(12,r.top-ph-8);

        infoPopover.style.left=left+'px';
        infoPopover.style.top=top+'px';
      };

      btn.addEventListener('mouseenter',showInfo);
      btn.addEventListener('mouseleave',()=>{if(!btn.classList.contains('open')) hideInfoPopover()});
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const wasOpen=btn.classList.contains('open');
        hideInfoPopover();
        if(!wasOpen) showInfo();
      });
    });
  };

  bindInfoPreview('.notes-preview','notes');
  bindInfoPreview('.address-preview','address');

  if(!window.__corvexInfoBound){
    document.addEventListener('click',e=>{
      if(!e.target.closest('.notes-preview') && !e.target.closest('.address-preview') && !e.target.closest('#infoPopover')) hideInfoPopover();
    });
    window.addEventListener('scroll',hideInfoPopover,true);
    window.addEventListener('resize',hideInfoPopover);
    window.__corvexInfoBound=true;
  }
  if(selectable){$('#allcheck').onchange=e=>document.querySelectorAll('.rowcheck').forEach(x=>x.checked=e.target.checked)}}
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
function labelHtml(o){return `<div class="label"><div class="label-head"><span class="label-code">#${o.order_code}</span><b class="label-brand">CORVEX SPORT</b><span class="label-spacer"></span></div><div><strong>المستلم:</strong> ${esc(o.recipient_name)}</div><div><strong>الهاتف:</strong> ${esc(o.phone)}</div><div><strong>العنوان:</strong> ${esc(o.area)} ${esc(o.detailed_address)}</div><div><strong>القيمة:</strong> ${money(o.amount)} د.أ</div><div class="note"><strong>ملاحظات الطلب:</strong><br>${esc(o.order_notes||'-')}</div></div>`}
function openPrintWindow(orders,title='طباعة'){const w=window.open('','_blank');const pages=[];for(let i=0;i<orders.length;i+=8)pages.push(orders.slice(i,i+8));w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif}.page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:3mm;page-break-after:always}.page:last-child{page-break-after:auto}.label{border:1px solid #555;padding:4mm;font-size:10.5pt;overflow:hidden}.label-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid #999;padding-bottom:2mm;margin-bottom:2mm;font-size:12pt}.label-code{justify-self:start}.label-brand{justify-self:center;text-align:center}.label-spacer{justify-self:end}.note{margin-top:2mm;border-top:1px dashed #aaa;padding-top:2mm;font-weight:700;white-space:pre-line;line-height:1.7;word-break:break-word}</style></head><body>${pages.map(pg=>`<section class="page">${pg.map(labelHtml).join('')}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}
async function batchesView(){
  const c=$('#content');
  const stores=await getActiveStores();
  c.innerHTML=`<div class="page-title"><div><h1>دفعات الطباعة</h1><div class="sub">الدفعات مفصولة حسب المتجر</div></div></div><div class="card"><div class="toolbar"><select id="batchStore" class="select"><option value="">كل المتاجر</option>${stores.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div><div id="batchList"></div></div>`;
  const loadBatches=async()=>{
    const q=$('#batchStore').value?('?store_id='+encodeURIComponent($('#batchStore').value)):'';
    const d=await api('/print-batches'+q);state.batches=d.batches;
    $('#batchList').innerHTML=state.batches.length?state.batches.map(b=>`<div class="batch-card"><div><b>${esc(b.batch_code)}</b><div class="batch-meta">${esc(b.store_name||'متجر غير محدد')} • ${b.order_count} طلب • ${esc(b.created_by_name||'')} • ${fmtDate(b.created_at)}</div></div><div class="actions" style="margin:0"><button class="btn btn-outline" data-batch="${b.id}" data-mode="all">إعادة الدفعة</button><button class="btn btn-soft" data-batch="${b.id}" data-mode="page">إعادة صفحة</button></div></div>`).join(''):'<div class="empty">لا توجد دفعات</div>';
    document.querySelectorAll('[data-batch]').forEach(btn=>btn.onclick=async()=>{const d=await api('/print-batches/'+btn.dataset.batch);if(btn.dataset.mode==='all')openPrintWindow(d.orders,`إعادة ${d.batch.batch_code}`);else{const max=Math.ceil(d.orders.length/8);const p=Number(prompt(`رقم الصفحة من 1 إلى ${max}`,'1'));if(p>=1&&p<=max)openPrintWindow(d.orders.slice((p-1)*8,p*8),`صفحة ${p} - ${d.batch.batch_code}`)}})
  };
  $('#batchStore').onchange=loadBatches;await loadBatches()
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
      <div class="sub">كل طلب يُحسب مرة واحدة فقط بتاريخ أول طباعة له</div>

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
    const p=new URLSearchParams({from_date:$('#fd').value,to_date:$('#td').value});
    if($('#reportStore').value)p.set('store_id',$('#reportStore').value);
    const d=await api('/orders?'+p);
    state.orders=d.orders;
    renderOrdersTable('#reportTable',state.orders,false);
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
function printReport(orders){const w=window.open('','_blank');w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>كشف CORVEX SPORT</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Tahoma,Arial}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #aaa;padding:5px;text-align:right}h2{margin:0 0 10px}</style></head><body><h2>كشف طلبات CORVEX SPORT</h2><table><thead><tr><th>الكود</th><th>المتجر</th><th>الاسم</th><th>الهاتف</th><th>المحافظة</th><th>العنوان</th><th>القيمة</th><th>الملاحظات</th><th>الموظف</th><th>التاريخ</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${o.order_code}</td><td>${esc(o.store_name||'—')}</td><td>${esc(o.recipient_name)}</td><td>${esc(o.phone)}</td><td>${esc(o.area)}</td><td>${esc(o.detailed_address)}</td><td>${money(o.amount)}</td><td>${esc(o.order_notes)}</td><td>${esc(o.created_by_name||'')}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
function downloadCsv(orders){const rows=[['رقم البوليصة','المتجر','اسم المستلم','رقم الهاتف','المحافظة','العنوان التفصيلي','قيمة الطرد','ملاحظات الطلب','الموظف','تاريخ الإدخال'],...orders.map(o=>[o.order_code,o.store_name||'',o.recipient_name,o.phone,o.area,o.detailed_address,o.amount,o.order_notes,o.created_by_name||'',o.created_at])];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`corvex-orders-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}


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
            <div class="sub">الشحنات ${x.assigned_count||0} • تم الاستلام ${x.delivered_count||0} • رفض/رجوع ${x.returned_count||0}</div>
            ${x.phone?`<div class="sub">${esc(x.phone)}</div>`:''}
          </div>
          <div class="courier-actions">
            <button class="btn btn-soft edit-courier" data-id="${x.id}">تعديل</button>
            <button class="btn btn-danger delete-courier" data-id="${x.id}">حذف</button>
            <button class="btn btn-accent settle-courier" data-id="${x.id}">تسكير الحساب</button>
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
 dashboard:'لوحة التحكم',stores:'المتاجر',orders_add:'إضافة طلب',orders_view:'عرض الطلبات',orders_edit:'تعديل الطلب',
 orders_status:'تغيير حالة الطلب',couriers:'عرض المناديب',couriers_add:'إضافة مندوب',couriers_edit:'تعديل مندوب',
 couriers_delete:'حذف مندوب',couriers_accounting:'محاسبة / تسكير حساب المناديب',print:'جاهز للطباعة',batches:'دفعات الطباعة',
 reports:'الكشوفات والتقارير',regions:'عرض المناطق',regions_edit:'تعديل المناطق',users:'المستخدمون',permissions:'الصلاحيات'
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

  c.innerHTML=`
    <div class="page-title">
      <div><h1>المتاجر</h1><div class="sub">اضغط على المتجر لعرض شحناته فقط</div></div>
      <button class="btn btn-accent" onclick="show('store-add')">＋ إضافة متجر</button>
    </div>
    <div class="store-browser">
      ${(d.stores||[]).length?(d.stores||[]).map(s=>`
        <button class="store-browser-card" data-store-open="${s.id}">
          <div class="store-browser-name">${esc(s.name)}</div>
          <div class="store-browser-meta">${Number(s.orders_count||0)} شحنة${s.phone?' • '+esc(s.phone):''}</div>
          ${s.contact_name?`<div class="store-browser-contact">${esc(s.contact_name)}</div>`:''}
          <div class="store-browser-arrow">عرض الشحنات ←</div>
        </button>`).join(''):'<div class="empty">لا يوجد متاجر</div>'}
    </div>`;

  document.querySelectorAll('[data-store-open]').forEach(b=>b.onclick=()=>storeShipmentsView(Number(b.dataset.storeOpen)));
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
      <button class="btn btn-soft" onclick="show('stores')">العودة للمتاجر</button>
    </div>
    <div class="card">
      <div class="toolbar">
        <input id="storeShipmentQ" class="input" placeholder="كود / هاتف / اسم">
        <select id="storeShipmentStatus" class="select">
          <option value="">كل الحالات</option>
          <option value="pending">قيد التوصيل</option>
          <option value="delivered">تم الاستلام</option>
          <option value="refused_fee_paid">رفض ودفع أجور</option>
          <option value="refused_no_fee">رفض وعدم دفع أجور</option>
          <option value="canceled_before_arrival">ملغي قبل الوصول</option>
          <option value="partial">استلام جزئي</option>
        </select>
        <button id="storeShipmentSearch" class="btn btn-primary">بحث</button>
      </div>
      <div id="storeShipmentsTable"></div>
    </div>`;

  const load=async()=>{
    const p=new URLSearchParams({store_id:String(storeId)});
    if($('#storeShipmentQ').value)p.set('q',$('#storeShipmentQ').value);
    if($('#storeShipmentStatus').value)p.set('status',$('#storeShipmentStatus').value);
    const d=await api('/orders?'+p.toString());
    renderOrdersTable('#storeShipmentsTable',d.orders||[],false);
  };

  $('#storeShipmentSearch').onclick=load;
  await load();
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
async function usersView(){const c=$('#content');const d=await api('/users');c.innerHTML=`<div class="page-title"><div><h1>المستخدمون</h1><div class="sub">كل موظف يدخل بحسابه ويُحفظ اسمه مع الطلب</div></div></div><div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><h3>إضافة مستخدم</h3><div class="field"><label>الاسم الظاهر</label><input id="ud" class="input"></div><br><div class="field"><label>اسم المستخدم</label><input id="uu" class="input"></div><br><div class="field"><label>كلمة المرور</label><input id="up" type="password" class="input"></div><br><div class="field"><label>الصلاحية</label><select id="ur" class="select"><option value="staff">موظف</option><option value="admin">مدير</option></select></div><button id="addUser" class="btn btn-primary" style="margin-top:15px">إضافة</button></div><div class="card"><h3>الحسابات</h3>${d.users.map(u=>`<div class="batch-card"><div><b>${esc(u.display_name)}</b><div class="batch-meta">@${esc(u.username)} • ${u.role==='admin'?'مدير':'موظف'}</div></div><span class="badge ${u.is_active?'badge-ok':'badge-warn'}">${u.is_active?'فعال':'موقوف'}</span></div>`).join('')}</div></div>`;$('#addUser').onclick=async()=>{try{await api('/users',{method:'POST',body:JSON.stringify({display_name:$('#ud').value,username:$('#uu').value,password:$('#up').value,role:$('#ur').value})});toast('تمت إضافة المستخدم');usersView()}catch(e){toast(e.message)}}}
boot();
