(()=>{
 function openModels(){if(typeof window.modelPerformanceView==='function')return window.modelPerformanceView();toast('جاري تحميل أداء الموديلات، جرّب مرة ثانية')}
 function install(){
  const nav=document.querySelector('.sidebar .nav');if(!nav)return;
  let b=document.getElementById('modelPerformanceNav');
  if(!b){b=document.createElement('button');b.id='modelPerformanceNav';b.type='button';b.innerHTML='📊 أداء الموديلات';b.onclick=()=>{openModels();document.querySelector('.sidebar')?.classList.remove('open');document.querySelector('#sidebarOverlay')?.classList.remove('show')};const reports=[...nav.querySelectorAll('button')].find(x=>x.textContent.includes('الكشوفات'));if(reports)reports.before(b);else nav.appendChild(b)}
 }
 const originalRenderShell=window.renderShell;
 if(typeof originalRenderShell==='function')window.renderShell=function(){const r=originalRenderShell.apply(this,arguments);setTimeout(install,0);return r};
 new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
 setInterval(()=>{if(state?.user)install()},1000);install();
})();
