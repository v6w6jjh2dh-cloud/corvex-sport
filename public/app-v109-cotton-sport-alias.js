(()=>{
 const engine=window.CORVEX_PRODUCT_RULES;
 if(!engine||engine.__cottonSportAliasesV1)return;
 const normalize=value=>typeof engine.normalize==='function'?engine.normalize(String(value||'')):String(value||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();
 const isCottonSportText=value=>{
  const words=new Set(normalize(value).split(/\s+/).filter(Boolean));
  return words.has('رياضه')&&words.has('قطن');
 };
 const isCottonSportProduct=product=>[product?.name,...(Array.isArray(product?.aliases)?product.aliases.filter(alias=>typeof alias==='string'):[])].some(isCottonSportText);
 const applyAliases=()=>{
  for(const product of (engine.products||[])){
   if(product?.__cottonSportAliasesV1||!isCottonSportProduct(product))continue;
   if(!Array.isArray(product.aliases))product.aliases=[];
   product.aliases.push(/(?:^|\s)(?:بنطلون|بنطال|بناطيل)?\s*(?:رياضه\s*قطن|قطن\s*رياضه)(?:\s*(?:بنطلون|بنطال|بناطيل))?(?=\s|$)/i);
   product.__cottonSportAliasesV1=true;
  }
 };
 const originalLoadRemote=typeof engine.loadRemote==='function'?engine.loadRemote.bind(engine):null;
 if(originalLoadRemote){
  engine.loadRemote=async function(force=false){
   const result=await originalLoadRemote(force);
   applyAliases();
   return result;
  };
 }
 applyAliases();
 engine.__cottonSportAliasesV1=true;
})();
