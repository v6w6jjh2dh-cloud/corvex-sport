(()=>{
 const rules=()=>window.CORVEX_PRODUCT_RULES;
 function refresh(){
  if(state?.view!=='daily-profits')return;
  document.querySelectorAll('.profit-ai').forEach(b=>b.remove());
  document.querySelector('#profitAiAll')?.closest('.actions')?.remove();
  document.querySelectorAll('.profit-order-card').forEach(card=>{
   const notes=card.querySelector('.profit-original-notes')?.innerText||'';
   if(card.dataset.status!=='partial'){
    const r=rules()?.calculateCost(notes)||{found:0},head=card.querySelector('.section-head');
    if(!r.found&&head&&!head.querySelector('.local-unknown'))head.insertAdjacentHTML('beforeend','<span class="badge badge-warn local-unknown">موديل غير معرّف</span>');
   }
   const btn=card.querySelector('.profit-partial-ai');
   if(btn&&!btn.dataset.localBound){btn.dataset.localBound='1';btn.textContent='حساب كوست القطع المكتوبة';btn.onclick=()=>{const text=card.querySelector('.profit-partial-items')?.value.trim()||'';if(!text)return toast('اكتب القطع التي تم تسليمها أولًا');const r=rules()?.calculateCost(text)||{found:0};if(!r.found)return toast('الموديل غير معرّف — أدخل الكوست يدويًا');card.querySelector('.profit-cost').value=r.cost.toFixed(2);card.querySelector('.profit-cost').dispatchEvent(new Event('input',{bubbles:true}));toast('تم حساب كوست القطع المكتوبة')};}
  });
 }
 new MutationObserver(()=>setTimeout(refresh,30)).observe(document.documentElement,{childList:true,subtree:true});setInterval(refresh,500);refresh();
})();
