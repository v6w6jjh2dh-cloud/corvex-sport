(()=>{
 const rules=()=>window.CORVEX_PRODUCT_RULES;
 function refresh(){
  if(state?.view!=='daily-profits')return;
  document.querySelectorAll('.profit-ai').forEach(b=>b.remove());
  document.querySelector('#profitAiAll')?.closest('.actions')?.remove();
  document.querySelectorAll('.profit-order-card').forEach(card=>{
   // Full-order classification is owned only by app-v100. This file keeps the
   // partial-delivery helper and must not create a second unknown-model verdict.
   const btn=card.querySelector('.profit-partial-ai');
   if(btn&&!btn.dataset.localBound){btn.dataset.localBound='1';btn.textContent='حساب كوست القطع المكتوبة';btn.onclick=()=>{const text=card.querySelector('.profit-partial-items')?.value.trim()||'';if(!text)return toast('اكتب القطع التي تم تسليمها أولًا');const r=rules()?.calculateCost(text)||{found:0};if(!r.found)return toast('الموديل غير معرّف — أدخل الكوست يدويًا');card.querySelector('.profit-cost').value=r.cost.toFixed(2);card.querySelector('.profit-cost').dispatchEvent(new Event('input',{bubbles:true}));toast('تم حساب كوست القطع المكتوبة')};}
  });
 }
 document.addEventListener('corvex:profits-rendered',refresh);refresh();
})();
