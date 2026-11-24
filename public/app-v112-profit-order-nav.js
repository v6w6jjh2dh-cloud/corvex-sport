// Clickable order numbers inside the profit report and model performance, with a
// «العودة إلى تقرير الأرباح» button (and the browser back button) that restores the
// exact report: same date/filters, same open sections, same scroll position, and the
// same order link at the same place on screen. Navigation only — no report logic here.
(()=>{
  const PROFIT_VIEWS={
    'daily-profits':{open:()=>window.dailyProfitsView(),reload:()=>{document.querySelector('#reloadCohort')?.click();document.querySelector('#loadProfits')?.click()},skip:new Set(['cohortAdSpend'])},
    'model-performance':{open:()=>window.modelPerformanceView(),reload:()=>document.querySelector('#mpLoad')?.click(),skip:new Set(),
      // Model cards open their order list on click (not <details>); remember which were open.
      capture:()=>({models:[...document.querySelectorAll('.model-audit-card')].filter(c=>c.querySelector('.model-audit-list')).map(c=>c.dataset.model),unclassified:Boolean(document.getElementById('mpUnclassifiedList')?.innerHTML)}),
      restore:x=>{for(const m of x?.models||[]){const c=[...document.querySelectorAll('.model-audit-card')].find(c=>c.dataset.model===m);if(c&&!c.querySelector('.model-audit-list'))c.click()}if(x?.unclassified&&!document.getElementById('mpUnclassifiedList')?.innerHTML)document.getElementById('mpUnclassified')?.click()}}
  };
  const BACK_LABEL='العودة إلى تقرير الأرباح';
  let saved=null,restoring=false,navBypass=false;
  // `state` is a top-level let/const in app-v62.js (not a window property).
  const S=()=>{try{return state}catch{return window.state||{}}};
  const content=()=>document.querySelector('#content');
  const isProfitView=()=>Boolean(PROFIT_VIEWS[S().view]);

  // ---------- order number → order id
  const idByCode=code=>{
    code=String(code);
    const cohort=(window.__cohortOrders||[]).find(o=>String(o.order_code)===code);if(cohort)return Number(cohort.id);
    for(const r of window.__modelPerformanceRows||[]){const it=(r.items||[]).find(i=>String(i.code)===code);if(it)return Number(it.id)}
    const un=(window.__modelPerformanceUnclassified||[]).find(o=>String(o.order_code)===code);if(un)return Number(un.id);
    const card=document.querySelector(`.profit-order-card[data-code="${CSS.escape(code)}"]`);if(card)return Number(card.dataset.id);
    return 0;
  };
  async function resolveId(code){
    const known=idByCode(code);if(known)return known;
    const d=await window.api('/returns/order?code='+encodeURIComponent(code));
    return Number(d?.order?.id||0);
  }

  // ---------- turn "#10403" text into links
  const SKIP='A,BUTTON,SELECT,OPTION,TEXTAREA,INPUT,SCRIPT,STYLE,LABEL';
  function linkify(root){
    if(!root||!isProfitView())return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
      if(!/#\d{3,7}/.test(n.nodeValue))return NodeFilter.FILTER_REJECT;
      const p=n.parentElement;if(!p||p.closest(SKIP)||p.closest('.order-link,[contenteditable="true"],.no-order-link'))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT}});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes){
      const frag=document.createDocumentFragment(),text=n.nodeValue;let last=0;
      text.replace(/#(\d{3,7})(?!\d)/g,(m,code,i)=>{
        frag.append(text.slice(last,i));
        const b=document.createElement('button');b.type='button';b.className='order-link';b.dataset.orderCode=code;
        b.title='فتح تفاصيل الطلب #'+code;b.setAttribute('aria-label','فتح تفاصيل الطلب #'+code);
        b.innerHTML='#'+code+'<span class="order-link-icon" aria-hidden="true">↗</span>';
        frag.append(b);last=i+m.length;return m});
      frag.append(text.slice(last));n.replaceWith(frag);
    }
  }
  let queued=false;
  const observer=new MutationObserver(()=>{if(queued||!isProfitView())return;queued=true;requestAnimationFrame(()=>{queued=false;linkify(content())})});
  // Observe the whole app: #content is re-created after login/layout renders.
  function watch(){if(document.body&&!document.body.__orderNavWatched){document.body.__orderNavWatched=true;observer.observe(document.body,{childList:true,subtree:true,characterData:true})}}

  // ---------- capture and restore the report state
  // Existing order buttons (model performance) are opened by other scripts; remember the
  // pressed one so its position can be restored too.
  let lastPressed=null;
  document.addEventListener('pointerdown',e=>{const b=e.target.closest?.('.order-link,.order-code-link,.profit-order-card .section-head b');if(b)lastPressed={el:b,at:Date.now()}},true);
  const anchorSelector=el=>el.classList.contains('order-link')?`.order-link[data-order-code="${el.dataset.orderCode}"]`:el.dataset.id?`.order-code-link[data-id="${el.dataset.id}"]`:'.order-link';
  const pathOf=el=>{const parts=[];while(el&&el!==document.body&&el.parentElement){parts.unshift([...el.parentElement.children].indexOf(el));el=el.parentElement}return parts.join('.')};
  const byPath=path=>path.split('.').reduce((el,i)=>el?.children?.[Number(i)]||null,document.body);
  function capture(link,orderId){
    const c=content(),view=S().view;
    const inputs={};c.querySelectorAll('input[id],select[id]').forEach(el=>{if(!PROFIT_VIEWS[view].skip.has(el.id))inputs[el.id]=el.value});
    const details=[...c.querySelectorAll('details')].map((d,i)=>({i,key:(d.querySelector('summary')?.textContent||'').replace(/[\d.,٠-٩]+/g,'#').trim(),open:d.open}));
    const scrolls=[...document.querySelectorAll('*')].filter(el=>el.scrollTop>0&&el!==document.scrollingElement).map(el=>({path:pathOf(el),top:el.scrollTop}));
    let anchor=null;
    if(!link&&lastPressed&&Date.now()-lastPressed.at<3000&&c.contains(lastPressed.el))link=lastPressed.el;
    if(link){const selector=anchorSelector(link);const all=[...c.querySelectorAll(selector)];anchor={selector,nth:Math.max(0,all.indexOf(link)),top:link.getBoundingClientRect().top}}
    const extra=PROFIT_VIEWS[view].capture?.()||null;
    saved={view,inputs,details,scrolls,extra,windowY:window.scrollY,docY:document.scrollingElement?.scrollTop||0,anchor,orderId,at:Date.now()};
    try{sessionStorage.setItem('corvex_profit_nav',JSON.stringify(saved))}catch{}
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function settled(timeout=12000){
    // Wait until loading texts are gone and the DOM has been quiet for a moment.
    let last=Date.now();const mo=new MutationObserver(()=>last=Date.now());mo.observe(content(),{childList:true,subtree:true,characterData:true});
    const start=Date.now();
    try{while(Date.now()-start<timeout){const busy=/جاري|جارٍ/.test(content().textContent.slice(0,40000));if(!busy&&Date.now()-last>450)return;await sleep(100)}}finally{mo.disconnect()}
  }
  async function restore(){
    let s=saved;if(!s){try{s=JSON.parse(sessionStorage.getItem('corvex_profit_nav')||'null')}catch{}}
    if(!s||!PROFIT_VIEWS[s.view])return window.show?.('daily-profits');
    restoring=true;
    try{
      const v=PROFIT_VIEWS[s.view];
      S().view=s.view;
      document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===s.view));
      await v.open();watch();await settled();
      const c=content();
      let changed=false;
      for(const [id,value] of Object.entries(s.inputs||{})){const el=c.querySelector('#'+CSS.escape(id));if(el&&el.value!==value){el.value=value;changed=true}}
      if(changed){v.reload();await sleep(60);await settled()}
      linkify(c);
      v.restore?.(s.extra);await sleep(30);
      const ds=[...c.querySelectorAll('details')];
      for(const d of s.details||[]){const byKey=ds.filter(x=>(x.querySelector('summary')?.textContent||'').replace(/[\d.,٠-٩]+/g,'#').trim()===d.key);const el=byKey.length===1?byKey[0]:ds[d.i];if(el)el.open=d.open}
      await sleep(30);
      for(const sc of s.scrolls||[]){const el=byPath(sc.path);if(el)el.scrollTop=sc.top}
      if(document.scrollingElement)document.scrollingElement.scrollTop=s.docY;window.scrollTo(0,s.windowY);
      if(s.anchor){
        const link=[...c.querySelectorAll(s.anchor.selector)][s.anchor.nth]||c.querySelector(s.anchor.selector);
        if(link){
          // Inner scroll boxes first, then the page, so the link sits where it was.
          let box=link.parentElement;while(box&&box!==document.body){if(box.scrollHeight>box.clientHeight+2&&/(auto|scroll)/.test(getComputedStyle(box).overflowY)){const r=link.getBoundingClientRect(),br=box.getBoundingClientRect();if(r.top<br.top||r.bottom>br.bottom)box.scrollTop+=r.top-br.top-40}box=box.parentElement}
          const delta=link.getBoundingClientRect().top-s.anchor.top;
          if(Math.abs(delta)>1){const se=document.scrollingElement;if(se&&se.scrollHeight>se.clientHeight)se.scrollTop+=delta;else window.scrollBy(0,delta)}
          link.classList.add('order-link-flash');setTimeout(()=>link.classList.remove('order-link-flash'),1800);
        }
      }
    }finally{restoring=false}
  }

  // ---------- open order, back button, browser back
  async function openOrder(link){
    const code=link.dataset.orderCode;link.classList.add('order-link-busy');
    try{const id=Number(link.closest('.profit-order-card')?.dataset.id||0)||await resolveId(code);if(!id)throw Error('لم يتم العثور على الطلب #'+code);await window.editOrder(id,{fromProfitLink:link})}
    catch(e){(window.toast||alert)(e.message)}
    finally{link.classList.remove('order-link-busy')}
  }
  document.addEventListener('click',e=>{const link=e.target.closest?.('.order-link');if(!link||!isProfitView())return;e.preventDefault();e.stopPropagation();openOrder(link)},true);
  // Sidebar navigation is an explicit choice: never redirect it back to the report.
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view]'))navBypass=true;setTimeout(()=>navBypass=false,0)},true);

  function decorateEditPage(){
    for(const sel of ['#backToOrders','#cancelEditOrder']){
      const b=document.querySelector(sel);if(!b)continue;
      b.textContent='→ '+BACK_LABEL;b.classList.add('back-to-profit');
      b.onclick=e=>{e.preventDefault();goBack()};
    }
  }
  function goBack(){if(history.state&&history.state.corvexProfitNav)history.back();else restore()}

  const originalEdit=window.editOrder;
  if(typeof originalEdit==='function'){
    window.editOrder=async function(id,options){
      const fromProfit=isProfitView();
      if(fromProfit){
        const link=options?.fromProfitLink||null;
        capture(link,Number(id));
        try{history.pushState({corvexProfitNav:1,orderId:Number(id)},'')}catch{}
      }
      const result=await originalEdit.call(this,id);
      if(fromProfit&&S().view==='edit-order'){decorateEditPage();window.scrollTo(0,0);if(document.scrollingElement)document.scrollingElement.scrollTop=0}
      return result;
    };
  }
  // Saving the order calls show('orders'); go back to the report instead.
  const originalShow=window.show;
  if(typeof originalShow==='function'){
    window.show=function(v,...rest){
      if(saved&&!navBypass&&!restoring&&S().view==='edit-order'&&v==='orders'&&document.querySelector('.back-to-profit')){goBack();return}
      return originalShow.call(this,v,...rest);
    };
  }
  window.addEventListener('popstate',()=>{if(S().view==='edit-order'&&saved)restore()});

  // ---------- look
  const style=document.createElement('style');
  style.textContent=`.order-link{display:inline-flex;align-items:center;gap:3px;border:0;background:#eef5fb;color:#145082;font:inherit;font-weight:700;padding:1px 7px;border-radius:999px;cursor:pointer;line-height:1.6;text-decoration:none;transition:background .15s}
  .order-link:hover,.order-link:focus-visible{background:#dcebf8;outline:none}
  .order-link-icon{font-size:.75em;opacity:.7}
  .order-link-busy{opacity:.55;pointer-events:none}
  .order-link-flash{box-shadow:0 0 0 3px rgba(20,80,130,.25);background:#fff4d6}
  .back-to-profit{font-weight:700}
  .order-code-link.mp-open-order::after,.order-code-link.mp-open-unclassified::after{content:' ↗';font-size:.75em;opacity:.7}`;
  document.head.appendChild(style);
  watch();document.addEventListener('DOMContentLoaded',watch);
  window.__corvexProfitNav={restore,linkify};
})();
