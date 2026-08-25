(()=>{
  const previousRender=renderOrdersTable;
  const previousOrdersViewV64=ordersView;
  const previousLoadOrdersV64=loadOrders;
  const cancelledStatuses=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival']);

  function postDeliveryPrice(o){
    const status=o.delivery_status||'pending';
    const deliveredStatuses=new Set(['delivered','delivered_adjusted','partial']);
    if(!deliveredStatuses.has(status))return null;

    // بعد اعتماد كشف شركة التوصيل نعرض الصافي المثبت في الكشف.
    if(Number(o.delivery_company_settled||0)===1 && o.company_cash_net!==null && o.company_cash_net!==undefined){
      return Number(o.company_cash_net||0);
    }

    // قبل الاعتماد: القيمة الجديدة بعد التسليم = قيمة ما تم تسليمه ناقص أجور التوصيل.
    const delivered=Number(o.delivered_amount||0);
    const fee=Number(o.delivery_fee||0);
    return delivered-fee;
  }

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
      const value=postDeliveryPrice(o);
      tr.children[afterIndex].textContent=value===null?'—':money(value);
    });

    table.querySelectorAll('.lock-mark').forEach(x=>x.remove());
  };

  // أبقِ حالة «ملغي» ظاهرة في جميع الطلبات كفلتر موحد لكل أنواع الإلغاء/الرفض.
  ordersView=async function(){
    await previousOrdersViewV64();
    const f=$('#statusFilter');
    if(!f)return;
    if(![...f.options].some(o=>o.value==='cancelled')){
      f.insertAdjacentHTML('beforeend','<option value="cancelled">ملغي</option>');
    }
  };

  loadOrders=async function(){
    const f=$('#statusFilter');
    if(f?.value!=='cancelled')return previousLoadOrdersV64();
    const keep=f.value;
    f.value='';
    await previousLoadOrdersV64();
    f.value=keep;
    const filtered=(state.orders||[]).filter(o=>cancelledStatuses.has(o.delivery_status));
    state.orders=filtered;
    renderOrdersTable('#ordersTable',filtered,false);
  };
})();
