(()=>{
 function install(){
  if(state?.view!=='new')return;
  const notice=document.querySelector('#duplicateNotice');
  const exchange=document.querySelector('#approveDuplicate');
  if(!notice||!exchange)return;
  if(document.querySelector('#approveDuplicateNew')&&document.querySelector('#approveDuplicateNegative'))return;
  const makeBody=mode=>({store_id:document.querySelector('#store')?.value||'',courier_id:document.querySelector('#courierIdAuto')?.value||'',recipient_name:document.querySelector('#name')?.value.trim()||'لا يوجد',phone:canonicalJordanPhone(document.querySelector('#phone')?.value||''),area:document.querySelector('#area')?.value||'',detailed_address:document.querySelector('#address')?.value||'',amount:document.querySelector('#amount')?.value||'',order_notes:document.querySelector('#notes')?.value||'',raw_text:document.querySelector('#raw')?.value||'',duplicate_override_reason:mode});
  const saveAs=async(mode,button,successLabel)=>{
    if(!document.querySelector('#store')?.value)return toast('اختر المتجر صاحب الطلب');
    const buttons=[exchange,document.querySelector('#approveDuplicateNew'),document.querySelector('#approveDuplicateNegative')].filter(Boolean);
    buttons.forEach(x=>x.disabled=true);
    try{
      const d=await api('/orders',{method:'POST',body:JSON.stringify(makeBody(mode))});
      toast(`${successLabel} رقم ${d.order.order_code}`);show('orders');
    }catch(e){buttons.forEach(x=>x.disabled=false);toast(e.message||'تعذر حفظ الطلب')}
  };
  let btn=document.querySelector('#approveDuplicateNew');
  if(!btn){btn=document.createElement('button');btn.id='approveDuplicateNew';btn.type='button';btn.className='btn btn-primary';btn.style.cssText='padding:7px 10px;font-size:13px;margin-inline-start:7px';btn.textContent='موافقة — طلب جديد';exchange.insertAdjacentElement('afterend',btn)}
  let negative=document.querySelector('#approveDuplicateNegative');
  if(!negative){negative=document.createElement('button');negative.id='approveDuplicateNegative';negative.type='button';negative.className='btn btn-danger';negative.style.cssText='padding:7px 10px;font-size:13px;margin-inline-start:7px';negative.textContent='موافقة — إدخال كسالب';btn.insertAdjacentElement('afterend',negative)}
  btn.onclick=()=>saveAs('new_order',btn,'تم حفظ الطلب الجديد');
  negative.onclick=()=>saveAs('negative_return',negative,'تم حفظ طلب الإرجاع بالسالب');
 }
 new MutationObserver(()=>setTimeout(install,20)).observe(document.documentElement,{childList:true,subtree:true});
 install();
})();
