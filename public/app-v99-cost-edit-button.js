(()=>{
 async function saveManualCost(card,newCost){
  const id=Number(card.dataset.id||0);if(!id)return;
  const input=card.querySelector('.profit-cost');const amount=Number(card.querySelector('.profit-amount')?.value||0),fee=Number(card.querySelector('.profit-fee')?.value||0);
  card.dataset.manualCostOverride='1';card.dataset.offerPartialDone='1';card.dataset.singlePartialDone='1';card.dataset.v92CostKey=`manual:${newCost}`;
  if(input){input.value=Number(newCost).toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  try{
    const partialItems=(card.querySelector('.profit-partial-items')?.value||'').trim();
    await api('/orders/'+id+'/profit-review',{method:'PUT',body:JSON.stringify({delivered_amount:amount,delivery_fee:fee,cost_of_goods:Number(newCost),partial_received_items:partialItems})});
    if(typeof toast==='function')toast('تم تعديل كوست الطلب');
    await window.CORVEX_RELOAD_DAILY_PROFITS?.(window.CORVEX_ACTIVE_PROFIT_SETTLEMENT||card.dataset.settlementId||'');
  }catch(e){if(typeof toast==='function')toast(e.message||'تعذر حفظ الكوست')}
 }
 function bind(card){if(card.dataset.costEditButtonBound==='1')return;card.dataset.costEditButtonBound='1';
  const input=card.querySelector('.profit-cost');if(!input)return;
  const old=[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='تعديل كوست الطلب');if(old)old.remove();
  const btn=document.createElement('button');btn.type='button';btn.className='btn btn-soft';btn.textContent='تعديل كوست الطلب';btn.style.margin='8px 0';
  const anchor=card.querySelector('.profit-original-notes')||input;anchor.parentNode.insertBefore(btn,anchor);
  btn.onclick=async()=>{
    const current=Number(input.value||0).toFixed(2);const v=prompt('اكتب كوست البضاعة الجديد',current);if(v===null)return;
    const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0){if(typeof toast==='function')toast('اكتب رقم كوست صحيح');return;}
    await saveManualCost(card,n);
  };
 }
 function run(){if(state?.view!=='daily-profits')return;document.querySelectorAll('.profit-order-card').forEach(bind)}
 document.addEventListener('corvex:profits-rendered',run);run();
})();
