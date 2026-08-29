(()=>{
 const oldMap=mapDeliveryCompanyStatus;
 mapDeliveryCompanyStatus=function(raw){
 const n=normalizeArabic(String(raw||'')).toLowerCase().replace(/\s+/g,' ').trim();
  if(n.includes('مرتجع'))return 'partial';
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
   const fee=Number(document.querySelector(`.delivery-fee-choice[data-i="${i}"]`)?.value||0);
   const net=Number(document.querySelector(`.delivery-net-choice[data-i="${i}"]`)?.value||0);
   const row=typeof previewRows!=='undefined'?previewRows[i]:null;
   const encoded=String(sel.dataset.rawStatus||''),rawText=encoded?decodeURIComponent(encoded):String(row?.raw_status||'');
   const raw=normalizeArabic(rawText).toLowerCase();
   if(!raw.includes('مرتجع'))return;
   const target=net<-.001||amount<.001?'refused_no_fee':Math.abs(net)<.001||amount<=fee+.001?'refused_fee_paid':'partial';
   if(sel.value!==target){sel.value=target;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  });
 }
 new MutationObserver(()=>setTimeout(fixReturnAmounts,40)).observe(document.documentElement,{childList:true,subtree:true});setInterval(fixReturnAmounts,500);
})();
