(()=>{
 const normalized=value=>normalizeArabic(String(value||''));
 const has=(text,pattern)=>pattern.test(normalized(text));

 const originalPriority=globalThis.priorityLocalMatch;
 globalThis.priorityLocalMatch=function(line){
  if(has(line,/(?:^|\s)شارع\s+مادبا(?:\s|$)/)){
   return {governorate:'عمان',alias:'شارع مادبا',raw:String(line||'')};
  }
  if(has(line,/(?:^|\s)(?:الغور|غور|الاغوار|اغوار)(?:\s|$)/)){
   return {governorate:'الأغوار',alias:'الاغوار',raw:String(line||'')};
  }
  return typeof originalPriority==='function'?originalPriority(line):null;
 };

 const originalExplicit=globalThis.explicitGovernorateMatch;
 globalThis.explicitGovernorateMatch=function(line){
  if(has(line,/(?:^|\s)(?:الزرقاء|الزرقا)(?:\s|$)/)){
   return {governorate:'الزرقاء',alias:'الزرقاء',raw:String(line||'')};
  }
  if(has(line,/(?:^|\s)(?:محافظه\s+)?مادبا(?:\s|$)/)){
   return {governorate:'مادبا',alias:'مادبا',raw:String(line||'')};
  }
  return typeof originalExplicit==='function'?originalExplicit(line):null;
 };
})();
