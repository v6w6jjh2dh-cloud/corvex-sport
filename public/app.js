const state={token:localStorage.getItem('corvex_token')||'',user:null,view:'dashboard',orders:[],selected:new Set(),stats:{},batches:[]};
const $=s=>document.querySelector(s);const app=$('#app');
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2400)}
async function api(path,opts={}){const headers={'content-type':'application/json',...(opts.headers||{})};if(state.token)headers.authorization=`Bearer ${state.token}`;const r=await fetch('/api'+path,{...opts,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'حدث خطأ');return d}
function esc(v=''){return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function fmtDate(v){if(!v)return'';return new Date(v+'Z').toLocaleString('ar-JO',{dateStyle:'short',timeStyle:'short'})}
function money(v){return Number(v||0).toFixed(2)}
function normalizeArabic(v=''){
  return String(v)
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

const JORDAN_PLACES = `
عمان|اربد|الزرقاء|المفرق|عجلون|جرش|مادبا|البلقاء|الكرك|الطفيلة|معان|العقبة|السلط|الرصيفة|الرمثا|سحاب|ناعور|وادي السير|صويلح|الجبيهة|طبربور|ماركا|ابو نصير|شفا بدران|تلاع العلي|خلدا|دابوق|ام السماق|الشميساني|جبل الحسين|جبل عمان|جبل النصر|العبدلي|راس العين|المقابلين|الياسمين|مرج الحمام|البيادر|وسط البلد|الوحدات|القويسمة|الموقر|الجويدة|جاوا|اليادودة|خريبة السوق|عين الباشا|البقعة|الفحيص|ماحص|الشونة الجنوبية|الشونة الشمالية|دير علا|الكريمة|الصبيحي|الحصن|بني عبيد|ايدون|حوارة|بني كنانة|سما الروسان|الشجرة|الطرة|المزار الشمالي|الوسطية|كفر اسد|دير ابي سعيد|الكورة|الهاشمية|الضليل|بيرين|الازرق|الغويرية|الزواهرة|رحاب|بلعما|منشية بني حسن|ام الجمال|عنجرة|كفرنجة|صخرة|عبين|عبلين|راسون|الوهادنة|اشتفينا|عين جنا|سوف|ساكب|برما|المصطبة|الكته|الكتة|قفقفا|ريمون|مخيم جرش|دبين|ذيبان|مليح|ماعين|مكاور|الفيصلية|حسبان|الجيزة|اللبن|نتل|ام الرصاص|مؤتة|المزار الجنوبي|الربة|القصر|فقوع|غور الصافي|بصيرا|الحسا|القادسية|غرندل|عين البيضاء|عفرا|الشوبك|وادي موسى|البتراء|الحسينية|الجفر|اذرح|المريغة|راس النقب|القويرة|وادي رم|الديسة|الريشة|الحميمة|رحمة|علجون|عرجان|حلاوة|باعون
`.trim().split('|').map(normalizeArabic).sort((a,b)=>b.length-a.length);

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

function phoneFrom(line){
  const c = String(line).replace(/[\s-]/g,'');
  const m = c.match(/(?:\+?962|0)?7[789]\d{7}/);
  return m ? m[0] : '';
}

function isPriceLine(line){
  const n = normalizeArabic(line);
  return /\d/.test(n) && containsAny(n, PRICE_WORDS);
}

function priceFrom(line){
  if(!isPriceLine(line)) return '';
  const nums = String(line).match(/\d+(?:\.\d+)?/g) || [];
  return nums.length ? nums[nums.length - 1] : '';
}

function placeAtStart(line){
  const n = normalizeArabic(line);
  for(const p of JORDAN_PLACES){
    if(n === p || n.startsWith(p + ' ')){
      return p;
    }
  }
  return '';
}

function splitAreaAddress(line){
  const n = normalizeArabic(line);
  const place = placeAtStart(line);
  if(!place) return {area:'', address:''};

  const nw = n.split(/\s+/);
  const pw = place.split(/\s+/);
  const ow = String(line).trim().split(/\s+/);

  const area = ow.slice(0,pw.length).join(' ');
  const address = ow.slice(pw.length).join(' ').trim();

  return {area, address};
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
  if(/\d/.test(String(line))) return false;
  if(phoneFrom(line)) return false;
  if(isPriceLine(line)) return false;
  if(isLikelyProductOrDetail(line)) return false;
  if(placeAtStart(line)) return false;

  const n = normalizeArabic(line);
  const ws = n.split(/\s+/).filter(Boolean);
  if(ws.length < 1 || ws.length > 4) return false;

  if(ws[0] === 'ابو' || ws[0] === 'ام') return true;
  if(COMMON_NAMES.has(ws[0])) return true;

  // إذا أول سطر عربي قصير وليس مكان/منتج نعتبره اسمًا
  if(index === 0 && ws.length <= 3) return true;

  return false;
}

function parseSmart(text){
  const lines = String(text||'')
    .split(/\n+/)
    .map(x=>x.trim())
    .filter(Boolean);

  const used = new Set();

  let name = '';
  let phone = '';
  let area = '';
  let address = '';
  let amount = '';

  // 1) الهاتف
  for(let i=0;i<lines.length;i++){
    const p = phoneFrom(lines[i]);
    if(p){
      phone = p;
      used.add(i);
      break;
    }
  }

  // 2) السعر: لا نأخذ أي رقم إلا من سطر سعر صريح
  for(let i=lines.length-1;i>=0;i--){
    if(used.has(i)) continue;
    if(isPriceLine(lines[i])){
      amount = priceFrom(lines[i]);
      // مهم: لا نضع سطر السعر في used حتى يبقى كاملًا في الملاحظات
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
  if(!name) name = 'مجهول';

  // 4) المنطقة والعنوان: يجب أن يبدأ السطر بمنطقة أردنية معروفة
  for(let i=0;i<lines.length;i++){
    if(used.has(i)) continue;
    if(isLikelyProductOrDetail(lines[i])) continue;
    if(isPriceLine(lines[i])) continue;

    const pa = splitAreaAddress(lines[i]);
    if(pa.area){
      area = pa.area;
      address = pa.address;
      used.add(i);
      break;
    }
  }

  // 5) أي سطر عنوان إضافي فقط إذا فيه كلمة عنوان واضحة
  const extraAddress = [];
  for(let i=0;i<lines.length;i++){
    if(used.has(i)) continue;
    if(isLikelyProductOrDetail(lines[i])) continue;
    if(isPriceLine(lines[i])) continue;

    const n = normalizeArabic(lines[i]);
    if(containsAny(n, ADDRESS_WORDS)){
      extraAddress.push(lines[i]);
      used.add(i);
    }
  }
  address = [address, ...extraAddress].filter(Boolean).join(' - ');

  // 6) الملاحظات: المنتجات + اللون + المقاس + الوزن + سطر السعر كاملًا كما كتبه الموظف
  const notes = lines
    .filter((line,i)=>{
      if(used.has(i)) return false;
      if(phoneFrom(line)) return false;
      if(name !== 'مجهول' && line === name) return false;
      return true;
    })
    .join(' - ');

  return {name, phone, area, address, amount, notes};
}
async function boot(){
  try{const setup=await api('/setup');if(setup.needs_setup){renderSetup();return}}catch{}
  if(!state.token){renderLogin();return}
  try{const me=await api('/me');state.user=me.user;renderShell();await show('dashboard')}catch{localStorage.removeItem('corvex_token');state.token='';renderLogin()}
}
function renderLogin(){app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-brand"><div class="logo-mark">C</div><h1>CORVEX SPORT</h1><p>نظام إدارة وطباعة الطلبات</p></div><div class="field"><label>اسم المستخدم</label><input id="lu" class="input"></div><br><div class="field"><label>كلمة المرور</label><input id="lp" type="password" class="input"></div><button id="loginBtn" class="btn btn-primary" style="width:100%;margin-top:18px">تسجيل الدخول</button></div></div>`;$('#loginBtn').onclick=async()=>{try{const d=await api('/login',{method:'POST',body:JSON.stringify({username:$('#lu').value,password:$('#lp').value})});state.token=d.token;state.user=d.user;localStorage.setItem('corvex_token',state.token);renderShell();show('dashboard')}catch(e){toast(e.message)}}}
function renderSetup(){app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-brand"><div class="logo-mark">C</div><h1>تهيئة CORVEX SPORT</h1><p>أنشئ أول حساب مدير</p></div><div class="field"><label>الاسم الظاهر</label><input id="sd" class="input" value="Admin"></div><br><div class="field"><label>اسم المستخدم</label><input id="su" class="input" value="admin"></div><br><div class="field"><label>كلمة المرور</label><input id="sp" type="password" class="input"></div><button id="setupBtn" class="btn btn-accent" style="width:100%;margin-top:18px">إنشاء النظام</button></div></div>`;$('#setupBtn').onclick=async()=>{try{await api('/setup',{method:'POST',body:JSON.stringify({display_name:$('#sd').value,username:$('#su').value,password:$('#sp').value})});toast('تمت التهيئة');renderLogin()}catch(e){toast(e.message)}}}
function renderShell(){app.innerHTML=`<div class="shell"><header class="topbar"><div class="logo"><div class="logo-mark">C</div><div>CORVEX SPORT<small>ORDER DESK</small></div></div><div class="top-actions"><span class="pill">${esc(state.user?.display_name||'')}</span><button id="logout" class="btn btn-soft">خروج</button></div></header><div class="layout"><aside class="sidebar"><nav class="nav"><button data-view="dashboard">⌂ لوحة التحكم</button><button data-view="new">＋ إضافة طلب</button><button data-view="orders">▤ الطلبات والبحث</button><button data-view="print">▣ جاهز للطباعة</button><button data-view="batches">↻ دفعات الطباعة</button><button data-view="reports">▦ الكشوفات وExcel</button>${state.user?.role==='admin'?'<button data-view="users">♟ المستخدمون</button>':''}</nav></aside><main id="content" class="content"></main></div></div>`;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));$('#logout').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}localStorage.removeItem('corvex_token');state.token='';state.user=null;renderLogin()}}
async function show(v){state.view=v;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(v==='dashboard')return dashboard();if(v==='new')return newOrder();if(v==='orders')return ordersView();if(v==='print')return printView();if(v==='batches')return batchesView();if(v==='reports')return reportsView();if(v==='users')return usersView()}
async function dashboard(){const c=$('#content');c.innerHTML='<div class="empty">جاري التحميل...</div>';try{state.stats=await api('/dashboard');c.innerHTML=`<div class="page-title"><div><h1>لوحة التحكم</h1><div class="sub">نظرة سريعة على حركة الطلبات</div></div><button class="btn btn-accent" onclick="show('new')">＋ طلب جديد</button></div><div class="grid stats"><div class="stat"><b>${state.stats.today||0}</b><span>طلبات اليوم</span></div><div class="stat"><b>${state.stats.unprinted||0}</b><span>غير مطبوعة</span></div><div class="stat"><b>${state.stats.total||0}</b><span>إجمالي الطلبات</span></div><div class="stat"><b>${state.stats.batches||0}</b><span>دفعات الطباعة</span></div></div><div class="card"><h3>مسار العمل</h3><p class="sub">الموظف يدخل الطلب ← يظهر ضمن غير المطبوع ← تنشئ دفعة طباعة ← 8 بوالص في كل A4.</p></div>`}catch(e){c.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
function newOrder(){const c=$('#content');c.innerHTML=`<div class="page-title"><div><h1>إضافة طلب</h1><div class="sub">الصق الطلب كامل أو عبّئ الحقول يدويًا • Smart Parser V3</div></div></div><div class="card"><div class="smart-box"><div class="field"><label>الصق الطلب هنا</label><textarea id="raw" class="textarea" placeholder="0772207993\nعلجون عرجان\n3 بلايز ريبوك\nالوزن 100\n15 شامل التوصيل"></textarea></div><div class="smart-actions"><button id="parse" class="btn btn-accent">⚡ تعبئة تلقائية</button><button id="clearRaw" class="btn btn-outline">مسح</button></div></div><br><div class="grid form-grid"><div class="field"><label>اسم المستلم</label><input id="name" class="input" placeholder="اسم الزبون"></div><div class="field"><label>رقم الهاتف</label><input id="phone" class="input" inputmode="tel" placeholder="07xxxxxxxx"></div><div class="field"><label>المنطقة</label><input id="area" class="input" placeholder="علجون / عرجان / طبربور..."></div><div class="field"><label>قيمة الطلب</label><input id="amount" class="input" inputmode="decimal" placeholder="0.00"></div><div class="field full"><label>العنوان التفصيلي</label><textarea id="address" class="textarea" placeholder="العنوان الكامل"></textarea></div><div class="field full"><label>ملاحظات الطلب / التجهيز</label><textarea id="notes" class="textarea" placeholder="الصنف، اللون، المقاس، الوزن، أي ملاحظات للموظف الذي يجهز الطلب"></textarea></div></div><div class="actions"><button id="saveOrder" class="btn btn-primary">حفظ الطلب</button><button id="saveNext" class="btn btn-accent">حفظ وإضافة طلب جديد</button></div></div>`;
  $('#parse').onclick=()=>{const p=parseSmart($('#raw').value);$('#name').value=p.name||'مجهول';if(p.phone)$('#phone').value=p.phone;$('#amount').value=p.amount||'';$('#area').value=p.area||'';$('#address').value=p.address||'';$('#notes').value=p.notes||'';toast('تم الفرز V3، راجع الحقول قبل الحفظ')};
  async function save(next){try{const d=await api('/orders',{method:'POST',body:JSON.stringify({recipient_name:$('#name').value,phone:$('#phone').value,area:$('#area').value,detailed_address:$('#address').value,amount:$('#amount').value,order_notes:$('#notes').value,raw_text:$('#raw').value})});toast(`تم حفظ الطلب رقم ${d.order.order_code}`);if(next)newOrder();else show('orders')}catch(e){toast(e.message)}}$('#saveOrder').onclick=()=>save(false);$('#saveNext').onclick=()=>save(true)
}
async function ordersView(){const c=$('#content');c.innerHTML=`<div class="page-title"><div><h1>الطلبات والبحث</h1><div class="sub">ابحث بالكود أو الهاتف أو الاسم أو حدّد نطاق أكواد</div></div></div><div class="card"><div class="toolbar"><input id="q" class="input" placeholder="بحث سريع"><input id="fc" class="input" inputmode="numeric" placeholder="من كود"><input id="tc" class="input" inputmode="numeric" placeholder="إلى كود"><select id="ps" class="select"><option value="">كل الطلبات</option><option value="0">غير مطبوعة</option><option value="1">مطبوعة</option></select><button id="searchBtn" class="btn btn-primary">بحث</button></div><div id="ordersTable"></div></div>`;$('#searchBtn').onclick=loadOrders;await loadOrders()}
async function loadOrders(){const p=new URLSearchParams();if($('#q')?.value)p.set('q',$('#q').value);if($('#fc')?.value)p.set('from_code',$('#fc').value);if($('#tc')?.value)p.set('to_code',$('#tc').value);if($('#ps')?.value!=='')p.set('printed',$('#ps').value);const d=await api('/orders?'+p.toString());state.orders=d.orders;renderOrdersTable('#ordersTable',state.orders,false)}
function renderOrdersTable(sel,orders,selectable=true){const el=$(sel);if(!orders.length){el.innerHTML='<div class="empty">لا توجد طلبات</div>';return}el.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr>${selectable?'<th><input id="allcheck" class="check" type="checkbox"></th>':''}<th>الكود</th><th>الاسم</th><th>الهاتف</th><th>المنطقة / العنوان</th><th>القيمة</th><th>الملاحظات</th><th>الموظف</th><th>الطباعة</th><th>التاريخ</th></tr></thead><tbody>${orders.map(o=>`<tr>${selectable?`<td><input class="rowcheck check" type="checkbox" data-id="${o.id}"></td>`:''}<td class="code">${o.order_code}</td><td>${esc(o.recipient_name)}</td><td>${esc(o.phone)}</td><td>${esc(o.area)}<br><span class="sub">${esc(o.detailed_address)}</span></td><td>${money(o.amount)}</td><td>${esc(o.order_notes)}</td><td>${esc(o.created_by_name||'')}</td><td>${o.printed?'<span class="badge badge-ok">مطبوع</span>':'<span class="badge badge-warn">غير مطبوع</span>'}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('')}</tbody></table></div>`;if(selectable){$('#allcheck').onchange=e=>document.querySelectorAll('.rowcheck').forEach(x=>x.checked=e.target.checked)}}
async function printView(){const c=$('#content');const d=await api('/unprinted');state.orders=d.orders;c.innerHTML=`<div class="page-title"><div><h1>جاهز للطباعة</h1><div class="sub">كل الطلبات التي لم تدخل أي دفعة طباعة حتى الآن</div></div><div><span class="pill" style="background:#e9eff4;color:#102a43">${state.orders.length} طلب</span></div></div><div class="card"><div class="actions no-print" style="margin-top:0;margin-bottom:14px"><button id="selAll" class="btn btn-soft">تحديد الكل</button><button id="makeBatch" class="btn btn-accent">إنشاء دفعة وطباعة المحدد</button></div><div id="printTable"></div></div>`;renderOrdersTable('#printTable',state.orders,true);$('#selAll').onclick=()=>document.querySelectorAll('.rowcheck').forEach(x=>x.checked=true);$('#makeBatch').onclick=async()=>{const ids=[...document.querySelectorAll('.rowcheck:checked')].map(x=>Number(x.dataset.id));if(!ids.length)return toast('حدد طلباً واحداً على الأقل');try{const r=await api('/print-batches',{method:'POST',body:JSON.stringify({order_ids:ids})});openPrintWindow(r.orders,`دفعة ${r.batch.batch_code}`);toast(`تم إنشاء دفعة ${r.batch.order_count} طلب`);setTimeout(()=>printView(),600)}catch(e){toast(e.message)}}}
function labelHtml(o){return `<div class="label"><div class="label-head"><b>CORVEX SPORT</b><span>#${o.order_code}</span></div><div><strong>المستلم:</strong> ${esc(o.recipient_name)}</div><div><strong>الهاتف:</strong> ${esc(o.phone)}</div><div><strong>العنوان:</strong> ${esc(o.area)} ${esc(o.detailed_address)}</div><div><strong>القيمة:</strong> ${money(o.amount)} د.أ</div><div class="note"><strong>ملاحظات الطلب:</strong><br>${esc(o.order_notes||'-')}</div></div>`}
function openPrintWindow(orders,title='طباعة'){const w=window.open('','_blank');const pages=[];for(let i=0;i<orders.length;i+=8)pages.push(orders.slice(i,i+8));w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif}.page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:3mm;page-break-after:always}.page:last-child{page-break-after:auto}.label{border:1px solid #555;padding:4mm;font-size:10.5pt;overflow:hidden}.label-head{display:flex;justify-content:space-between;border-bottom:1px solid #999;padding-bottom:2mm;margin-bottom:2mm;font-size:12pt}.note{margin-top:2mm;border-top:1px dashed #aaa;padding-top:2mm;font-weight:700}</style></head><body>${pages.map(pg=>`<section class="page">${pg.map(labelHtml).join('')}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}
async function batchesView(){const c=$('#content');const d=await api('/print-batches');state.batches=d.batches;c.innerHTML=`<div class="page-title"><div><h1>دفعات الطباعة</h1><div class="sub">إعادة طباعة دفعة كاملة أو صفحة معينة منها</div></div></div><div class="card">${state.batches.length?state.batches.map(b=>`<div class="batch-card"><div><b>${esc(b.batch_code)}</b><div class="batch-meta">${b.order_count} طلب • ${esc(b.created_by_name||'')} • ${fmtDate(b.created_at)}</div></div><div class="actions" style="margin:0"><button class="btn btn-outline" data-batch="${b.id}" data-mode="all">إعادة الدفعة</button><button class="btn btn-soft" data-batch="${b.id}" data-mode="page">إعادة صفحة</button></div></div>`).join(''):'<div class="empty">لا توجد دفعات بعد</div>'}</div>`;document.querySelectorAll('[data-batch]').forEach(btn=>btn.onclick=async()=>{const d=await api('/print-batches/'+btn.dataset.batch);if(btn.dataset.mode==='all')openPrintWindow(d.orders,`إعادة ${d.batch.batch_code}`);else{const max=Math.ceil(d.orders.length/8);const p=Number(prompt(`رقم الصفحة من 1 إلى ${max}`,'1'));if(p>=1&&p<=max)openPrintWindow(d.orders.slice((p-1)*8,p*8),`صفحة ${p} - ${d.batch.batch_code}`)}})}
async function reportsView(){const c=$('#content');c.innerHTML=`<div class="page-title"><div><h1>الكشوفات وExcel</h1><div class="sub">حدد فترة ثم اطبع كشف أو نزّل ملف للشركة</div></div></div><div class="card"><div class="toolbar"><input id="fd" type="date" class="input"><input id="td" type="date" class="input"><button id="rr" class="btn btn-primary">عرض</button><button id="rp" class="btn btn-outline">طباعة كشف</button><button id="rx" class="btn btn-accent">تنزيل Excel/CSV</button></div><div id="reportTable"></div></div>`;const today=new Date().toISOString().slice(0,10);$('#fd').value=today;$('#td').value=today;async function load(){const p=new URLSearchParams({from_date:$('#fd').value,to_date:$('#td').value});const d=await api('/orders?'+p);state.orders=d.orders;renderOrdersTable('#reportTable',state.orders,false)}$('#rr').onclick=load;$('#rp').onclick=()=>printReport(state.orders);$('#rx').onclick=()=>downloadCsv(state.orders);await load()}
function printReport(orders){const w=window.open('','_blank');w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>كشف CORVEX SPORT</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Tahoma,Arial}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #aaa;padding:5px;text-align:right}h2{margin:0 0 10px}</style></head><body><h2>كشف طلبات CORVEX SPORT</h2><table><thead><tr><th>الكود</th><th>الاسم</th><th>الهاتف</th><th>المنطقة</th><th>العنوان</th><th>القيمة</th><th>الملاحظات</th><th>الموظف</th><th>التاريخ</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${o.order_code}</td><td>${esc(o.recipient_name)}</td><td>${esc(o.phone)}</td><td>${esc(o.area)}</td><td>${esc(o.detailed_address)}</td><td>${money(o.amount)}</td><td>${esc(o.order_notes)}</td><td>${esc(o.created_by_name||'')}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
function downloadCsv(orders){const rows=[['رقم البوليصة','اسم المستلم','رقم الهاتف','المنطقة','العنوان التفصيلي','قيمة الطرد','ملاحظات الطلب','الموظف','تاريخ الإدخال'],...orders.map(o=>[o.order_code,o.recipient_name,o.phone,o.area,o.detailed_address,o.amount,o.order_notes,o.created_by_name||'',o.created_at])];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`corvex-orders-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}
async function usersView(){const c=$('#content');const d=await api('/users');c.innerHTML=`<div class="page-title"><div><h1>المستخدمون</h1><div class="sub">كل موظف يدخل بحسابه ويُحفظ اسمه مع الطلب</div></div></div><div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><h3>إضافة مستخدم</h3><div class="field"><label>الاسم الظاهر</label><input id="ud" class="input"></div><br><div class="field"><label>اسم المستخدم</label><input id="uu" class="input"></div><br><div class="field"><label>كلمة المرور</label><input id="up" type="password" class="input"></div><br><div class="field"><label>الصلاحية</label><select id="ur" class="select"><option value="staff">موظف</option><option value="admin">مدير</option></select></div><button id="addUser" class="btn btn-primary" style="margin-top:15px">إضافة</button></div><div class="card"><h3>الحسابات</h3>${d.users.map(u=>`<div class="batch-card"><div><b>${esc(u.display_name)}</b><div class="batch-meta">@${esc(u.username)} • ${u.role==='admin'?'مدير':'موظف'}</div></div><span class="badge ${u.is_active?'badge-ok':'badge-warn'}">${u.is_active?'فعال':'موقوف'}</span></div>`).join('')}</div></div>`;$('#addUser').onclick=async()=>{try{await api('/users',{method:'POST',body:JSON.stringify({display_name:$('#ud').value,username:$('#uu').value,password:$('#up').value,role:$('#ur').value})});toast('تمت إضافة المستخدم');usersView()}catch(e){toast(e.message)}}}
boot();
