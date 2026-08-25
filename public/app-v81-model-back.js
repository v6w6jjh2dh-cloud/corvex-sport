(()=>{
 const KEY='corvex_model_back';
 function saveOrigin(){
  try{sessionStorage.setItem(KEY,JSON.stringify({from:document.querySelector('#mpFrom')?.value||'',to:document.querySelector('#mpTo')?.value||''}))}catch{}
 }
 function clearOrigin(){try{sessionStorage.removeItem(KEY)}catch{}}
 function getOrigin(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}}
 function goModels(){
  const o=getOrigin();clearOrigin();
  if(typeof window.modelPerformanceView==='function'){
   window.modelPerformanceView();
   setTimeout(()=>{
    const f=document.querySelector('#mpFrom'),t=document.querySelector('#mpTo'),b=document.querySelector('#mpLoad');
    if(f&&o?.from)f.value=o.from;if(t&&o?.to)t.value=o.to;if(b)b.click();
   },120);
  }else show('orders');
 }
 document.addEventListener('click',e=>{
  const orderBtn=e.target.closest('.mp-open-order,.model-audit-open,.direct-audit-order');
  if(orderBtn&&state?.view==='model-performance')saveOrigin();
 },true);
 function patchBack(){
  const o=getOrigin();if(!o||state?.view!=='edit-order')return;
  const top=document.querySelector('#backToOrders'),bottom=document.querySelector('#cancelEditOrder');
  [top,bottom].forEach(btn=>{
   if(!btn||btn.dataset.modelBack==='1')return;
   btn.dataset.modelBack='1';
   btn.textContent='العودة لأداء الموديلات';
   btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();goModels()},true);
  });
 }
 new MutationObserver(()=>setTimeout(patchBack,0)).observe(document.documentElement,{childList:true,subtree:true});
 setInterval(patchBack,300);
 patchBack();
})();