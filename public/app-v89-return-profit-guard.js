(()=>{
 const FULL_RETURN=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival']);
 function hasReturnNote(card){const t=card?.querySelector('.profit-original-notes')?.innerText||'';return /(?:استرجاع|إسترجاع|ارجاع|إرجاع|مرتجع)/i.test(t)}
 function apply(){
  if(state?.view!=='daily-profits')return;
  document.querySelectorAll('.profit-order-card').forEach(card=>{
   if(!hasReturnNote(card))return;
   const status=String(card.dataset.status||'');
   const head=card.querySelector('.section-head');
   if(!FULL_RETURN.has(status)){
    card.querySelector('.return-profit-badge')?.remove();
    delete card.dataset.returnOrder;
    if(status==='delivered'||status==='delivered_adjusted'){
     const stored=Number(card.dataset.storedCost||0),cost=card.querySelector('.profit-cost');
     if(stored>0&&cost){
      card.dataset.manualCostOverride='1';card.dataset.manualCostValue=String(stored);
      cost.value=stored.toFixed(2);cost.dispatchEvent(new Event('input',{bubbles:true}));
      window.CORVEX_CLEAR_PROFIT_INCOMPLETE?.(card);
     }
    }
    return;
   }
   card.dataset.autoCostDone='1';card.dataset.returnOrder='1';
   const cost=card.querySelector('.profit-cost');if(cost){cost.value='0.00';cost.dispatchEvent(new Event('input',{bubbles:true}))}
   card.querySelectorAll('.profit-ai,.profit-partial-ai').forEach(b=>b.style.display='none');
   if(head&&!head.querySelector('.return-profit-badge'))head.insertAdjacentHTML('beforeend','<span class="badge badge-warn return-profit-badge">مرتجع — بدون حساب كوست بيع</span>');
  });
 }
 document.addEventListener('corvex:profits-rendered',apply);apply();
})();
