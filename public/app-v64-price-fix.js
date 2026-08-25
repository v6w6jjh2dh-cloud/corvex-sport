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
      [...table.querySelectorAll('tbody tr')].forEach(tr=>{
        if(tr.children[diffIndex])tr.children[diffIndex].remove();
      });
    }

    const currentHeads=[...table.querySelectorAll('thead th')];
    const afterIndex=currentHeads.findIndex(h=>h.textContent.trim()==='السعر بعد التسليم');
    if(afterIndex<0)return;

    [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{
      const o=orders[i];
      if(!o||!tr.children[afterIndex])return;

      const status=o.delivery_status||'pending';
      const deliveredStatuses=new Set(['delivered','delivered_adjusted','partial']);

      // السعر بعد التسليم يظهر فقط بعد نتيجة تسليم فعلية.
      // قيد التوصيل أو أي نوع إلغاء/رفض يبقى فارغًا حتى لو كانت بيانات قديمة
      // تحتوي delivered_amount مساويًا لسعر الطلب الأصلي.
      if(deliveredStatuses.has(status)){
        const value=Number(o.delivered_amount||0);
        tr.children[afterIndex].textContent=money(value);
      }else{
        tr.children[afterIndex].textContent='—';
      }
    });

    table.querySelectorAll('.lock-mark').forEach(x=>x.remove());
  };
})();
