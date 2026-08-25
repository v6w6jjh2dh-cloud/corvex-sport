(()=>{
 const originalEdit=window.editOrder;
 if(typeof originalEdit!=='function')return;
 window.editOrder=async function(id){
  const fromModels=state?.view==='model-performance';
  if(fromModels){window.__returnToModelPerformance=true;window.__modelBackFrom=document.querySelector('#mpFrom')?.value||'';window.__modelBackTo=document.querySelector('#mpTo')?.value||''}
  const r=await originalEdit.apply(this,arguments);
  if(!window.__returnToModelPerformance)return r;
  const goBack=()=>{window.__returnToModelPerformance=false;if(typeof window.modelPerformanceView==='function'){window.modelPerformanceView();setTimeout(()=>{const f=document.querySelector('#mpFrom'),t=document.querySelector('#mpTo'),b=document.querySelector('#mpLoad');if(f&&window.__modelBackFrom)f.value=window.__modelBackFrom;if(t&&window.__modelBackTo)t.value=window.__modelBackTo;if(b)b.click()},80)}else show('orders')};
  const top=document.querySelector('#backToOrders'),bottom=document.querySelector('#cancelEditOrder');
  [top,bottom].forEach(btn=>{if(btn){btn.textContent='العودة لأداء الموديلات';btn.onclick=goBack}});
  return r;
 };
})();