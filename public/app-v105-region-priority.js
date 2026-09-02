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
  if(has(line,/(?:^|\s)ضاحي(?:ة|ه)\s+الامير\s+حسن(?:\s|$)/)){
   return {governorate:'عمان',alias:'ضاحية الامير حسن',raw:String(line||'')};
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

 const cleanPrefix=value=>String(value||'').replace(/^\s*(?:سكان|[اأ]نا\s+ساكن(?:ه|ة)?|[اأ]نا\s+في\s+مكان|[اأ]نا\s+قاعد(?:ه|ة)?)\s*[:،,-]?\s*/u,'').trim();
 const cleanAddress=value=>String(value||'').split(/\s+-\s+/).map(cleanPrefix).filter(Boolean).join(' - ');
 const originalParse=globalThis.parseSmart;
 if(typeof originalParse==='function')globalThis.parseSmart=function(text){
  const result=originalParse(text),lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const priority=lines.map(line=>({line,hit:globalThis.priorityLocalMatch(line)})).find(x=>x.hit);
  const explicit=lines.map(line=>({line,hit:globalThis.explicitGovernorateMatch(line)})).find(x=>x.hit);
  const forced=priority||explicit;
  if(forced?.hit?.governorate)result.area=forced.hit.governorate;
  result.address=cleanAddress(result.address);
  return result;
 };
})();
