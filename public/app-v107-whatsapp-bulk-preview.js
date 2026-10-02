(()=>{
 function splitWhatsApp(text=''){
  const src=String(text||'').replace(/\r/g,'').trim();if(!src)return[];
  // iPhone/WhatsApp Arabic exports may contain RTL marks, NBSPs and Arabic AM/PM.
  // Split at every line that starts with a WhatsApp [date,time] header; sender text is not required.
  const header=/^[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]*\[[^\]\n]{3,80}\][^\n]*?:[\s\u00a0]*/gm;
  const ms=[...src.matchAll(header)];
  if(ms.length<2){
    // Fallback: split before each bracketed date even when the copied sender/header punctuation is malformed.
    const loose=/(?=^[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]*\[[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]*[0-9٠-٩]{1,2}\s*[\/\-]\s*[0-9٠-٩]{1,2}\s*[\/\-]\s*[0-9٠-٩]{2,4}[^\]\n]*\])/gm;
    const parts=src.split(loose).map(x=>x.trim()).filter(Boolean);
    if(parts.length>1)return parts.map(x=>x.replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]*\[[^\]\n]+\][^\n]*?:[\s\u00a0]*/,'').replace(/\s*<تم تعديل هذه الرسالة>\s*$/,'').trim()).filter(Boolean);
  }
  if(!ms.length)return[src];
  const out=[];for(let i=0;i<ms.length;i++){const begin=ms[i].index+ms[i][0].length,finish=i+1<ms.length?ms[i+1].index:src.length,body=src.slice(begin,finish).replace(/\s*<تم تعديل هذه الرسالة>\s*$/,'').trim();if(body)out.push(body)}return out;
 }
 function typeOf(raw){const n=normalizeArabic(raw);if(/(?:^|\s)تعديل(?:\s|$)/.test(n))return 'edit';if(/طلب\s*(?:ارجاع|استرجاع)|استرجاع|ترجيع/.test(n))return 'return';return 'new'}
 function preview(raw,i){const p=parseSmart(raw),type=typeOf(raw),phone=p.phone||'',issues=[];if(!phone)issues.push('بدون هاتف');if(type==='new'&&!p.area)issues.push('المنطقة غير واضحة');if(type==='new'&&!p.amount&&p.amount!==0)issues.push('السعر غير واضح');return{raw,p,type,issues,i}}
 function typeLabel(t){return t==='edit'?'🛑 تعديل':t==='return'?'↩️ إرجاع':'✅ طلب جديد'}
 function mount(){
  const raw=document.getElementById('raw');if(!raw||document.getElementById('bulkWhatsAppBtn'))return;
  const actions=raw.closest('.smart-box')?.querySelector('.smart-actions');if(!actions)return;
  const b=document.createElement('button');b.id='bulkWhatsAppBtn';b.type='button';b.className='btn btn-soft';b.textContent='📥 إدخال عدة طلبات واتساب';actions.appendChild(b);
  b.onclick=()=>showBulk();
 }
 async function showBulk(){
  const host=document.getElementById('content');if(!host)return;const store=document.getElementById('store')?.value||localStorage.getItem('corvex_selected_store')||'';
  host.innerHTML=`<div class="page-title"><div><h1>إدخال عدة طلبات واتساب</h1><div class="sub">الصق الرسائل كما نسختها من واتساب — لن يتم الحفظ قبل المراجعة.</div></div></div><div class="card"><div class="field"><label>الصق كل طلبات واتساب هنا دفعة واحدة</label><div class="sub" style="margin-bottom:8px">هذا مربع مستقل عن إدخال الطلب الفردي، ولا يوجد حد طلب واحد.</div><textarea id="bulkWA" class="textarea" style="min-height:520px;height:55vh;resize:vertical;white-space:pre-wrap;overflow:auto" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="الصق هنا المحادثة كاملة: 10 أو 20 أو 50 طلب دفعة واحدة..."></textarea></div><div class="actions"><button id="bulkAnalyze" class="btn btn-accent">⚡ تحليل الطلبات</button><label class="btn btn-soft" style="cursor:pointer">📄 استيراد محادثة واتساب<input id="bulkFile" type="file" accept=".txt,text/plain" style="display:none"></label><button id="bulkBack" class="btn btn-outline">رجوع</button></div><div id="bulkFileInfo" class="sub" style="margin-top:8px"></div></div><div id="bulkPreview"></div>`;
  document.getElementById('bulkBack').onclick=()=>newOrder();document.getElementById('bulkAnalyze').onclick=()=>analyze(store);const file=document.getElementById('bulkFile');file.onchange=async()=>{const picked=file.files?.[0];if(!picked)return;const info=document.getElementById('bulkFileInfo');try{if(picked.size>10*1024*1024)throw new Error('الملف أكبر من 10MB');const text=await picked.text();document.getElementById('bulkWA').value=text;info.textContent='تم تحميل '+picked.name+' — '+splitWhatsApp(text).length+' رسالة مكتشفة';analyze(store)}catch(e){info.textContent='تعذر قراءة الملف: '+(e.message||e)}};
 }
 function analyze(store){
  const raws=splitWhatsApp(document.getElementById('bulkWA')?.value||''),items=raws.map(preview),box=document.getElementById('bulkPreview');window.__bulkWAItems=items;
  if(!items.length){box.innerHTML='<div class="card empty">لم أجد رسائل واتساب منفصلة.</div>';return}
  const counts={new:0,edit:0,return:0};items.forEach(x=>counts[x.type]++);
  box.innerHTML=`<div class="card" style="margin-top:12px"><h3>تم العثور على ${items.length} رسالة</h3><div class="sub">${counts.new} طلب جديد • ${counts.edit} تعديل • ${counts.return} إرجاع</div></div>${items.map(x=>`<div class="card" style="margin-top:10px;border:${x.issues.length?'2px solid #d9a400':'1px solid #ddd'}"><div class="section-head"><b>#${x.i+1} — ${typeLabel(x.type)}</b><span>${x.issues.length?'⚠️ '+esc(x.issues.join('، ')):'جاهز للمراجعة'}</span></div><div class="grid form-grid" style="margin-top:10px"><div><b>الاسم</b><div>${esc(x.p.name||'لا يوجد')}</div></div><div><b>الهاتف</b><div>${esc(x.p.phone||'—')}</div></div><div><b>المنطقة</b><div>${esc(x.p.area||'—')}</div></div><div><b>السعر</b><div>${esc(String(x.p.amount||'—'))}</div></div></div><details style="margin-top:8px"><summary>النص الأصلي</summary><div class="sub" style="white-space:pre-wrap;margin-top:6px">${esc(x.raw)}</div></details></div>`).join('')}<div class="card" style="margin-top:12px"><b>نسخة التجربة الحالية: تحليل ومعاينة فقط</b><div class="sub">لن تحفظ أو تعدل أو ترجع أي طلب حتى نتأكد أن الفصل والقراءة صحيحة.</div></div>`;
 }
 new MutationObserver(()=>setTimeout(mount,30)).observe(document.documentElement,{childList:true,subtree:true});setInterval(mount,500);mount();
})();