// Generic order-language parser: understands HOW orders are written (quantities, units, colours,
// prices, phones, return/exchange lines, typos, descriptors), independently of WHAT is sold.
// Every word it knows lives in a LEXICON (data), never in the algorithm, so it can be learned and
// customised per store / per business without code changes (see store_lexicon in _product-engine.js).
// Products are data too: the parser receives a catalogue [{id, name, aliases[]}].
//
// DEFAULT_LEXICON reproduces the active matcher (functions/api/_inventory.js classifyInventoryItems)
// exactly — proven by tests/order-language.test.mjs. LEARNED_DEFAULTS holds conventions learned from
// real Corvex orders that the active matcher does not read (applied only by the central engine).
// Pure module: no database access.

export const LANGUAGE_VERSION='order-language-1';

export const DEFAULT_LEXICON={
 locale:'ar-JO',
 // text normalisation: [pattern, replacement] applied in order (after digit conversion)
 normalize:[['[\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]',''],['[\\u00a0\\u202f]',' '],['__lower__',''],
  ['[إأآٱ]','ا'],['ى','ي'],['ؤ','و'],['ئ','ي'],['ة','ه'],['[ًٌٍَُِّْـ]',''],['\\s+',' '],['__trim__','']],
 digitSets:['٠١٢٣٤٥٦٧٨٩','۰۱۲۳۴۵۶۷۸۹'],
 colours:['اسود','ابيض','بني','زيتي','سكني','رمادي','سماوي','ازرق','كحلي','برتقالي','احمر','اخضر','بيج','رصاصي','نهدي','زهري','وردي','موف','بنفسجي'],
 colourConjunction:'و',
 quantityLabels:['عدد','العدد','كميه','الكميه','تفصيل'],
 unitWords:['قطعه','قطع','حبه','حبات','لون','الوان'],
 numberWords:{واحد:1,واحده:1,اثنين:2,اتنين:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10},
 // a whole line that is only one of these words is a quantity
 pairWords:{قطعتين:2,حبتين:2,لونين:2},
 // words that make a line "not about the product" (weight, size, price, contact, dates, returns…) — substring match
 metaWords:['وزن','كيلو','كغم','كغ','kg','مقاس','قياس','طول','تواصل','توصيل','شامل','السعر','سعر','دينار','هاتف','تلفون','موبايل','رقم','عنوان','ملاحظه','موعد','بعد','يوم','ايام','استرجاع','ارجاع','مرتجع','استبدال','تبديل','بدل'],
 // what follows an operation word on a line is not a sale
 operationWords:['استرجاع','ارجاع','مرتجع','استبدال','تبديل','بدل'],
 operationPrefix:'و',
 newOrderPhrase:'طلب جديد',
 // a bare number right after a product is a quantity only up to this value and when not followed by these
 bareQuantityMax:20,
 bareQuantitySeparators:'+،,:=\\-x×*',
 priceAfterNumber:['دينار','دنانير','د(?:\\s|$)','jd','jod','شامل','مع\\s','بالتوصيل','توصيل','سعر'],
 // a short name preceded by one of these words describes another item («مبطن فرو» is a lining)
 descriptorGuards:[{names:['فرو','الفرو'],before:['مبطن','مبطنه','بطانه','بطانته','ياقه','كبوس','كابيشن','قبعه','مع','فيه','فيها','داخل','داخله','داخلي']}],
 maxQuantityDigits:3
};

// Conventions learned from real orders (Corvex, 2026-11-24) that the active matcher does not read inside a
// product line. The central engine applies them ONLY to a single-product order read as 1 piece.
export const LEARNED_DEFAULTS={
 typos:{الغدد:'العدد'},
 inlinePairWords:{قطعتين:2,قطعتان:2,لونين:2,حبتين:2,ثنتين:2},
 phraseQuantities:[{phrase:'ثلاث الوان',quantity:3},{phrase:'ثلاث الالوان',quantity:3},{phrase:'ثلاثه الوان',quantity:3},{phrase:'ثلاثه الالوان',quantity:3}],
 inlineNumberWords:true,
 leadingNumber:{min:2,max:20},
 // a word that means a fixed quantity for one product (an offer): {product: words in the product name, word, quantity}
 productWords:[{product:'ليكرا',word:'العرض',quantity:3}]
};

const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const alt=list=>list.map(esc).sort((a,b)=>b.length-a.length).join('|');

// Build (and cache) everything the parser needs from a lexicon.
const cache=new WeakMap();
export function compile(lex=DEFAULT_LEXICON){
 if(cache.has(lex))return cache.get(lex);
 const steps=lex.normalize.map(([p,r])=>p==='__lower__'?s=>s.toLowerCase():p==='__trim__'?s=>s.trim():(re=>s=>s.replace(re,r))(new RegExp(p,'g')));
 const digits=lex.digitSets.map(set=>[new RegExp('['+set+']','g'),set]);
 const norm=value=>{let s=String(value||'');for(const [re,set] of digits)s=s.replace(re,d=>set.indexOf(d));for(const f of steps)s=f(s);return s};
 const D=`\\d{1,${lex.maxQuantityDigits}}`,units=alt(lex.unitWords),labels=alt(lex.quantityLabels),colours=alt(lex.colours),nums=alt(Object.keys(lex.numberWords));
 const c={
  lex,norm,colours:new Set(lex.colours),
  meta:new RegExp('(?:'+lex.metaWords.map(esc).join('|')+')','i'),
  operation:new RegExp('(?:^|\\s)'+esc(lex.operationPrefix)+'?(?:'+lex.operationWords.map(esc).join('|')+')(?=\\s|$)','i'),
  newOrder:new RegExp('^'+lex.newOrderPhrase.split(' ').map(esc).join('\\s+')+'(?:\\s+'+esc(lex.colourConjunction)+')?$'),
  label:new RegExp('(?:'+labels+')\\s*[:=\\-]?\\s*('+D+')(?=\\s|$)','i'),
  unit:new RegExp('(?:^|\\s)('+D+')\\s*(?:'+units+')(?=\\s|$)','i'),
  colourQty:new RegExp('(?:^|\\s)('+D+')\\s*(?:'+colours+')(?=\\s|$)','gi'),
  labelBefore:new RegExp('(?:^|\\s)(?:'+labels+')\\s*[:=\\-]?\\s*('+D+')\\s*$','i'),
  unitBefore:new RegExp('(?:^|\\s)('+D+')\\s*(?:'+units+')\\s*$','i'),
  bareAfter:new RegExp('^\\s*(?:['+lex.bareQuantitySeparators+']\\s*)?('+bareRange(lex.bareQuantityMax)+')(?=\\s|$)(?!\\s*(?:'+lex.priceAfterNumber.join('|')+'))','i'),
  standaloneLabel:new RegExp('^(?:'+labels+')\\s*[:=\\-]?\\s*('+D+')\\s*(?:'+units+')?$'),
  standaloneUnit:new RegExp('^('+D+')\\s*(?:'+units+')$'),
  standalonePair:new RegExp('^(?:'+alt(Object.keys(lex.pairWords))+')$'),
  standaloneWord:new RegExp('^(?:'+labels+')?\\s*('+nums+')\\s*(?:'+units+')$'),
  guards:(lex.descriptorGuards||[]).map(g=>({names:new Set(g.names.map(norm)),before:new RegExp('(?:'+g.before.map(norm).map(esc).join('|')+')\\s*$')}))
 };
 cache.set(lex,c);return c;
}
// «[1-9]|1[0-9]|20» for max 20 — the same alternation the active matcher uses
function bareRange(max){const parts=['[1-9]'];for(let t=1;t*10<=max;t++){const top=Math.min(9,max-t*10);parts.push(t+(top===9?'[0-9]':top===0?'0':'[0-'+top+']'))}return parts.join('|')}

function boundaryMatch(text,needle,from=0){
 let index=text.indexOf(needle,from);
 while(index!==-1){
  const before=text[index-1]||'',after=text[index+needle.length]||'';
  if(!/[\p{L}\p{N}]/u.test(before)&&!/[\p{L}\p{N}]/u.test(after))return index;
  index=text.indexOf(needle,index+1);
 }
 return -1;
}
function matchesInLine(c,models,line){
 const value=c.norm(line),candidates=[];
 for(const model of models){
  let best=null;
  for(const alias of model.aliases||[]){
   let index=boundaryMatch(value,alias);
   for(const g of c.guards)if(g.names.has(alias))while(index!==-1&&g.before.test(value.slice(0,index)))index=boundaryMatch(value,alias,index+1);
   if(index!==-1&&(!best||alias.length>best.length))best={model,index,length:alias.length,alias};
  }
  if(best)candidates.push(best);
 }
 candidates.sort((a,b)=>b.length-a.length||a.index-b.index);
 const accepted=[];
 for(const item of candidates){const end=item.index+item.length;if(!accepted.some(x=>item.index<x.index+x.length&&end>x.index))accepted.push(item)}
 return accepted.sort((a,b)=>a.index-b.index);
}
function saleLine(c,value=''){
 const line=c.norm(value),operation=c.operation.exec(line);if(!operation)return line;
 const before=line.slice(0,operation.index).replace(new RegExp('\\s+'+esc(c.lex.colourConjunction)+'\\s*$'),'').trim();
 return c.newOrder.test(before)?'':before;
}
function standaloneQuantity(c,text){
 const value=c.norm(text);if(c.meta.test(value))return 0;
 let m=value.match(c.standaloneLabel)||value.match(c.standaloneUnit);
 if(m)return Math.max(1,Number(m[1]));
 if(c.standalonePair.test(value))return c.lex.pairWords[value]||0;
 m=value.match(c.standaloneWord);
 return m?c.lex.numberWords[m[1]]||0:0;
}
const colourQuantityCount=(c,text)=>[...c.norm(text).matchAll(c.colourQty)].reduce((s,m)=>s+Number(m[1]||0),0);
function colourCount(c,text){const j=c.lex.colourConjunction;return c.norm(text).split(/[^\p{L}]+/u).filter(Boolean).reduce((n,w)=>{const x=w.startsWith(j)&&c.colours.has(w.slice(j.length))?w.slice(j.length):w;return n+(c.colours.has(x)?1:0)},0)}

function quantityFor(c,lines,index,match,lineMatches,allMatches){
 const value=c.norm(lines[index]),previous=[...lineMatches].reverse().find(x=>x.index<match.index),next=lineMatches.find(x=>x.index>match.index);
 const before=value.slice(previous?previous.index+previous.length:0,match.index),after=value.slice(match.index+match.length,next?next.index:value.length);
 let n=colourQuantityCount(c,before);if(n)return{quantity:n,rule:'colour_quantity_before'};
 let f=before.match(c.labelBefore)||before.match(c.unitBefore);
 if(f)return{quantity:Math.max(1,Number(f[1])),rule:'label_or_unit_before'};
 n=colourQuantityCount(c,after);if(n)return{quantity:n,rule:'colour_quantity_after'};
 f=after.match(c.label)||after.match(c.unit)||after.match(c.bareAfter);
 if(f)return{quantity:Math.max(1,Number(f[1])),rule:'after_product'};
 if(index>0&&!allMatches[index-1].length){const q=standaloneQuantity(c,lines[index-1]);if(q&&!(index>1&&allMatches[index-2].length))return{quantity:q,rule:'line_before'}}
 let end=index+1,colours=colourCount(c,lines[index]);
 for(;end<lines.length;end++){
  if(allMatches[end].length)break;
  const q=standaloneQuantity(c,lines[end]);if(q)return{quantity:q,rule:'line_after'};
  const qm=c.norm(lines[end]).match(c.label)||c.norm(lines[end]).match(c.unit);if(qm)return{quantity:Math.max(1,Number(qm[1])),rule:'line_after'};
  if(!c.meta.test(c.norm(lines[end])))colours+=colourCount(c,lines[end]);
 }
 return colours?{quantity:colours,rule:'colour_count'}:{quantity:1,rule:'default_one'};
}

// Parse one text. Returns the same totals as the active matcher plus evidence per item.
export function parseOrderText(text,models,lexicon=DEFAULT_LEXICON){
 const c=compile(lexicon);
 const lines=String(text||'').split(/\n+/).map(l=>saleLine(c,l)).filter(Boolean),all=lines.map(l=>matchesInLine(c,models,l));
 const totals=new Map(),evidence=[];
 for(let i=0;i<lines.length;i++)for(const m of all[i]){
  const q=quantityFor(c,lines,i,m,all[i],all);
  totals.set(m.model.id,(totals.get(m.model.id)||0)+q.quantity);
  evidence.push({model_id:m.model.id,line:i,alias:m.alias,quantity:q.quantity,rule:q.rule});
 }
 return {items:[...totals].map(([model_id,quantity])=>({model_id,quantity})),evidence,lines};
}

// Learned quantity conventions on the product line (see LEARNED_DEFAULTS). productLine: raw line text.
export function inlineQuantity(productLine,{productName='',lexicon=DEFAULT_LEXICON,learned=LEARNED_DEFAULTS}={}){
 const c=compile(lexicon);
 let line=stripMeta(c.norm(productLine),c);
 for(const [typo,fix] of Object.entries(learned.typos||{}))line=line.replace(new RegExp('(^|\\s)'+esc(c.norm(typo))+'(?=\\s|$)','g'),'$1'+c.norm(fix));
 let m=line.match(new RegExp('(?:^|\\s)(?:'+alt(lexicon.quantityLabels)+')\\s*[:=\\-]?\\s*(\\d{1,2})(?!\\d)'));
 if(m&&Object.keys(learned.typos||{}).some(t=>c.norm(productLine).includes(c.norm(t)))&&+m[1]>=1&&+m[1]<=50)return{quantity:+m[1],rule:'typo'};
 for(const p of learned.phraseQuantities||[])if(new RegExp('(?:^|\\s)'+esc(c.norm(p.phrase))+'(?=\\s|$)').test(line))return{quantity:p.quantity,rule:'phrase'};
 const name=c.norm(productName);
 for(const p of learned.productWords||[])if((name+' '+line).includes(c.norm(p.product))&&new RegExp('(?:^|\\s)'+esc(c.norm(p.word))+'(?=\\s|$)').test(line))return{quantity:p.quantity,rule:'product_word'};
 const pairs=learned.inlinePairWords||{};
 for(const [w,q] of Object.entries(pairs))if(new RegExp('(?:^|\\s)'+esc(c.norm(w))+'(?=\\s|$)').test(line))return{quantity:q,rule:'pair_word'};
 if(learned.inlineNumberWords){
  m=line.match(new RegExp('(?:^|\\s)('+alt(Object.keys(lexicon.numberWords))+')\\s*(?:'+alt(lexicon.unitWords)+')(?=\\s|$)'));
  if(m&&lexicon.numberWords[m[1]]>1)return{quantity:lexicon.numberWords[m[1]],rule:'number_word'};
 }
 const L=learned.leadingNumber;
 if(L){m=line.match(new RegExp('^(\\d{1,2})\\s+(?=\\S)(?!(?:'+lexicon.priceAfterNumber.join('|')+'))'));if(m&&+m[1]>=L.min&&+m[1]<=L.max)return{quantity:+m[1],rule:'leading_number'}}
 return null;
}
// Remove phones, weights, sizes and prices before reading quantities.
export function stripMeta(text,c=compile()){
 return String(text||'')
  .replace(/(?:^|\s)0?7\d{8}(?=\s|$)/g,' ')
  .replace(/(?:وزن\S*|الوزن|طول\S*|الطول|قياس|مقاس|السعر|سعر)\s*[:=\-]?\s*\d+(?:[.,]\d+)?/g,' ')
  .replace(/\d+(?:[.,]\d+)?\s*(?:د(?:ينار)?|دنانير|jd|jod)?\s*(?:شامل|مع|و)\s*(?:ال)?توصيل/g,' ')
  .replace(/\d+(?:[.,]\d+)?\s*(?:دينار|دنانير|jd|jod)(?=\s|$)/g,' ')
  .replace(/\s+/g,' ').trim();
}

// Phrases that look like a product (a quantity is attached to them, or they stand on their own sale line)
// but match no catalogue name — candidates for a NEW product or a new alias. Generic: no product word list.
export function unknownPhrases(text,models,lexicon=DEFAULT_LEXICON){
 const c=compile(lexicon),out=new Set();
 const {lines}=parseOrderText(text,models,lexicon);
 const stopWords=new Set([...lexicon.colours,...lexicon.unitWords,...lexicon.quantityLabels,...Object.keys(lexicon.numberWords),...Object.keys(lexicon.pairWords),lexicon.colourConjunction].map(c.norm));
 for(const raw of lines){
  const line=stripMeta(raw,c);
  if(!line||matchesInLine(c,models,line).length)continue;
  const hasQty=c.label.test(line)||c.unit.test(line)||/^\d{1,2}\s+\S/.test(line)||colourQuantityCount(c,line)>0;
  if(!hasQty||c.meta.test(line)||/0?7\d{8}/.test(raw))continue;
  const words=line.split(' ').filter(w=>!/^\d+$/.test(w)&&!stopWords.has(w)&&w.length>1);
  const phrase=words.join(' ').trim();
  if(phrase.length>=3&&words.length<=5)out.add(phrase);
 }
 return [...out];
}
