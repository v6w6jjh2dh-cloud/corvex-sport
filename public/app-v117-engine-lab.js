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
   .el-clsgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:8px 0}
   @media(max-width:640px){.el-clsgrid{grid-template-columns:repeat(2,1fr)}.el-clsgrid .el-known{grid-column:1/-1}}
   .el-cls{border:0;border-radius:12px;padding:10px 6px;text-align:center;cursor:pointer;font:inherit;color:#0f172a}
   .el-cls b{display:block;font-size:24px}.el-cls span{font-size:12px;font-weight:600}
   .el-cls.on{outline:3px solid #0f172a33}
   .el-known{background:#dcfce7}.el-known b{color:#15803d}.el-missing{background:#ffedd5}.el-missing b{color:#c2410c}
   .el-learn{background:#fef9c3}.el-learn b{color:#a16207}.el-failure{background:#fee2e2}.el-failure b{color:#b91c1c}.el-unclear{background:#e5e7eb}.el-unclear b{color:#374151}
   .el-rates{font-size:14px;line-height:1.9;margin:6px 0 10px}
   .el-clsrow{padding:8px 0;border-bottom:1px solid rgba(127,127,127,.2)}
   .el-range-warn{margin:8px 0;padding:10px;border-radius:10px;background:#fef3c7;color:#92400e;font-size:14px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
   .el-more:disabled{opacity:.55}
   .el-diag{margin:6px 0 0;padding-inline-start:18px;font-size:13px;line-height:1.7}
   .el-ba{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0}.el-ba td,.el-ba th{padding:6px;border-bottom:1px solid rgba(127,127,127,.2);text-align:start}
   .el-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;vertical-align:middle}
   .el-export-box{margin:12px 0;padding:12px;border-radius:12px;border:1px dashed rgba(15,118,110,.5);background:rgba(15,118,110,.05)}
   .el-export-box .el-export{width:100%;font-size:16px;padding:12px}
   .el-export-ready{display:grid;gap:8px;margin-top:10px}.el-export-ready .btn{width:100%;font-size:15px}
   .el-copybox{margin:8px 0}.el-copybox textarea{width:100%;min-height:220px;font-size:12px;direction:rtl;box-sizing:border-box}
   .el-scope{font-size:13px;margin:10px 0;padding:8px 10px;border-radius:10px;background:rgba(15,118,110,.08)}
   .el-more{width:100%;margin:8px 0}
   .el-stats-3{grid-template-columns:repeat(3,1fr)}
   .el-filter{cursor:pointer;background:transparent;font:inherit;color:inherit}
   .el-filter.on{border-color:#0f766e;box-shadow:0 0 0 2px rgba(15,118,110,.25)}
   .el-tools{display:grid;grid-template-columns:1fr auto;gap:8px;margin:8px 0}
   .el-ulist{margin:0 -4px}
   .el-urow{padding:12px 6px;border-bottom:1px solid rgba(127,127,127,.2)}
   .el-uhead{display:flex;justify-content:space-between;align-items:center;gap:8px}
   .el-ulabel{font-size:17px;font-weight:700;word-break:break-word}
   .el-unear{font-size:14px;margin-top:4px;color:#b45309}
   .el-uorders{margin-top:6px;display:flex;flex-wrap:wrap;gap:8px;font-size:15px}
   @media(max-width:640px){
    #content .card:has(#elBody){padding:12px 10px}
    .el-stats-3 .el-stat b{font-size:20px}.el-stats-3 .el-stat span{font-size:11px}
    .el-tools{grid-template-columns:1fr}
   }
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
      <button class="btn btn-soft" data-tab="drafts">مسودات ناقصة</button>
     </div><div id="elBody"></div></div>`;
    c.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;paint()});
    checkFresh();
    paint();
  }
  // A page left open keeps the old code after a deploy: compare with the published page and offer a reload.
  const MY_VERSION=(document.querySelector('script[src*="app-v117-engine-lab.js"]')?.src.match(/[?&]v=([^&]+)/)||[])[1]||'';
  function checkFresh(){
    fetch('/index.html',{cache:'no-store'}).then(r=>r.text()).then(h=>{
      const live=(h.match(/app-v117-engine-lab\.js\?v=([^"&]+)/)||[])[1];
      if(live&&MY_VERSION&&live!==MY_VERSION&&!document.getElementById('elStale')){
        const b=document.createElement('div');b.id='elStale';b.className='el-range-warn';
        b.innerHTML='يوجد تحديث جديد لهذه الصفحة. <button class="btn btn-accent" type="button">إعادة التحميل</button>';
        b.querySelector('button').onclick=()=>location.reload();document.querySelector('#content .page-title')?.after(b);
      }
    }).catch(()=>{});
  }
  function paint(){
    document.querySelectorAll('.el-tabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    ({compare,unknown,knowledge,lexicon,drafts})[tab]();
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
  // ---- Scan state (pure, tested): one active scan per tab. A new scan replaces the old one; late responses of an
  // old scan, of another date range or for orders already counted are ignored. Counts are rebuilt from per-order
  // records keyed by order id, so an order can never be counted twice.
  const Scan={seq:0,current:{},
    start(kind,from,to){const s={id:++Scan.seq,kind,from,to,total:0,seen:new Set(),flags:new Map(),rows:new Map(),next:null,busy:false,started:false,
      classes:{known:new Map(),missing:new Map(),learn:new Map(),failure:new Map(),unclear:new Map()},groups:{products:new Map(),possible_aliases:new Map(),unclear:new Map()},show:null};
      Scan.current[kind]=s;return s},
    live:s=>Scan.current[s.kind]===s,
    accept(s,d){
      if(!Scan.live(s)||!d||d.from!==s.from||d.to!==s.to)return false;
      s.total=Number(d.total||0);s.next=d.batch?.next_cursor||null;s.started=true;
      if(s.kind==='compare'){
        for(const o of d.checked||[]){const id=Number(o.id);if(s.seen.has(id))continue;s.seen.add(id);s.flags.set(id,o.flags||[])}
        for(const r of d.rows||[])if(s.seen.has(Number(r.id)))s.rows.set(Number(r.id),r);
        for(const [k,v] of Object.entries(d.completeness||{}))for(const o of v.orders||[])if(s.seen.has(Number(o.id)))s.classes[k]?.set(Number(o.id),o);
      }else{
        for(const id of d.checked_ids||[])s.seen.add(Number(id));
        for(const k of Object.keys(s.groups))for(const g of d[k]||[]){
          const x=s.groups[k].get(g.key)||{key:g.key,label:g.label,near:g.near,orders:new Set(),variants:new Map(),examples:[]};
          const fresh=(g.order_ids||[]).filter(id=>!x.orders.has(id));for(const id of fresh)x.orders.add(id);
          if(fresh.length)for(const v of g.variants||[])x.variants.set(v.phrase,(x.variants.get(v.phrase)||0)+v.n);
          for(const e of g.examples||[])if(x.examples.length<8&&!x.examples.some(y=>y.id===e.id))x.examples.push(e);
          if(!x.near&&g.near)x.near=g.near;s.groups[k].set(g.key,x);
        }
      }
      return true;
    },
    counts(s){const c={};for(const f of s.flags.values())for(const k of f)c[k]=(c[k]||0)+1;return c},
    checked:s=>s.seen.size
  };
  window.__engineLabScan=Scan;
  const openOrder=root=>root.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>{if(typeof window.editOrder==='function')window.editOrder(Number(b.dataset.order))});

  // ---- 1) comparison old vs new (large ranges in batches; an order is never counted twice)
  const STOCK={different_field:'محرك المخزون يقرأ نص الطلب الكامل بينما الجديد يقرأ الملاحظات',not_in_stock_catalogue:'المنتج غير موجود في كتالوج المخزون',
   context_rule:'كلمة عامة بدون دليل منتج — لم تُخمَّن',quantity_convention:'طريقة كتابة كمية متعلَّمة',quantity_other_field:'الكمية مكتوبة في الحقل الآخر',
   bare_name_single:'اسم عام لقطعة واحدة',from_stock_allocation:'من الخصم المسجل في المخزون',allocation_changed_since_print:'الخصم المسجل وقت الطباعة يختلف عن قراءة اليوم',other:'سبب آخر'};
  const scopeNote=(d,checked)=>`<div class="el-scope">النطاق: طلبات كورفكس <b>المطبوعة</b> بين <bdi>${esc(d.from)}</bdi> و<bdi>${esc(d.to)}</bdi> (حسب تاريخ أول طباعة). تم فحص <b>${checked}</b> من <b>${esc(d.total)}</b> طلبًا.</div>`;
  function compare(){
    body().innerHTML=range('elCmp',3);
    const out=document.getElementById('elCmpOut');
    out.innerHTML='<div class="el-note">يقارن المحرك الجديد مع محرك الأرباح الحالي ومحرك المخزون. الفترات الكبيرة تُفحص على دفعات (150 طلبًا).</div>';
    const fetchBatch=async s=>{
      if(s.busy)return;s.busy=true;paintBusy();
      try{
        const d=await window.api(`/product-engine?view=compare&from=${encodeURIComponent(s.from)}&to=${encodeURIComponent(s.to)}&limit=150${s.next?'&before='+s.next:''}`);
        if(Scan.accept(s,d))paintCompare(out,s);
      }catch(e){if(Scan.live(s))out.innerHTML=`<div class="empty">تعذر الفحص: ${esc(e?.message||e)}</div>`}
      finally{s.busy=false;if(Scan.live(s))paintBusy()}
    };
    const paintBusy=()=>{const s=Scan.current.compare;out.querySelectorAll('.el-more').forEach(b=>{b.disabled=!!s?.busy;if(s?.busy)b.textContent='جاري فحص الدفعة...'})};
    document.getElementById('elCmpRun').onclick=()=>{
      const f=document.getElementById('elCmpFrom').value,t=document.getElementById('elCmpTo').value;
      if(!f||!t||f>t){out.innerHTML='<div class="empty">اختاري فترة صحيحة</div>';return}
      const s=Scan.start('compare',f,t);   // new scan: previous results and pending answers are dropped
      out.innerHTML='<div class="empty">جاري الفحص...</div>';fetchBatch(s);
    };
    out.addEventListener('click',e=>{const s=Scan.current.compare;if(e.target.classList?.contains('el-more')&&s&&s.next&&!rangeChanged('elCmp',s))fetchBatch(s)});
    lockRange('elCmp','compare',out);
  }
  // the batches of a scan always use the scan's own range; if the inputs change, «next batch» is disabled until a new scan
  const rangeChanged=(id,s)=>document.getElementById(id+'From')?.value!==s.from||document.getElementById(id+'To')?.value!==s.to;
  function lockRange(id,kind,out){
    const warn=()=>{const s=Scan.current[kind];if(!s)return;const changed=rangeChanged(id,s);
      out.querySelectorAll('.el-more,#elUnkMore').forEach(b=>{b.disabled=changed||s.busy});
      let n=out.querySelector('.el-range-warn');
      if(changed&&!n){n=document.createElement('div');n.className='el-range-warn';n.textContent='تغيّرت الفترة — اضغطي «فحص» لبدء فحص جديد. النتائج المعروضة للفترة السابقة.';out.prepend(n)}
      if(!changed&&n)n.remove()};
    for(const x of ['From','To'])document.getElementById(id+x)?.addEventListener('input',warn);
  }
  function paintCompare(out,acc){
    const n=Scan.counts(acc);acc.checked=Scan.checked(acc);
    const stat=(v,label,tone='')=>`<div class="el-stat ${v?tone:'ok'}"><b>${esc(v??0)}</b><span>${label}</span></div>`;
    const rows=[...acc.rows.values()];
    const K=acc.classes,cnt=k=>K[k].size,checked=acc.checked||0;
    const complete=checked?Math.round(100*(checked-cnt('missing'))/checked):0,judged=cnt('known')+cnt('failure')+cnt('learn');
    const engine=judged?Math.round(100*cnt('known')/judged):0;
    const card=k=>`<button class="el-cls el-${k} ${acc.show===k?'on':''}" data-cls="${k}"><b>${cnt(k)}</b><span>${CLS[k].t}</span></button>`;
    const shown=acc.show?[...K[acc.show].values()]:[];
    out.innerHTML=`${scopeNote(acc,acc.checked)}
     ${acc.next?`<button class="btn btn-soft el-more">فحص الدفعة التالية (${acc.total-acc.checked} متبقٍ)</button>`:''}
     <div class="el-sec">تصنيف الطلبات (اضغطي على الرقم لعرض الطلبات)</div>
     <div class="el-clsgrid">${['known','missing','learn','failure','unclear'].map(card).join('')}</div>
     <div class="el-rates"><div>اكتمال بيانات الطلبات: <b>${complete}%</b> <span class="el-muted">(${cnt('missing')} طلب بدون اسم منتج)</span></div>
      <div>نجاح المحرك في الطلبات التي فيها اسم منتج: <b>${engine}%</b> <span class="el-muted">(${cnt('known')} من ${judged})</span></div>
      <div class="el-note">الطلبات البرتقالية نقص في بيانات الطلب وليست خطأ في المحرك، ولا يُخمَّن منتجها من اللون أو السعر أو التاريخ.</div></div>
     ${exportBoxHtml(acc)}
     ${acc.show?`<div class="el-row"><div class="el-head"><b>${CLS[acc.show].t} (${shown.length})</b><button class="btn btn-soft" data-cls="">إخفاء</button></div>
       <div class="el-note">${CLS[acc.show].d}</div>
       ${shown.map(o=>`<div class="el-clsrow"><button class="el-order" data-order="${esc(o.id)}">#${esc(o.order_code)}</button>
        <span class="el-muted">${esc(WHY[o.reason]||o.reason)}${o.before&&o.before!==acc.show?` · قبل الإصلاح: ${esc(CLS[o.before]?.t||o.before)}`:''}</span>
        <div class="el-text">${esc(o.text)}</div>${diagHtml(o.diag)}</div>`).join('')||'<div class="el-muted">لا يوجد</div>'}</div>`:''}
     ${beforeAfterHtml(acc)}
     <div class="el-sec">المقارنة مع المحركات الحالية</div>
     <div class="el-stats">
      <div class="el-stat"><b>${esc(acc.checked)}</b><span>طلبات مفحوصة</span></div>
      ${stat(n.central_vs_profit_engine,'اختلاف مع محرك الأرباح','warn')}
      ${stat(n.cost_differences,'اختلاف في الكوست','bad')}
      ${stat(n.central_vs_print_engine,'اختلاف مع محرك المخزون','warn')}
      ${stat(n.central_needs_review,'تحتاج مراجعة (لم يُخمَّن)','warn')}
      ${stat(n.central_unrecognised,'لم يُتعرّف على منتج','warn')}
      ${stat(n.central_cost_unknown,'منتج معروف وكوسته غير معروف (الجديد)','warn')}
      ${stat(n.profit_cost_unknown,'منتج معروف وكوسته غير معروف (الحالي)','warn')}
     </div>
     <div class="el-note">«لم يُتعرّف على منتج» لا يدخل في «كوست غير معروف»: الكوست يُحسب فقط بعد معرفة المنتج.</div>
     ${rows.length?'':'<div class="empty">لا توجد اختلافات ✓</div>'}
     ${rows.map(r=>{
       const kinds=[...new Set([...(r.differences?.vs_profit_engine||[]),...(r.differences?.cost||[])])].filter(k=>DIFF[k]);
       const old=r.profit_engine_detail,cen=r.central||{};
       const costOf=(its,cost)=>!(its||[]).length?'لم يُتعرّف على منتج':money(cost);
       const stock=(r.differences?.vs_print_engine||[]).length||(r.stock_reasons||[]).length;
       return `<div class="el-row"><div class="el-head"><div><button class="el-order" data-order="${esc(r.id)}">#${esc(r.order_code)}</button> <span class="el-muted">${esc(r.ship_day||'')}</span></div>
         <div>${kinds.map(k=>`<span class="el-badge ${k==='cost'?'bad':''}">${DIFF[k]}</span>`).join('')}${r.needs_review?'<span class="el-badge">يحتاج مراجعة</span>':''}${stock?'<span class="el-badge">مخزون</span>':''}</div></div>
         <div class="el-text">${esc(r.text)}</div>
         <div class="el-cols">
          <div class="el-col"><h4>المحرك الحالي (الأرباح)</h4>${old?items(old.items)+`<div class="el-note">الكوست: <b>${costOf(old.items,old.cost)}</b></div>`:'<span class="el-muted">ليس في تقرير الأرباح</span>'}</div>
          <div class="el-col"><h4>المحرك الجديد</h4>${items(cen.items)}<div class="el-note">الكوست: <b>${costOf(cen.items,cen.cost)}</b></div>
           ${(r.uncertain||[]).length?`<div class="el-note">لم يُخمَّن: ${r.uncertain.map(u=>`«${esc(u.alias)}» (${REASON[u.reason]||esc(u.reason)})`).join('، ')}</div>`:''}</div>
         </div>
         ${stock?`<div class="el-col" style="margin-top:8px"><h4>المخزون (للعرض فقط — لا يُعدَّل)</h4>
           <div class="el-note">الخصم الفعلي المسجل: ${Object.entries(r.print_allocation||{}).map(([k,v])=>`${esc(k)} × ${esc(v)}`).join('، ')||'لا يوجد'}</div>
           <div class="el-note">قراءة محرك المخزون اليوم: ${Object.entries(r.print_engine||{}).map(([k,v])=>`${esc(k)} × ${esc(v)}`).join('، ')||'لا شيء'}</div>
           <div class="el-note">السبب: ${(r.stock_reasons||[]).map(x=>esc(STOCK[x]||x)).join('، ')||'—'}</div></div>`:''}
        </div>`}).join('')}
     ${acc.next?`<button class="btn btn-soft el-more">فحص الدفعة التالية (${acc.total-acc.checked} متبقٍ)</button>`:''}`;
    out.querySelectorAll('[data-cls]').forEach(b=>b.onclick=()=>{if(!Scan.live(acc))return;acc.show=b.dataset.cls||null;paintCompare(out,acc)});
    out.querySelectorAll('.el-export').forEach(b=>b.onclick=()=>prepareExport(acc,out));
    out.querySelectorAll('.el-save').forEach(b=>b.onclick=()=>saveExport(acc,b.dataset.fmt));
    out.querySelectorAll('.el-copy').forEach(b=>b.onclick=()=>showCopy(acc));
    openOrder(out);
  }
  // why an order is not green — evidence only
  const DIAG_REASON={personal_or_address_line:'في سطر اسم/عنوان/هاتف',no_product_evidence:'كلمة عامة بدون كمية أو لون أو مقاس'};
  const kv=o=>o?Object.entries(o).map(([k,v])=>`${esc(k)} × ${esc(v)}`).join('، '):'';
  function diagHtml(d){
    if(!d)return '';const L=[];
    if(d.near?.length)L.push('كتابة قريبة من منتج معروف: '+d.near.map(n=>`«${esc(n.phrase)}» ← ${esc(n.product)}`).join('، ')+' (تحتاج اعتماد اسم بديل، لا تُخمَّن)');
    if(d.names?.length)L.push('اسم غير موجود في الكتالوج: '+d.names.map(n=>`«${esc(n)}»`).join('، '));
    if(d.uncertain?.length)L.push('لم يُحتسب: '+d.uncertain.map(u=>`«${esc(u.word)}» (${esc(DIAG_REASON[u.reason]||u.reason)})`).join('، '));
    if(d.source)L.push(`المصدر ${esc(d.source.system)}: المنتج ${d.source.product?'«'+esc(d.source.product)+'»':'غير مذكور'}${d.source.color?' · اللون '+esc(d.source.color):''}${d.source.size?' · المقاس '+esc(d.source.size):''}${d.source.quantity!=null?' · الكمية '+esc(d.source.quantity):''}`);
    if(d.others?.profit)L.push('محرك الأرباح الحالي قرأ: '+kv(d.others.profit));
    if(d.others?.print)L.push('محرك المخزون يقرأ اليوم: '+kv(d.others.print));
    if(d.others?.allocation)L.push('الخصم المسجل في المخزون: '+kv(d.others.allocation));
    if(d.unclear?.length)L.push('نص غير مفهوم: '+d.unclear.map(u=>`«${esc(u)}»`).join('، '));
    return L.length?`<ul class="el-diag">${L.map(x=>`<li>${x}</li>`).join('')}</ul>`:'';
  }
  // the same orders read by the previous engine version and by this one
  function beforeAfterHtml(acc){
    const all=Object.entries(acc.classes).flatMap(([k,m])=>[...m.values()].map(o=>({now:k,before:o.before||k,o})));
    if(!all.length)return '';
    const keys=['known','missing','learn','failure','unclear'],b=Object.fromEntries(keys.map(k=>[k,0])),n=Object.fromEntries(keys.map(k=>[k,0]));
    for(const x of all){b[x.before]=(b[x.before]||0)+1;n[x.now]++}
    const changed=all.filter(x=>x.before!==x.now);
    return `<div class="el-sec">قبل الإصلاح وبعده (نفس الطلبات)</div>
     <table class="el-ba"><tr><th></th><th>قبل</th><th>بعد</th></tr>${keys.map(k=>`<tr><td><span class="el-dot el-${k}"></span>${CLS[k].t}</td><td>${b[k]}</td><td><b>${n[k]}</b></td></tr>`).join('')}</table>
     ${changed.length?`<div class="el-note">تغيّر تصنيف ${changed.length} طلب: ${changed.slice(0,40).map(x=>`<button class="el-order" data-order="${esc(x.o.id)}">#${esc(x.o.order_code)}</button> (${CLS[x.before].t} ← ${CLS[x.now].t})`).join('، ')}</div>`:'<div class="el-note">لم يتغير تصنيف أي طلب.</div>'}`;
  }
  // ---- Diagnosis report: every order of the scan range (all batches), personal data removed by the server.
  // Two taps on purpose: 1) prepare (fetch all batches) 2) save/share — Safari on iPhone only allows saving or
  // sharing a file directly from a tap, not after a long wait.
  const CLASS_AR={known:'منتج معروف',missing:'اسم المنتج مفقود',learn:'اسم جديد يحتاج تعلّمًا',failure:'فشل في منتج معروف',unclear:'تفاصيل غير مفهومة'};
  const COLS=[['order_code','رقم الطلب'],['class','التصنيف'],['reason','السبب'],['before','التصنيف قبل الإصلاح'],['unknown_names','أسماء غير معروفة'],['near','كتابة قريبة من منتج معروف'],
   ['not_counted','كلمات لم تُحتسب'],['unclear','نص غير مفهوم'],['source_system','مصدر الطلب'],['source_product','منتج المصدر'],['source_color','لون المصدر'],['source_size','مقاس المصدر'],
   ['source_quantity','كمية المصدر'],['engine_read','قراءة المحرك الجديد'],['profit_engine','محرك الأرباح'],['stock_engine','محرك المخزون اليوم'],['stock_deduction','الخصم المسجل'],
   ['stock_difference','اختلاف مخزون'],['stock_reasons','أسباب اختلاف المخزون'],['order_notes','الملاحظات (بدون بيانات شخصية)'],['raw_text','نص الطلب (بدون بيانات شخصية)']];
  const pairs=o=>o?Object.entries(o).map(([k,v])=>`${k} × ${v}`).join('، '):'';
  function diagnosisRecords(batches){
    const by=new Map();
    for(const d of batches){
      for(const [k,v] of Object.entries(d.completeness||{}))for(const o of v.orders||[]){const g=o.diag||{},src=g.source||{};
        by.set(Number(o.id),{...(by.get(Number(o.id))||{}),order_code:o.order_code,class:CLASS_AR[k]||k,reason:WHY[o.reason]||o.reason,before:CLASS_AR[o.before]||o.before||'',
          unknown_names:(g.names||[]).join('، '),near:(g.near||[]).map(n=>`${n.phrase} ← ${n.product}`).join('، '),
          not_counted:(g.uncertain||[]).map(u=>`${u.word} (${DIAG_REASON[u.reason]||u.reason})`).join('، '),unclear:(g.unclear||[]).join('، '),
          source_system:src.system||'',source_product:src.product||'',source_color:src.color||'',source_size:src.size||'',source_quantity:src.quantity??'',
          engine_read:(g.read||[]).map(i=>`${i.name} × ${i.quantity}`).join('، '),profit_engine:pairs(g.others?.profit),stock_engine:pairs(g.others?.print),stock_deduction:pairs(g.others?.allocation),
          order_notes:o.full_text?.order_notes??'',raw_text:o.full_text?.raw_text??''})}
      for(const r of d.rows||[])if((r.differences?.vs_print_engine||[]).length){const x=by.get(Number(r.id))||{order_code:r.order_code};
        x.stock_difference='نعم';x.stock_reasons=(r.stock_reasons||[]).map(k=>STOCK[k]||k).join('، ');x.stock_engine=pairs(r.print_engine);x.stock_deduction=pairs(r.print_allocation);
        if(r.full_text){x.order_notes=r.full_text.order_notes;x.raw_text=r.full_text.raw_text}by.set(Number(r.id),x)}
    }
    return [...by.values()];
  }
  function diagnosisCsv(records){
    const cell=v=>{const t=String(v??'').replace(/\r?\n/g,' ⏎ ');return /[",\n]/.test(t)||/^[=+\-@]/.test(t)?'"'+(/^[=+\-@]/.test(t)?"'":'')+t.replace(/"/g,'""')+'"':t};
    return '﻿'+[COLS.map(c=>cell(c[1])).join(','),...records.map(r=>COLS.map(([k])=>cell(r[k])).join(','))].join('\r\n');
  }
  window.__engineLabExport={diagnosisRecords,diagnosisCsv};
  function exportBoxHtml(acc){
    const e=acc.export;
    return `<div class="el-export-box"><button class="btn btn-accent el-export" type="button" ${e?.busy?'disabled':''}>${e?.busy?`جاري تجهيز التقرير... ${e.done} من ${acc.total}`:'⬇️ تنزيل تقرير التشخيص'}</button>
      <div class="el-note">كل طلبات الفترة <bdi>${esc(acc.from)}</bdi> – <bdi>${esc(acc.to)}</bdi> من كل الدفعات، بدون أسماء العملاء وهواتفهم وعناوينهم.</div>
      ${e?.ready?`<div class="el-export-ready"><b>التقرير جاهز (${e.count} طلب)</b>
        <button class="btn btn-accent el-save" data-fmt="csv" type="button">حفظ ملف CSV</button>
        <button class="btn btn-soft el-save" data-fmt="json" type="button">حفظ ملف JSON</button>
        <button class="btn btn-soft el-copy" type="button">عرض للنسخ</button></div>`:''}
      ${e?.error?`<div class="el-note" style="color:#b91c1c">تعذر تجهيز التقرير: ${esc(e.error)}</div>`:''}</div>`;
  }
  async function prepareExport(acc,out){
    if(acc.export?.busy)return;
    const s=Scan.start('export',acc.from,acc.to),batches=[];let next=null,guard=0,done=0;
    acc.export={busy:true,done:0};paintCompare(out,acc);
    try{
      do{const d=await window.api(`/product-engine?view=compare&from=${encodeURIComponent(s.from)}&to=${encodeURIComponent(s.to)}&limit=150&export=1${next?'&before='+next:''}`);
        if(!Scan.live(s)||d.from!==s.from||d.to!==s.to)return;
        batches.push(d);done+=d.batch.checked;next=d.batch.next_cursor;acc.export.done=done;
        const b=out.querySelector('.el-export');if(b)b.textContent=`جاري تجهيز التقرير... ${done} من ${d.total}`;
      }while(next&&++guard<60);
      const records=diagnosisRecords(batches),stamp=`${s.from}_${s.to}`;
      acc.export={ready:true,count:records.length,csv:diagnosisCsv(records),
        json:JSON.stringify({range:{from:s.from,to:s.to},engine:'shadow',generated_at:new Date().toISOString(),orders:records},null,1),name:`corvex-diagnosis-${stamp}`};
    }catch(e){acc.export={error:e?.message||String(e)}}
    if(Scan.live(acc))paintCompare(out,acc);
  }
  async function saveExport(acc,fmt){
    const e=acc.export;if(!e?.ready)return;
    const type=fmt==='csv'?'text/csv;charset=utf-8':'application/json',name=`${e.name}.${fmt}`,blob=new Blob([fmt==='csv'?e.csv:e.json],{type});
    // iPhone: the share sheet («حفظ في الملفات» / إرسال) works in Safari and in the home-screen app
    try{const file=new File([blob],name,{type});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return}}catch(err){if(err?.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);
  }
  function showCopy(acc){
    const e=acc.export;if(!e?.ready)return;
    const box=document.createElement('div');box.className='el-copybox';
    box.innerHTML=`<div class="el-head"><b>التقرير (CSV) — انسخيه</b><button class="btn btn-soft" type="button">إغلاق</button></div><textarea readonly></textarea>`;
    box.querySelector('textarea').value=e.csv.replace(/^﻿/,'');box.querySelector('button').onclick=()=>box.remove();
    document.querySelector('.el-export-box')?.after(box);box.querySelector('textarea').select();
  }
  const CLS={known:{t:'منتج معروف',d:'تعرّف المحرك على المنتج.'},missing:{t:'اسم المنتج مفقود',d:'فيه لون أو عدد أو مقاس بدون اسم منتج في النص والملاحظات وبيانات المصدر.'},
   learn:{t:'اسم جديد يحتاج تعلّمًا',d:'اسم منتج أو طريقة كتابة لم يتعلمها المحرك بعد.'},failure:{t:'فشل في منتج معروف',d:'محرك آخر أو الخصم المسجل أو مصدر الطلب يذكر منتجًا معروفًا لم يتعرف عليه المحرك الجديد.'},
   unclear:{t:'تفاصيل غير مفهومة',d:'لا يوجد ما يكفي للحكم — تحتاج مراجعة.'}};
  const WHY={recognised:'معروف',known_plus_new_name:'منتج معروف + اسم جديد',stock_deduction_names_product:'الخصم المسجل في المخزون يذكر منتجًا',other_engine_recognised:'محرك حالي تعرّف عليه',
   source_names_known_product:'مصدر الطلب يذكر منتجًا معروفًا',source_product_unknown:'مصدر الطلب يذكر اسمًا غير معروف',new_name:'اسم غير معروف',details_without_product:'لون/عدد بدون اسم منتج',unclear_text:'نص غير مفهوم',empty:'لا يوجد نص'};

  // ---- 2) unknown phrases: grouped, filtered, merged across batches
  const UKIND={products:{t:'منتجات جديدة محتملة',d:'عبارات معها كمية أو لون أو مقاس ولا تشبه أي منتج معروف'},
   possible_aliases:{t:'قد تكون اسمًا لمنتج معروف',d:'كتابة قريبة من منتج في الكتالوج — تحتاج تأكيد'},
   unclear:{t:'تفاصيل غير مفهومة',d:'نص في ملاحظات الطلب لا يحمل دليل منتج — للمراجعة فقط، دون تخمين'}};
  function unknown(){
    body().innerHTML=range('elUnk',30);
    const out=document.getElementById('elUnkOut');
    out.innerHTML='<div class="el-note">يحلل الطلب كاملًا ويفصل اسم المنتج عن الكمية واللون والمقاس والوزن والسعر والتاريخ والاسم والعنوان. الفترات الكبيرة على دفعات (300 طلب).</div>';
    let acc=null,filter='products',q='',min=1;
    const fetchBatch=async s=>{
      if(s.busy)return;s.busy=true;const more=document.getElementById('elUnkMore');if(more){more.disabled=true;more.textContent='جاري التحليل...'}
      try{
        const d=await window.api(`/product-engine?view=unknown&from=${encodeURIComponent(s.from)}&to=${encodeURIComponent(s.to)}&limit=300${s.next?'&before='+s.next:''}`);
        if(Scan.accept(s,d)){acc=s;paint()}
      }catch(e){if(Scan.live(s))out.innerHTML=`<div class="empty">تعذر التحليل: ${esc(e?.message||e)}</div>`}
      finally{s.busy=false}
    };
    const run=()=>{
      const f=document.getElementById('elUnkFrom').value,t=document.getElementById('elUnkTo').value;
      if(!f||!t||f>t){out.innerHTML='<div class="empty">اختاري فترة صحيحة</div>';return}
      const s=Scan.start('unknown',f,t);acc=null;out.innerHTML='<div class="empty">جاري التحليل...</div>';fetchBatch(s);
    };
    const paint=()=>{
      acc.checked=Scan.checked(acc);
      const list=[...acc.groups[filter].values()].map(g=>({...g,n:g.orders.size,vs:[...g.variants].sort((a,b)=>b[1]-a[1])}))
        .filter(g=>g.n>=min&&(!q||g.vs.some(([p])=>p.includes(q))||String(g.near?.name||'').includes(q))).sort((a,b)=>b.n-a.n);
      out.innerHTML=`${scopeNote(acc,acc.checked)}
       <div class="el-stats el-stats-3">${Object.entries(UKIND).map(([k,v])=>`<button class="el-stat el-filter ${filter===k?'on':''}" data-f="${k}"><b>${acc.groups[k].size}</b><span>${v.t}</span></button>`).join('')}</div>
       <div class="el-tools"><input id="elUnkQ" class="input" placeholder="بحث في العبارات" value="${esc(q)}">
        <select id="elUnkMin" class="select"><option value="1">كل العبارات</option><option value="2" ${min===2?'selected':''}>في طلبين فأكثر</option><option value="5" ${min===5?'selected':''}>في 5 طلبات فأكثر</option></select></div>
       <div class="el-note">${UKIND[filter].d}</div>
       ${list.length?'':'<div class="empty">لا توجد نتائج ✓</div>'}
       <div class="el-ulist">${list.map(g=>`<div class="el-urow"><div class="el-uhead"><span class="el-ulabel">${esc(g.vs[0]?.[0]||g.label)}</span><span class="el-badge">${g.n} طلب</span></div>
         ${g.near?`<div class="el-unear">قريب من: <b>${esc(g.near.name)}</b></div>`:''}
         ${g.vs.length>1?`<div class="el-list">${g.vs.slice(0,8).map(([p,c])=>`<span class="el-chip">${esc(p)}${c>1?` <small>×${c}</small>`:''}</span>`).join('')}</div>`:''}
         <div class="el-uorders">${g.examples.map(e=>`<button class="el-order" data-order="${esc(e.id)}">#${esc(e.order_code)}</button>`).join(' ')}${g.n>g.examples.length?` <span class="el-muted">+${g.n-g.examples.length}</span>`:''}</div></div>`).join('')}</div>
       ${acc.next?`<button id="elUnkMore" class="btn btn-soft el-more">تحليل الدفعة التالية (${acc.total-acc.checked} متبقٍ)</button>`:''}`;
      out.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;paint()});
      const qi=document.getElementById('elUnkQ');qi.oninput=()=>{q=qi.value.trim();const pos=qi.selectionStart;paint();const n=document.getElementById('elUnkQ');n.focus();n.setSelectionRange(pos,pos)};
      document.getElementById('elUnkMin').onchange=e=>{min=Number(e.target.value);paint()};
      const more=document.getElementById('elUnkMore');if(more)more.onclick=()=>{const s=Scan.current.unknown;if(s&&s.next&&!rangeChanged('elUnk',s))fetchBatch(s)};
      openOrder(out);
    };
    document.getElementById('elUnkRun').onclick=run;
    lockRange('elUnk','unknown',out);
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

  // ---- 5) incomplete manual orders saved as drafts (not orders). Opening one fills the normal new-order form;
  // saving that form creates the order the usual way and closes the draft.
  async function drafts(){
    loading();
    try{
      const d=await window.api('/order-drafts');
      body().innerHTML=`<div class="el-note">طلبات يدوية حُفظت كمسودة لأن اسم المنتج غير مكتوب. ليست طلبات: لا تُطبع ولا تدخل المخزون أو الأرباح.</div>
       ${d.drafts.length?'':'<div class="empty">لا توجد مسودات ✓</div>'}
       ${d.drafts.map(x=>`<div class="el-row"><div class="el-head"><b>${esc(x.payload.recipient_name||'بدون اسم')} · <bdi>${esc(x.payload.phone||'')}</bdi></b><span class="el-muted">${esc(x.created_at)}${x.creator?' · '+esc(x.creator):''}</span></div>
         <div class="el-text">${esc([x.payload.order_notes,x.payload.raw_text].filter(Boolean).join('\n'))}</div>
         <button class="btn btn-soft" data-draft="${esc(x.id)}">فتح في نموذج طلب جديد</button></div>`).join('')}`;
      body().querySelectorAll('[data-draft]').forEach(b=>b.onclick=async()=>{
        const x=d.drafts.find(y=>String(y.id)===b.dataset.draft);if(!x||typeof window.newOrder!=='function')return;
        await window.newOrder();
        const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}};
        set('store',x.payload.store_id);set('name',x.payload.recipient_name);set('phone',x.payload.phone);set('area',x.payload.area);
        set('address',x.payload.detailed_address);set('amount',x.payload.amount);set('notes',x.payload.order_notes);set('raw',x.payload.raw_text);
        window.__corvexDraftId=x.id;
      });
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
