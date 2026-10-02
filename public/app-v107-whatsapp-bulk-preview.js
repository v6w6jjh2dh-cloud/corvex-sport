(()=>{
 function splitWhatsApp(text=''){
  const src=String(text||'').replace(/\r/g,'');
  const re=/^\s*\[[^\]\n]+\]\s*[^:\n]+:\s*/gm,ms=[...src.matchAll(re)];
  if(!ms.length)return src.trim()?[src.trim()]:[];
  const out=[];for(let i=0;i<ms.length;i++){const start=ms[i].index+ms[i][0].length,end=i+1<ms.length?ms[i+1].index:src.length,body=src.slice(start,end).replace(/\s*<تم تعديل هذه الرسالة>\s*$/,'').trim();if(body)out.push(body)}return out;
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
  host.innerHTML=`<div class="page-title"><div><h1>إدخال عدة طلبات واتساب</h1><div class="sub">الصق الرسائل كما نسختها من واتساب — لن يتم الحفظ قبل المراجعة.</div></div></div><div class="card"><div class="field"><label>رسائل واتساب</label><textarea id="bulkWA" class="textarea" style="min-height:280px" placeholder="[30/9/2026، 7:58 م] رقمي شغل توصيل: ..."></textarea></div><div class="actions"><button id="bulkAnalyze" class="btn btn-accent">⚡ تحليل الطلبات</button><button id="bulkBack" class="btn btn-outline">رجوع</button></div></div><div id="bulkPreview"></div>`;
  document.getElementById('bulkBack').onclick=()=>newOrder();document.getElementById('bulkAnalyze').onclick=()=>analyze(store);
 }
 function analyze(store){
  const raws=splitWhatsApp(document.getElementById('bulkWA')?.value||''),items=raws.map(preview),box=document.getElementById('bulkPreview');window.__bulkWAItems=items;
  if(!items.length){box.innerHTML='<div class="card empty">لم أجد رسائل واتساب منفصلة.</div>';return}
  const counts={new:0,edit:0,return:0};items.forEach(x=>counts[x.type]++);
  box.innerHTML=`<div class="card" style="margin-top:12px"><h3>تم العثور على ${items.length} رسالة</h3><div class="sub">${counts.new} طلب جديد • ${counts.edit} تعديل • ${counts.return} إرجاع</div></div>${items.map(x=>`<div class="card" style="margin-top:10px;border:${x.issues.length?'2px solid #d9a400':'1px solid #ddd'}"><div class="section-head"><b>#${x.i+1} — ${typeLabel(x.type)}</b><span>${x.issues.length?'⚠️ '+esc(x.issues.join('، ')):'جاهز للمراجعة'}</span></div><div class="grid form-grid" style="margin-top:10px"><div><b>الاسم</b><div>${esc(x.p.name||'لا يوجد')}</div></div><div><b>الهاتف</b><div>${esc(x.p.phone||'—')}</div></div><div><b>المنطقة</b><div>${esc(x.p.area||'—')}</div></div><div><b>السعر</b><div>${esc(String(x.p.amount||'—'))}</div></div></div><details style="margin-top:8px"><summary>النص الأصلي</summary><div class="sub" style="white-space:pre-wrap;margin-top:6px">${esc(x.raw)}</div></details></div>`).join('')}<div class="card" style="margin-top:12px"><b>نسخة التجربة الحالية: تحليل ومعاينة فقط</b><div class="sub">لن تحفظ أو تعدل أو ترجع أي طلب حتى نتأكد أن الفصل والقراءة صحيحة.</div></div>`;
 }
 new MutationObserver(()=>setTimeout(mount,30)).observe(document.documentElement,{childList:true,subtree:true});setInterval(mount,500);mount();
})();