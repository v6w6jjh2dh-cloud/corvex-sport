(()=>{
  if(typeof window.editOrder!=='function')return;
  const originalEditOrder=window.editOrder;
  window.editOrder=async function(id){
    const fromModels=state?.view==='model-performance';
    const from=document.querySelector('#mpFrom')?.value||'';
    const to=document.querySelector('#mpTo')?.value||'';
    await originalEditOrder(id);
    if(!fromModels)return;
    const goBack=async()=>{
      if(typeof window.modelPerformanceView==='function'){
        await window.modelPerformanceView();
        if(from&&document.querySelector('#mpFrom'))document.querySelector('#mpFrom').value=from;
        if(to&&document.querySelector('#mpTo'))document.querySelector('#mpTo').value=to;
        if((from||to)&&document.querySelector('#mpLoad'))document.querySelector('#mpLoad').click();
      }else show('orders');
    };
    const top=document.querySelector('#backToOrders');
    const bottom=document.querySelector('#cancelEditOrder');
    if(top){top.textContent='← العودة لأداء الموديلات';top.onclick=goBack}
    if(bottom){bottom.textContent='← العودة لأداء الموديلات';bottom.onclick=goBack}
  };
})();