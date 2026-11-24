// «مختبر المحرك الذكي» — admin-only, read-only page to inspect the central engine (shadow mode).
// Uses the app's existing authentication (api() sends the session token); the server enforces admin.
// Nothing here activates the engine or changes orders, stock or profits.
(()=>{
  const S=()=>{try{return state}catch{return window.state||{}}};
  const isAdmin=()=>S().user?.role==='admin';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'غير معروف':Number(v).toFixed(2);
  const day=d=>new Date(d.getTime()+3*3600e3).toISOString().slice(0,10);
  const items=list=>(list||[]).length?(list||[]).map(i=>`<span class="el-chip">${esc(i.name)} × <b>${esc(i.quantity)}</b></span>`).join(''):'<span class="el-muted">لا شيء</span>';
  const REASON={personal_or_address_line:'سطر اسم أو عنوان أو هاتف',no_product_evidence:'كلمة عامة بدون دليل منتج'};
  const DIFF={products:'منتجات',quantity:'كمية',cost:'كوست'};
  let tab='compare';

  const css=`<style id="engineLabCss">
   .el-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
   .el-tabs .btn.active{background:var(--accent,#075e54);color:#fff}
   .el-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}
   .el-stat{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:10px;text-align:center}
   .el-stat b{display:block;font-size:22px}.el-stat span{font-size:12px;opacity:.8}
   .el-stat.warn b{color:#d97706}.el-stat.bad b{color:#dc2626}.el-stat.ok b{color:#16a34a}
   .el-row{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:12px;margin:10px 0}
   .el-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
   .el-order{background:none;border:0;color:#0f766e;font-weight:700;font-size:15px;cursor:pointer;text-decoration:underline;padding:0}
   .el-badge{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;margin-inline-start:4px;background:rgba(217,119,6,.15);color:#b45309}
   .el-badge.bad{background:rgba(220,38,38,.12);color:#b91c1c}
   .el-text{white-space:pre-wrap;font-size:13px;opacity:.85;margin:8px 0;max-height:7.5em;overflow:auto;background:rgba(127,127,127,.08);border-radius:8px;padding:8px}
   .el-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
   @media(max-width:640px){.el-cols{grid-template-columns:1fr}}
   .el-col{border-radius:10px;padding:8px;background:rgba(127,127,127,.06)}
   .el-col h4{margin:0 0 6px;font-size:13px}
   .el-chip{display:inline-block;border:1px solid rgba(127,127,127,.3);border-radius:999px;padding:2px 9px;margin:2px;font-size:13px}
   .el-muted{opacity:.6;font-size:13px}
   .el-list{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 12px}
   .el-sec{margin:14px 0 4px;font-weight:700}
   .el-note{font-size:12px;opacity:.75;margin-top:6px}
   /* iOS Safari gives date inputs an intrinsic min-width that overflows the panel */
   #elBody .filter-group{min-width:0}
   #elBody input[type=date]{width:100%;max-width:100%;min-width:0;box-sizing:border-box;-webkit-appearance:none;appearance:none;display:block}
  </style>`;

  async function view(){
    if(!isAdmin())return;
    S().view='engine-lab';
    const c=document.getElementById('content');if(!c)return;
    c.innerHTML=css+`<div class="page-title"><div><h1>🧪 مختبر المحرك الذكي</h1><div class="sub">للقراءة والفحص فقط — المحرك الجديد غير مفعّل، ولا يغيّر الطلبات أو المخزون أو الأرباح.</div></div></div>
     <div class="card"><div class="el-tabs">
      <button class="btn btn-soft" data-tab="compare">المقارنة</button>
      <button class="btn btn-soft" data-tab="unknown">العبارات غير المعروفة</button>
      <button class="btn btn-soft" data-tab="knowledge">المعرفة التراكمية</button>
      <button class="btn btn-soft" data-tab="lexicon">معجم فهم الطلبات</button>
     </div><div id="elBody"></div></div>`;
    c.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;paint()});
    paint();
  }
  function paint(){
    document.querySelectorAll('.el-tabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    ({compare,unknown,knowledge,lexicon})[tab]();
  }
  const body=()=>document.getElementById('elBody');
  const loading=()=>{body().innerHTML='<div class="empty">جاري الفحص...</div>'};
  const failed=e=>{body().innerHTML=`<div class="empty">تعذر التحميل: ${esc(e?.message||e)}</div>`};
  function range(id,days){
    const now=new Date(),to=day(now),from=day(new Date(now.getTime()-(days-1)*86400e3));
    return `<div class="filter-panel"><div class="filter-group"><label>من</label><input id="${id}From" type="date" class="input" value="${from}"></div>
     <div class="filter-group"><label>إلى</label><input id="${id}To" type="date" class="input" value="${to}"></div>
     <div class="filter-actions"><button id="${id}Run" class="btn btn-accent">فحص</button></div></div><div id="${id}Out"></div>`;
  }
  const openOrder=root=>root.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>{if(typeof window.editOrder==='function')window.editOrder(Number(b.dataset.order))});

  // ---- 1) comparison old vs new
  function compare(){
    body().innerHTML=range('elCmp',3)+'';
    const out=document.getElementById('elCmpOut');
    out.innerHTML='<div class="el-note">يقارن قراءة المحرك الجديد مع محرك الأرباح الحالي ومحرك المخزون للطلبات المطبوعة في الفترة (حد أقصى 150 طلبًا).</div>';
    document.getElementById('elCmpRun').onclick=async()=>{
      out.innerHTML='<div class="empty">جاري الفحص...</div>';
      try{
        const f=document.getElementById('elCmpFrom').value,t=document.getElementById('elCmpTo').value;
        const d=await window.api(`/product-engine?view=compare&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&limit=150`);
        const n=d.counts||{};
        const stat=(v,label,tone='')=>`<div class="el-stat ${v?tone:'ok'}"><b>${esc(v??0)}</b><span>${label}</span></div>`;
        out.innerHTML=`<div class="el-stats">
          <div class="el-stat"><b>${esc(n.orders??0)}</b><span>طلبات مفحوصة</span></div>
          ${stat(n.central_vs_profit_engine,'اختلاف مع محرك الأرباح','warn')}
          ${stat(n.cost_differences,'اختلاف في الكوست','bad')}
          ${stat(n.central_vs_print_engine,'اختلاف مع محرك المخزون','warn')}
          ${stat(n.central_needs_review,'تحتاج مراجعة (لم يُخمَّن)','warn')}
          ${stat(n.central_unrecognised,'غير معروفة','warn')}
          ${stat(n.central_cost_unknown,'كوست غير معروف','warn')}
          ${stat(n.baseline_vs_profit_engine,'المحرك الأساسي ≠ الحالي','bad')}
         </div>
         ${(d.rows||[]).length?'':'<div class="empty">لا توجد اختلافات في هذه الفترة ✓</div>'}
         ${(d.rows||[]).map(r=>{
           const kinds=[...new Set([...(r.differences?.vs_profit_engine||[]),...(r.differences?.cost||[])])].filter(k=>DIFF[k]);
           const old=r.profit_engine_detail;
           return `<div class="el-row"><div class="el-head"><div><button class="el-order" data-order="${esc(r.id)}">#${esc(r.order_code)}</button> <span class="el-muted">${esc(r.ship_day||'')}</span></div>
             <div>${kinds.map(k=>`<span class="el-badge ${k==='cost'?'bad':''}">${DIFF[k]}</span>`).join('')}${r.needs_review?'<span class="el-badge">يحتاج مراجعة</span>':''}${(r.differences?.vs_print_engine||[]).length?'<span class="el-badge">مخزون</span>':''}</div></div>
             <div class="el-text">${esc(r.text)}</div>
             <div class="el-cols">
              <div class="el-col"><h4>المحرك الحالي (الأرباح)</h4>${old?items(old.items)+`<div class="el-note">الكوست: <b>${money(old.cost)}</b></div>`:'<span class="el-muted">ليس في تقرير الأرباح</span>'}</div>
              <div class="el-col"><h4>المحرك الجديد</h4>${items(r.central?.items)}<div class="el-note">الكوست: <b>${money(r.central?.cost)}</b></div>
               ${(r.uncertain||[]).length?`<div class="el-note">لم يُخمَّن: ${r.uncertain.map(u=>`«${esc(u.alias)}» (${REASON[u.reason]||esc(u.reason)})`).join('، ')}</div>`:''}</div>
             </div>
             <div class="el-note">محرك المخزون (الطباعة): ${Object.entries(r.print_engine||{}).map(([k,v])=>`${esc(k)} × ${esc(v)}`).join('، ')||'لا شيء'}</div>
            </div>`}).join('')}`;
        openOrder(out);
      }catch(e){out.innerHTML=`<div class="empty">تعذر الفحص: ${esc(e?.message||e)}</div>`}
    };
  }

  // ---- 2) unknown phrases
  function unknown(){
    body().innerHTML=range('elUnk',30);
    const out=document.getElementById('elUnkOut');
    out.innerHTML='<div class="el-note">عبارات تشبه منتجًا (معها كمية) ولم يتعرف عليها المحرك — منتجات جديدة أو أسماء بديلة تحتاج تعليمًا.</div>';
    document.getElementById('elUnkRun').onclick=async()=>{
      out.innerHTML='<div class="empty">جاري الفحص...</div>';
      try{
        const f=document.getElementById('elUnkFrom').value,t=document.getElementById('elUnkTo').value;
        const d=await window.api(`/product-engine?view=unknown&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`);
        out.innerHTML=`<div class="el-stats"><div class="el-stat"><b>${esc(d.orders)}</b><span>طلبات مفحوصة</span></div><div class="el-stat ${d.candidates.length?'warn':'ok'}"><b>${esc(d.candidates.length)}</b><span>عبارات غير معروفة</span></div></div>
         ${d.candidates.length?'':'<div class="empty">لا توجد عبارات غير معروفة ✓</div>'}
         ${d.candidates.map(c=>`<div class="el-row"><div class="el-head"><b>«${esc(c.phrase)}»</b><span class="el-badge">${esc(c.orders)} طلب</span></div>
          <div class="el-note">أمثلة: ${c.examples.map(e=>`<button class="el-order" data-order="${esc(e.id)}">#${esc(e.order_code)}</button>`).join(' ')}</div></div>`).join('')}`;
        openOrder(out);
      }catch(e){out.innerHTML=`<div class="empty">تعذر الفحص: ${esc(e?.message||e)}</div>`}
    };
  }

  // ---- 3) accumulated knowledge
  async function knowledge(check=false){
    loading();
    try{
      const d=await window.api('/product-engine?view=knowledge'+(check?'&check=1':''));
      const sc=d.self_check;
      body().innerHTML=`<div class="el-head"><div class="el-note">الإصدار: <bdi dir="ltr">${esc(d.knowledge_version)}</bdi></div><button id="elSelf" class="btn btn-soft">فحص ذاتي لكل الأسماء</button></div>
       ${sc?(sc.ok?'<div class="el-stat ok" style="margin:10px 0"><b>✓</b><span>كل الأسماء تذهب لمنتجها</span></div>':`<div class="el-row"><b>أسماء لا تذهب لمنتجها (${sc.failures.length})</b>${sc.failures.map(f=>`<div class="el-note">«${esc(f.alias)}» → ${esc((f.got||[]).join('، ')||'لا شيء')}</div>`).join('')}</div>`):''}
       <div class="el-sec">المنتجات في الكتالوج (${d.catalogue.length})</div>
       ${d.catalogue.map(p=>`<div class="el-row"><div class="el-head"><b>${esc(p.name)}</b><span class="el-muted">${p.in_database?'في قاعدة البيانات':'من البذرة/القائمة'} · ${p.aliases.length} اسم</span></div>
         <div class="el-list">${p.aliases.slice(0,40).map(a=>`<span class="el-chip">${esc(a)}</span>`).join('')}${p.aliases.length>40?`<span class="el-muted">+${p.aliases.length-40}</span>`:''}</div></div>`).join('')}
       <div class="el-sec">طرق كتابة الكمية (${d.quantity_rules.length})</div>
       ${d.quantity_rules.map(q=>`<div class="el-row"><b>${esc(q.description)}</b><div class="el-note">مثال: ${q.examples.map(e=>`«${esc(e[0])}» = ${esc(e[1])}`).join('، ')}</div></div>`).join('')}
       <div class="el-sec">حمايات منع الخطأ والتكرار (${d.guards.length})</div>
       ${d.guards.map(g=>`<div class="el-row">${esc(g.description)}</div>`).join('')}`;
      document.getElementById('elSelf').onclick=()=>knowledge(true);
    }catch(e){failed(e)}
  }

  // ---- 4) lexicon
  async function lexicon(){
    loading();
    try{
      const d=await window.api('/product-engine?view=lexicon');const L=d.effective.lexicon,K=d.effective.learned||{};
      const group=(title,list)=>`<div class="el-sec">${title}</div><div class="el-list">${(list||[]).map(w=>`<span class="el-chip">${esc(w)}</span>`).join('')||'<span class="el-muted">—</span>'}</div>`;
      const pairs=o=>Object.entries(o||{}).map(([w,q])=>`${w} = ${q}`);
      const STATUS={pending:'بانتظار الاعتماد',approved:'معتمدة',rejected:'مرفوضة',disabled:'معطلة'};
      body().innerHTML=`<div class="el-note">لغة كتابة الطلبات العامة لكورفكس — مستقلة عن أسماء المنتجات. الإصدار <bdi dir="ltr">${esc(d.language_version)}</bdi>.</div>
       ${group('كلمات الكمية',L.quantityLabels)}${group('الوحدات',L.unitWords)}${group('الأرقام بالكلمات',pairs(L.numberWords))}
       ${group('الألوان (كل لون قطعة)',L.colours)}${group('كلمات ليست منتجًا (سعر، وزن، عنوان…)',L.metaWords)}
       ${group('كلمات الإرجاع والتبديل',L.operationWords)}${group('علامات الأسماء في بداية السطر',L.personalMarkers)}
       ${group('كلمات العنوان',L.addressWords)}${group('المقاسات',L.sizeWords)}
       ${group('أخطاء إملائية متعلَّمة',pairs(K.typos))}${group('كلمات تعني كمية',pairs(K.inlinePairWords))}
       ${group('عبارات تعني كمية',(K.phraseQuantities||[]).map(p=>`${p.phrase} = ${p.quantity}`))}
       <div class="el-sec">قواعد خاصة بكورفكس (${d.entries.length})</div>
       ${d.entries.length?d.entries.map(e=>`<div class="el-row"><div class="el-head"><b>«${esc(e.value_raw)}»</b><span class="el-badge">${esc(STATUS[e.status]||e.status)}</span></div><div class="el-note">${esc(d.kinds[e.kind]?.label||e.kind)}${e.data?.quantity?' = '+esc(e.data.quantity):''}${e.decided_at?' · '+esc(e.decided_at):''}</div></div>`).join(''):'<div class="el-muted">لا توجد قواعد مضافة بعد.</div>'}`;
    }catch(e){failed(e)}
  }

  function nav(){
    if(!isAdmin())return;
    const n=document.querySelector('.sidebar .nav');if(!n||document.getElementById('engineLabNav'))return;
    const b=document.createElement('button');b.id='engineLabNav';b.type='button';b.textContent='🧪 مختبر المحرك الذكي';
    b.onclick=()=>{view();document.querySelector('.sidebar')?.classList.remove('open');document.querySelector('#sidebarOverlay')?.classList.remove('show')};
    const anchor=n.querySelector('[data-view="inventory"]');anchor?anchor.after(b):n.appendChild(b);
  }
  new MutationObserver(nav).observe(document.documentElement,{childList:true,subtree:true});nav();
  window.engineLabView=view;
})();
