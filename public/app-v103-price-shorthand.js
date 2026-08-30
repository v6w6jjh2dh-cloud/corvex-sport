(()=>{
 const expand=value=>String(value||'').replace(/(^|\s)(-?[٠-٩۰-۹\d]+(?:[.,][٠-٩۰-۹\d]+)?)\s*د(?=\s*(?:شامل|مع)\s+التوصيل(?:\s|$|[^\p{L}\p{N}]))/giu,'$1$2 دينار');
 const originalPrice=globalThis.priceFrom;
 if(typeof originalPrice==='function')globalThis.priceFrom=line=>originalPrice(expand(line));
 const originalInstruction=globalThis.instructionFromPriceLine;
 if(typeof originalInstruction==='function')globalThis.instructionFromPriceLine=line=>originalInstruction(expand(line));
})();
