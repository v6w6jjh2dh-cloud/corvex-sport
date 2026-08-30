(()=>{
 let products=[
  {id:'jakar',name:'جاكار',cost:4.25,aliases:[/جاكار/i,/ترينغ/i,/تريننغ/i],offers:{1:[8],2:[15],3:[20]},deliveryIncluded:false},
  {id:'paris',name:'باريس',cost:2.5,aliases:[/باريس/i],offers:{3:[15]},deliveryIncluded:true},
  {id:'reebok',name:'ريبوك',cost:2.5,aliases:[/ريبوك/i,/reebok/i,/ري\s*bok/i],offers:{3:[15]},deliveryIncluded:true},
  {id:'m',name:'M',cost:3,aliases:[/(?:تيشرت|تيشيرت|تشرت|بلوزه?|بلايز)\s*(?:حرف\s*)?(?:m6|m|م6|م|ام6|ام)(?=\s|$)/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'trico_plain',name:'تريكو سادة',cost:2.5,aliases:[/ساده\s*تريكو/i,/تريكو\s*ساده/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'button',name:'زرار',cost:2.2,aliases:[/جيوب\s*زرار/i,/بنطلون\s*(?:ب?زرار|بزار)/i,/(?:^|\s)(?:زرار|بزار)(?:\s|$)/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'zip_pockets',name:'جيوب سحاب',cost:2.3,aliases:[/جيو?ب\s*سحاب/i,/سحاب\s*جيو?ب/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'regular_pockets',name:'جيوب عادي',cost:2.2,aliases:[/جيوب\s*عادي/i,/بنطلون\s*جيوب(?!\s*سحاب|\s*زرار)/i,/(?:^|\s)جيوب(?:\s|$)/i],offers:{1:[5],2:[9],3:[12]},deliveryIncluded:false},
  {id:'sport_zip',name:'رياضة سحاب',cost:2.7,aliases:[/رياضه\s*سحاب/i,/سحاب\s*رياضه/i,/بنطلون\s*سحاب/i],offers:{1:[5],2:[9]},deliveryIncluded:false},
  {id:'polo_plain',name:'بولو سادة',cost:2.8,aliases:[/ساده\s*بولو/i,/بولو\s*ساده/i],offers:{1:[5],2:[10]},deliveryIncluded:false},
  {id:'polo_knit',name:'بولو تريكو',cost:3.5,aliases:[/بولو\s*تريكو/i,/تريكو\s*بولو/i,/بولو\s*ترند/i],offers:{1:[5],2:[9],3:[15]},deliveryIncluded:false},
  {id:'turkish',name:'تركي',cost:2.7,aliases:[/بنطلون\s*تركي/i,/(?:^|\s)تركي(?:\s|$)/i],offers:{1:[5],2:[9],3:[15,16]},deliveryIncluded:false},
  {id:'takyeef',name:'بنطلون تكيف',cost:3.5,aliases:[/(?:بنطلون\s*)?(?:تكيف|تكييف|يكتف|تكف)/i],offers:{},deliveryIncluded:false},
  {id:'cardigan',name:'كاردونيه',cost:3.5,aliases:[/كاردونيه/i,/بجامه\s*كاردونيه/i],offers:{1:[8],2:[14],3:[18]},deliveryIncluded:false},
  {id:'cotton_tee',name:'تيشيرت قطن',cost:3.3,aliases:[/تيش(?:رت|يرت)\s*قطن/i,/قطن\s*سبور/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {
   id:'old_money',name:'Old Money',cost:3.5,
   aliases:[
    'اولد ماني','أولد ماني','اولد موني','أولد موني','اولد مني','أولد مني',
    'بلوزه اولد ماني','بلوزه اولد موني','Old Money'
   ],
   offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false
  }
 ];

 const normalizeDigitsSafe=value=>{
  const text=String(value||'');
  if(typeof normalizeDigits==='function')return normalizeDigits(text);
  return text.replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
 };
 const normalize=value=>normalizeDigitsSafe(value).toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();
 const COLORS=new Set(['اسود','ابيض','بني','زيتي','سكني','رمادي','سماوي','ازرق','كحلي','برتقالي','احمر','اخضر','بيج','رصاصي','نهدي','زهري','وردي','موف','بنفسجي']);
 const OPERATION_CONTEXT=/(?:^|\s)و?(?:استرجاع|ارجاع|مرتجع|استبدال|تبديل|بدل)(?=\s|$)/i;
 const STOP_CONTEXT=/(?:وزن|مقاس|قياس|طول|تواصل|توصيل|شامل|السعر|سعر|دينار|هاتف|تلفون|موبايل|رقم|عنوان|ملاحظه|استرجاع|ارجاع|مرتجع|استبدال|تبديل|بدل)/i;
 const SIZE_CONTEXT=/(?:^|\s)(?:بلبس|بيلبس|يلبس|لبس|مقاس|قياس)(?:\s|$)/i;
 const SIZE_WORDS=new Set(['اكس','اكسل','اكس لارج','دبل اكس','لارج','ميديوم','سمول','xl','xxl','xxxl']);
 const QUANTITY_LABEL=/(?:عدد|العدد|كميه|الكميه|تفصيل)\s*[:=\-]?\s*(\d{1,3})(?=\s|$)/i;
 const QUANTITY_UNIT=/(?:^|\s)(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)(?=\s|$)/i;
 const COLOR_QUANTITY=/(?:^|\s)(\d{1,3})\s*(?:اسود|ابيض|بني|زيتي|سكني|رمادي|سماوي|ازرق|كحلي|برتقالي|احمر|اخضر|بيج|رصاصي|نهدي|زهري|وردي|موف|بنفسجي)(?=\s|$)/gi;
 const colorQuantityCount=text=>[...normalize(text).matchAll(COLOR_QUANTITY)].reduce((sum,match)=>sum+Number(match[1]||0),0);

 function aliasMatches(product,text){
  const value=normalize(text),found=[];
  for(const alias of product.aliases){
   if(typeof alias==='string'){
    const needle=normalize(alias);let from=0,index;
    while((index=value.indexOf(needle,from))!==-1){const before=value[index-1]||'',after=value[index+needle.length]||'';if(!/[\p{L}\p{N}]/u.test(before)&&!/[\p{L}\p{N}]/u.test(after))found.push({index,length:needle.length});from=index+Math.max(1,needle.length)}
   }else{
    alias.lastIndex=0;const match=alias.exec(value);if(match)found.push({index:match.index,length:match[0].length});alias.lastIndex=0;
   }
  }
  return found.sort((a,b)=>a.index-b.index||b.length-a.length);
 }
 const matchProduct=(product,text)=>aliasMatches(product,text)[0]||null;
 const matches=(product,text)=>Boolean(matchProduct(product,text));
 function findMatches(text){
  const candidates=products.map(product=>{const match=matchProduct(product,text);return match?{product,...match}:null}).filter(Boolean).sort((a,b)=>b.length-a.length||a.index-b.index),accepted=[];
  for(const candidate of candidates){
   const end=candidate.index+candidate.length,overlaps=accepted.some(item=>candidate.index<item.index+item.length&&end>item.index);
   if(!overlaps)accepted.push(candidate);
  }
  return accepted.sort((a,b)=>a.index-b.index);
 }
 const findAll=text=>findMatches(text).map(match=>match.product);
 const findOne=text=>{const found=findAll(text);return found.length===1?found[0]:null};

 function explicitQuantity(text,product){
  const value=normalize(text);
  const productMatch=matchProduct(product,value);if(!productMatch)return 0;
  const lineMatches=findMatches(value),previous=[...lineMatches].reverse().find(item=>item.index<productMatch.index),next=lineMatches.find(item=>item.index>productMatch.index);
  const before=value.slice(previous?previous.index+previous.length:0,productMatch.index),after=value.slice(productMatch.index+productMatch.length,next?next.index:value.length);
  const beforeColors=colorQuantityCount(before);if(beforeColors)return Math.max(1,beforeColors);
  let match=before.match(/(?:^|\s)(?:عدد|العدد|كميه|الكميه|تفصيل)\s*[:=\-]?\s*(\d{1,3})\s*$/i)||before.match(/(?:^|\s)(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)\s*$/i)||before.match(/(?:^|\s)(\d{1,3})\s*$/);
  if(match&&!STOP_CONTEXT.test(before.slice(Math.max(0,match.index-18),match.index)))return Math.max(1,Number(match[1]));
  const afterColors=colorQuantityCount(after);if(afterColors)return Math.max(1,afterColors);
  match=after.match(QUANTITY_LABEL)||after.match(QUANTITY_UNIT)||after.match(/^\s*(?:[+،,:=\-]\s*)?(\d{1,3})(?=\s|$)/);
  return match?Math.max(1,Number(match[1])):0;
 }
 function colorCount(text){
  const words=normalize(text).split(/[^\p{L}]+/u).filter(Boolean);
  return words.reduce((count,word)=>count+(COLORS.has(word)?1:0),0);
 }
 function quantityFor(lines,index,product){
  let quantity=explicitQuantity(lines[index],product);if(quantity)return quantity;
  let end=index+1,colorQuantity=0;
  for(;end<lines.length;end++){
   const line=normalize(lines[end]);
   if(findAll(line).length)break;
   const match=line.match(QUANTITY_LABEL)||line.match(QUANTITY_UNIT);
   if(match)return Math.max(1,Number(match[1]));
   colorQuantity+=colorQuantityCount(line);
  }
  if(colorQuantity)return Math.max(1,colorQuantity);
  let colors=colorCount(lines[index]);
  for(let i=index+1;i<end;i++)if(!STOP_CONTEXT.test(normalize(lines[i])))colors+=colorCount(lines[i]);
  return colors||1;
 }
 const itemCost=(product,quantity)=>Number((Number(product?.cost||0)*Math.max(0,Number(quantity||0))).toFixed(2));
 function saleLine(value=''){
  const line=normalize(value),operation=OPERATION_CONTEXT.exec(line);
  if(!operation)return line;
  const before=line.slice(0,operation.index).replace(/\s+و\s*$/,'').trim();
  return /^طلب\s+جديد(?:\s+و)?$/.test(before)?'':before;
 }
 const saleLines=text=>String(text||'').split(/\n+/).map(saleLine).filter(Boolean);
 let ignoredPhrases=[];
 function isIgnoredCandidate(candidate){const value=normalize(candidate);return SIZE_CONTEXT.test(value)||SIZE_WORDS.has(value)||ignoredPhrases.includes(value)}
 function unknownCandidates(text=''){
  const lines=saleLines(text),unknown=[];
  for(const line of lines){
   const quantities=[...line.matchAll(/(?:^|\s)(?:عدد\s*)?(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)?(?=\s|$)/g)];
   for(let i=0;i<quantities.length;i++){
    const start=quantities[i].index+quantities[i][0].length,end=i+1<quantities.length?quantities[i+1].index:line.length;
    let candidate=line.slice(start,end).replace(/^\s*و(?:\s+|$)/,'').replace(/\s+و\s*$/,'').trim();
    candidate=candidate.replace(/\s*(?:مع|شامل)\s+التوصيل(?:\s|$).*$/,'').split(/\s+(?:السعر|سعر|شامل|توصيل|وزن|مقاس|طول|هاتف|تلفون|رقم|عنوان)(?:\s|$)/)[0].trim();
    if(!candidate||findAll(candidate).length||isIgnoredCandidate(candidate))continue;
    const words=candidate.split(/\s+/).filter(word=>!COLORS.has(word)&&!['لون','الوان','قطعه','قطع','حبه','حبات','اكس','اكسل','لارج','ميديوم','سمول','xl','xxl','xxxl'].includes(word));
    candidate=words.join(' ').trim();
    if(candidate.length<2||STOP_CONTEXT.test(candidate)||isIgnoredCandidate(candidate)||/^\d+$/.test(candidate))continue;
    unknown.push(candidate);
   }
  }
  return [...new Set(unknown)];
 }
 function calculateCost(text=''){
  const lines=saleLines(text),items=[];let cost=0;
  for(let index=0;index<lines.length;index++){
   for(const {product} of findMatches(lines[index])){
    const quantity=quantityFor(lines,index,product),lineCost=itemCost(product,quantity);
    items.push({id:product.id,name:product.name,qty:quantity,cost:lineCost});cost+=lineCost;
   }
  }
  return{cost:Number(cost.toFixed(2)),items,found:items.length,unknown:unknownCandidates(lines.join('\n'))};
 }

 let remoteLoaded=false,remotePromise=null;
 const engine={
  get products(){return products},get ignoredPhrases(){return [...ignoredPhrases]},normalize,matches,findAll,findOne,findMatches,quantityFor,itemCost,calculateCost,unknownCandidates,version:'2026-08-30-v9',
  async loadRemote(force=false){
   if(remoteLoaded&&!force)return products;if(remotePromise)return remotePromise;
   remotePromise=(async()=>{try{if(typeof api!=='function')return products;const data=await api('/profit-models');ignoredPhrases=(data.ignored_phrases||[]).map(normalize).filter(Boolean);if(Array.isArray(data.models)&&data.models.length){products=data.models.filter(model=>model.active!==false).map(model=>({id:model.key||String(model.id),databaseId:Number(model.id),name:model.name,cost:Number(model.cost||0),aliases:Array.isArray(model.aliases)?model.aliases:[model.name],offers:model.offers||{},deliveryIncluded:Boolean(model.deliveryIncluded)}));engine.version=`db:${data.version||Date.now()}`;remoteLoaded=true}return products}catch{return products}finally{remotePromise=null}})();
   return remotePromise;
  }
 };
 window.CORVEX_PRODUCT_RULES=engine;
})();
