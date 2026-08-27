(()=>{
 const oldMap=mapDeliveryCompanyStatus;
 mapDeliveryCompanyStatus=function(raw){
  const n=normalizeArabic(String(raw||'')).toLowerCase().replace(/\s+/g,' ').trim();
  if((n.includes('تم التسليم')||n.includes('مسلم'))&&n.includes('مرتجع')&&!n.includes('جزئي')&&!n.includes('جزء'))return 'refused_fee_paid';
  return oldMap(raw);
 };
 // After report rows are rendered, distinguish returned rows by final amount:
 // 0 JOD = full return, customer did not pay delivery fee.
 // 2 JOD = full return, customer paid delivery fee.
 function fixReturnAmounts(){
  if(state?.view!=='delivery-reconcile')return;
  document.querySelectorAll('.delivery-status-choice').forEach(sel=>{
   const i=Number(sel.dataset.i);if(!Number.isFinite(i))return;
   const amount=Number(document.querySelector(`.delivery-amount-choice[data-i="${i}"]`)?.value||0);
   const row=typeof previewRows!=='undefined'?previewRows[i]:null;
   const raw=normalizeArabic(String(row?.raw_status||'')).toLowerCase();
   if(!raw.includes('مرتجع'))return;
   if(Math.abs(amount)<0.001){sel.value='refused_no_fee';sel.dispatchEvent(new Event('change',{bubbles:true}));}
   else if(Math.abs(amount-2)<0.001){sel.value='refused_fee_paid';sel.dispatchEvent(new Event('change',{bubbles:true}));}
  });
 }
 new MutationObserver(()=>setTimeout(fixReturnAmounts,40)).observe(document.documentElement,{childList:true,subtree:true});setInterval(fixReturnAmounts,500);
})();