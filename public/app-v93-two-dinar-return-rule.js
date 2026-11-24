(()=>{
 function applyTwoDinarRule(){
  if(state?.view!=='delivery-reconcile')return;
  document.querySelectorAll('.delivery-status-choice').forEach(sel=>{
    const i=Number(sel.dataset.i);if(!Number.isFinite(i))return;
    const amount=Number(document.querySelector(`.delivery-amount-choice[data-i="${i}"]`)?.value||0);
    const fee=Number(document.querySelector(`.delivery-fee-choice[data-i="${i}"]`)?.value||0);
    // «مرتجع» rows are decided by app-v90 with the statement rule; deciding them here as well
    // made the two observers flip the same select back and forth.
    if(normalizeArabic(decodeURIComponent(sel.dataset.rawStatus||'')).includes('مرتجع'))return;
    // Business rule: a final settlement of exactly 2 JOD is delivery fee only, not a partial sale.
    // The real fee may be lower than the 2 JOD refusal charge (e.g. 1.75 → net +0.25).
    if(Math.abs(amount-2)<0.001 && (fee===0||(fee>0&&fee<=2.001))){
      if(sel.value==='partial'||sel.value==='delivered_adjusted'||sel.value==='delivered'){
        sel.value='refused_fee_paid';
        sel.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
  });
 }
 new MutationObserver(()=>setTimeout(applyTwoDinarRule,40)).observe(document.documentElement,{childList:true,subtree:true});
 applyTwoDinarRule();
})();
