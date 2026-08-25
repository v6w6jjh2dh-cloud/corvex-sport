(()=>{
  const previousRender=renderOrdersTable;
  renderOrdersTable=function(sel,orders,selectable){
    previousRender(sel,orders,selectable);
    const table=document.querySelector(sel+' table');
    if(!table)return;
    const heads=[...table.querySelectorAll('thead th')];
    const diffIndex=heads.findIndex(h=>h.textContent.trim()==='الفرق');
    if(diffIndex>=0){
      heads[diffIndex].remove();
      [...table.querySelectorAll('tbody tr')].forEach(tr=>{if(tr.children[diffIndex])tr.children[diffIndex].remove()});
    }
    const currentHeads=[...table.querySelectorAll('thead th')];
    const afterIndex=currentHeads.findIndex(h=>h.textContent.trim()==='السعر بعد التسليم');
    if(afterIndex<0)return;
    [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{
      const o=orders[i];if(!o||!tr.children[afterIndex])return;
      const status=o.delivery_status||'pending';
      const hasOutcome=['delivered','delivered_adjusted','partial'].includes(status)||Number(o.delivery_company_settled||0)===1;
      tr.children[afterIndex].textContent=hasOutcome?money(Number(o.delivered_amount||0)):'—';
    });
    // The financial lock remains enforced internally/server-side; don't clutter the price column with a lock icon.
    table.querySelectorAll('.lock-mark').forEach(x=>x.remove());
  };
})();
