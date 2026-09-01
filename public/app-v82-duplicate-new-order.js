(()=>{
 function install(){
  if(state?.view!=='new')return;
  const notice=document.querySelector('#duplicateNotice');
  const exchange=document.querySelector('#approveDuplicate');
  if(!notice||!exchange||document.querySelector('#approveDuplicateNew'))return;
  const btn=document.createElement('button');
  btn.id='approveDuplicateNew';btn.type='button';btn.className='btn btn-primary';btn.style.cssText='padding:7px 10px;font-size:13px;margin-inline-start:7px';btn.textContent='موافقة — طلب جديد';exchange.insertAdjacentElement('afterend',btn);
  btn.onclick=async()=>{
    const store=document.querySelector('#store')?.value;
    if(!store)return toast('اختر المتجر صاحب الطلب');
    btn.disabled=true;exchange.disabled=true;
    try{
      const body={store_id:store,courier_id:document.querySelector('#courierIdAuto')?.value||'',recipient_name:document.querySelector('#name')?.value.trim()||'لا يوجد',phone:canonicalJordanPhone(document.querySelector('#phone')?.value||''),area:document.querySelector('#area')?.value||'',detailed_address:document.querySelector('#address')?.value||'',amount:document.querySelector('#amount')?.value||'',order_notes:document.querySelector('#notes')?.value||'',raw_text:document.querySelector('#raw')?.value||'',duplicate_override_reason:'new_order'};
      const d=await api('/orders',{method:'POST',body:JSON.stringify(body)});
      toast(`تم حفظ الطلب الجديد رقم ${d.order.order_code}`);show('orders');
    }catch(e){btn.disabled=false;exchange.disabled=false;toast(e.message||'تعذر حفظ الطلب')}
  };
 }
 new MutationObserver(()=>setTimeout(install,20)).observe(document.documentElement,{childList:true,subtree:true});
 install();
})();
