(()=>{
 function isReturn(card){const t=card?.querySelector('.profit-original-notes')?.innerText||'';return /(?:استرجاع|إسترجاع|ارجاع|إرجاع|مرتجع)/i.test(t)}
 function apply(){
  if(state?.view!=='daily-profits')return;
  document.querySelectorAll('.profit-order-card').forEach(card=>{
   if(!isReturn(card))return;
   card.dataset.autoCostDone='1';card.dataset.returnOrder='1';
   const cost=card.querySelector('.profit-cost');if(cost){cost.value='0.00';cost.dispatchEvent(new Event('input',{bubbles:true}))}
   card.querySelectorAll('.profit-ai,.profit-partial-ai').forEach(b=>b.style.display='none');
   const head=card.querySelector('.section-head');
   if(head&&!head.querySelector('.return-profit-badge'))head.insertAdjacentHTML('beforeend','<span class="badge badge-warn return-profit-badge">مرتجع — بدون حساب كوست بيع</span>');
  });
 }
 new MutationObserver(()=>setTimeout(apply,30)).observe(document.documentElement,{childList:true,subtree:true});setInterval(apply,700);apply();
})();