(()=>{
 const oldMap=mapDeliveryCompanyStatus;
 mapDeliveryCompanyStatus=function(raw){
  const n=normalizeArabic(String(raw||'')).toLowerCase().replace(/\s+/g,' ').trim();
  // "تم التسليم ومرتجع وتعديل القيمة" is not automatically partial.
  // When the delivery-company row represents a full return, classify it as returned/fee-paid;
  // genuine partial wording still remains partial.
  if((n.includes('تم التسليم')||n.includes('مسلم'))&&n.includes('مرتجع')&&!n.includes('جزئي')&&!n.includes('جزء'))return 'refused_fee_paid';
  return oldMap(raw);
 };
})();