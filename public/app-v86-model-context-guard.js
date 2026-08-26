(()=>{
  // قواعد سياق الموديلات: أسماء العملاء/المتاجر/العناوين ليست مصدرًا لتحديد الموديل.
  // حرف M لا يُحتسب إلا عند وجود كلمة منتج واضحة بجانبه، حتى لا تتحول "ام حمزة" إلى موديل.
  window.CORVEX_MODEL_CONTEXT_GUARD={
    isHorseMProductLine(line=''){
      const s=String(line).replace(/\s+/g,' ').trim();
      return /(?:تيشرت|تيشيرت|تشرت|بلوز[هة]|بلوزه|بلايز)\s*(?:حرف\s*)?(?:m6?|M6?|ام)(?=\s|\d|$)/i.test(s)
        || /(?:حرف\s*[mM]|حرف\s*ام)\s*(?:تيشرت|تيشيرت|تشرت|بلوز[هة]|بلوزه|بلايز)/i.test(s);
    },
    productText(order={}){
      // لا ندخل recipient_name/store_name/area/address في التصنيف إطلاقًا.
      return String(order.order_notes||order.raw_text||'');
    }
  };
})();