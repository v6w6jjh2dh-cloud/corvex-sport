(()=>{
 const originalEdit=window.editOrder;
 if(typeof originalEdit!=='function')return;

 function backToModels(){
  if(typeof window.modelPerformanceView==='function'){
    window.modelPerformanceView();
    setTimeout(()=>{
      const f=document.querySelector('#mpFrom'),t=document.querySelector('#mpTo'),b=document.querySelector('#mpLoad');
      if(f&&window.__modelBackFrom)f.value=window.__modelBackFrom;
      if(t&&window.__modelBackTo)t.value=window.__modelBackTo;
      if(b)b.click();
    },80);
  }else show('orders');
 }

 window.editOrder=async function(id,source){
  const fromModels=source==='model-performance';
  if(fromModels){
    window.__modelBackFrom=document.querySelector('#mpFrom')?.value||'';
    window.__modelBackTo=document.querySelector('#mpTo')?.value||'';
  }
  const r=await originalEdit.call(this,id);
  if(fromModels){
    const top=document.querySelector('#backToOrders'),bottom=document.querySelector('#cancelEditOrder');
    [top,bottom].forEach(btn=>{if(btn){btn.textContent='العودة لأداء الموديلات';btn.onclick=backToModels}});
  }
  return r;
 };

 // Important: app-v73 uses its own lexical editOrder reference. Intercept the click
 // before that handler runs, then explicitly open with the model-performance source.
 document.addEventListener('click',e=>{
  const btn=e.target.closest('.mp-open-order');
  if(!btn||state?.view!=='model-performance')return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  window.__modelBackFrom=document.querySelector('#mpFrom')?.value||'';
  window.__modelBackTo=document.querySelector('#mpTo')?.value||'';
  window.editOrder(Number(btn.dataset.id),'model-performance');
 },true);
})();