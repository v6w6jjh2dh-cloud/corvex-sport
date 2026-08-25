(()=>{
  const VERSION='20260825-direct-hard-v102';
  document.querySelectorAll('#directOrdersNav,#directOrdersBtn,#directOrdersQuickBtn').forEach(x=>x.remove());
  fetch('/app-v68-direct-orders.js?hard='+VERSION+'-'+Date.now(),{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('تعذر تحميل نظام المباشر');return r.text()})
    .then(code=>{eval(code);window.__corvexDirectVersion=VERSION;})
    .catch(err=>{console.error('Direct orders load failed',err);});
})();
