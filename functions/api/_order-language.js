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
 maxQuantityDigits:3,
 // ---- context (T-11): used only when requireContext is on (central engine). A single general word is not
 // enough to name a product: it needs product evidence on its line, and never counts on a personal line.
 personalMarkers:['الاسم','اسم','ام','ابو','السيد','السيده','الاخ','الاخت','المستلم','الزبون','العميل'],
 addressWords:['شارع','حي','منطقه','قرب','بجانب','جانب','مقابل','خلف','دوار','اشاره','عماره','بنايه','عمارة','طابق','شقه','محافظه','مدينه','قريه','بلده','عمان','اربد','الزرقاء','الزرقا','العقبه','مادبا','الكرك','جرش','عجلون','المفرق','السلط','البلقاء','الطفيله','معان','الاغوار','الغور'],
 sizeWords:['xs','s','m','l','xl','xxl','xxxl','سمول','ميديوم','لارج','اكس','اكسل','مقاس','قياس','نمره','نمرة'],
 // ---- whole-order analysis (unknown products / unclear details). Generic commerce & date vocabulary, used only by
 // analyzeOrder — never by the reading of quantities above. All data, extendable per store.
 analysis:{
  units:['قطعه','قطع','قطعتين','قطعتان','حبه','حبات','حبتين','عبوه','عبوات','علبه','علب','كرتونه','كراتين','كيس','اكياس','زوج','ازواج','دزينه','باكيت','بكت','طقم','اطقم','نسخه','نسخ','pcs','pc','piece','pieces'],
  colours:['خمري','سكري','كريمي','اورنج','ذهبي','فضي','عنابي','تركواز','فيروزي','نيلي','كاكي','جملي','ليموني','سود','بيض','black','white','red','blue','green','grey','gray','beige','navy'],
  sizes:['لارج','اكس','اكسل','ميديوم','مديم','سمول','فري','سايز','دبل','2xl','3xl','4xl','5xl','xs','s','m','l','xl','xxl','xxxl','مقاس','قياس','نمره','المقاس','القياس'],
  measures:['وزن','الوزن','وزنه','وزنها','طول','الطول','طوله','طولها','كيلو','كيلوات','كغم','كغ','kg','سم','cm','عمر','عمره','عمرها','سنه','سنين','شهر'],
  price:['دينار','دنانير','د','jd','jod','سعر','السعر','شامل','التوصيل','توصيل','بالتوصيل','مجاني','delivery','included','include','free','shipping','price','total','المجموع','الاجمالي','خصم'],
  dates:['يناير','فبراير','مارس','ابريل','مايو','يونيو','يوليو','اغسطس','سبتمبر','اكتوبر','نوفمبر','ديسمبر','كانون','شباط','اذار','نيسان','ايار','حزيران','تموز','اب','ايلول','تشرين','الاول','الثاني',
   'january','february','march','april','may','june','july','august','september','october','november','december','am','pm','ص','م','الساعه','ساعه','صباحا','مساء','مساءا','الصبح','المسا','اليوم','بكرا','بكره','امس','مبارح','الاحد','الاثنين','الثلاثاء','الاربعاء','الخميس','الجمعه','السبت'],
  fillers:['و','او','مع','في','فيه','على','عل','من','الى','عن','لون','الوان','اللون','الالوان','كل','عدد','العدد','كميه','الكميه','كمية','الكمية','نوع','موديل','الموديل','طلب','الطلب','جديد','بدي','بدها','بده','لو','سمحت','يا','هاد','هذا','هذه','هاي','اياه','اياها','منه','منها','منهم','ال']
 }
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
  personal:new RegExp('^(?:'+alt((lex.personalMarkers||[]).map(norm))+')(?:\\s|[:：\\-])'),
  address:new RegExp('(?:^|\\s)(?:'+alt((lex.addressWords||[]).map(norm))+')(?=\\s|$|[،,\\-])'),
  size:new RegExp('(?:^|\\s)(?:'+alt((lex.sizeWords||[]).map(norm))+')(?=\\s|$|\\d)'),
  priceOnLine:new RegExp('\\d+(?:[.,]\\d+)?\\s*(?:'+lex.priceAfterNumber.join('|')+')','i'),
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

// A line about a person or a place (name marker at the start, address word, phone number).
export function personalLine(line,lexicon=DEFAULT_LEXICON){const c=compile(lexicon),v=c.norm(line);return c.personal.test(v)||c.address.test(v)||/(?:^|\D)0?7\d{8}(?:\D|$)/.test(v)}
// T-11: is there product evidence for a single general word on this line?
function weakAccepted(c,line,match,q,lineMatches){
 if(personalLine(line,c.lex))return {ok:false,reason:'personal_or_address_line'};
 if(q.rule!=='default_one')return {ok:true};
 if(lineMatches.some(x=>x!==match&&x.alias.includes(' ')))return {ok:true};
 if(c.size.test(line)||c.priceOnLine.test(line))return {ok:true};
 return {ok:false,reason:'no_product_evidence'};
}

// Parse one text. Returns the same totals as the active matcher plus evidence per item.
// options.requireContext (central engine only): single-word names need product evidence (T-11); rejected
// matches are returned in `uncertain` — never guessed.
export function parseOrderText(text,models,lexicon=DEFAULT_LEXICON,options={}){
 const c=compile(lexicon);
 const lines=String(text||'').split(/\n+/).map(l=>saleLine(c,l)).filter(Boolean),all=lines.map(l=>matchesInLine(c,models,l));
 const totals=new Map(),evidence=[],uncertain=[];
 for(let i=0;i<lines.length;i++)for(const m of all[i]){
  const q=quantityFor(c,lines,i,m,all[i],all);
  if(options.requireContext&&!m.alias.includes(' ')){const w=weakAccepted(c,lines[i],m,q,all[i]);if(!w.ok){uncertain.push({model_id:m.model.id,line:i,alias:m.alias,reason:w.reason});continue}}
  totals.set(m.model.id,(totals.get(m.model.id)||0)+q.quantity);
  evidence.push({model_id:m.model.id,line:i,alias:m.alias,quantity:q.quantity,rule:q.rule});
 }
 return {items:[...totals].map(([model_id,quantity])=>({model_id,quantity})),evidence,uncertain,lines};
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

// ================= Whole-order analysis (T-11 spirit: understand context, never guess) =================
// Splits every order into: known products (catalogue), details (quantity, colour, size, unit, measure, price,
// date/time, phone, name/address of THIS order), possible new products, possible spellings of a known
// product, and unclear details for review. Generic: no product word list — only the store's catalogue and
// the lexicon. Used for discovery/review only; it never changes a reading, a quantity or a cost.
const lev=(a,b)=>{if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return m||n;let p=[...Array(n+1).keys()];for(let i=1;i<=m;i++){const q=[i];for(let j=1;j<=n;j++)q[j]=Math.min(p[j]+1,q[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=q}return p[n]};
// grouping key: no «ال», no repeated letters, no spaces («بيسك» = «البيسك» = «بييسك»)
export const phraseKey=t=>String(t||'').split(' ').map(w=>w.replace(/^(?:وال|بال|ال)(?=\p{L}{2,})/u,'')).join('').replace(/(\p{L})\1+/gu,'$1');

function analysisSets(c){
 if(c.__an)return c.__an;
 const L=c.lex,A=L.analysis||{},N=w=>c.norm(w),set=list=>new Set((list||[]).map(N));
 const an={
  units:set([...L.unitWords,...(A.units||[])]),
  colours:set([...L.colours,...(A.colours||[])]),
  sizes:set([...(L.sizeWords||[]),...(A.sizes||[])]),
  measures:set(A.measures),price:set(A.price),dates:set(A.dates),
  labels:set(L.quantityLabels),numbers:new Set(Object.keys(L.numberWords).map(N)),pairs:new Set([...Object.keys(L.pairWords),...Object.keys(LEARNED_DEFAULTS.inlinePairWords)].map(N)),
  fillers:set([...(A.fillers||[]),L.colourConjunction]),operations:set(L.operationWords),personal:set(L.personalMarkers||[]),address:set(L.addressWords||[])
 };
 return c.__an=an;
}
// Split numbers glued to words («2أسود», «عدد2», «3قطع», «25قطعة»), keep times/ratios/dates, drop punctuation.
function tokens(line){
 return line
  .replace(/\b\d{1,2}:\d{2}\b/g,' __time__ ').replace(/\b\d{1,4}[\/\-.]\d{1,4}(?:[\/\-.]\d{2,4})?\b/g,' __ratio__ ')
  .replace(/(\d)(\p{L})/gu,'$1 $2').replace(/(\p{L})(\d)/gu,'$1 $2')
  .replace(/[()\[\]{}«»"'`،,؛;:!?؟.*+=#_\-–—\/\\|<>~^&%$@]/g,m=>m==='_'?m:' ')
  .split(/\s+/).filter(Boolean);
}
function classifyToken(w,an,personalWords){
 if(w==='__time__'||w==='__ratio__')return w==='__time__'?'date':'measure';
 if(/^\d+$/.test(w))return 'number';
 const bare=w.length>2&&w.startsWith('و')?w.slice(1):w;
 if(personalWords.has(w)||personalWords.has(bare))return 'personal';
 for(const [k,s] of [['unit',an.units],['colour',an.colours],['size',an.sizes],['measure',an.measures],['price',an.price],['date',an.dates],['quantity',an.labels],['quantity',an.numbers],['quantity',an.pairs],['operation',an.operations]])
  if(s.has(w)||s.has(bare))return k;
 if(an.fillers.has(w))return 'filler';
 if(an.address.has(w)||an.address.has(bare))return 'address';
 return 'word';
}
const SIGNAL=new Set(['number','unit','colour','size','quantity']);

export function analyzeOrder(order,models,lexicon=DEFAULT_LEXICON){
 const c=compile(lexicon),an=analysisSets(c);
 const fields=[['order_notes',String(order.order_notes||'')],['raw_text',String(order.raw_text||'')]];
 // whole-order context: this order's own name / area / address / phone words are personal, never products
 const personalWords=new Set(tokens(c.norm([order.recipient_name,order.area,order.detailed_address].filter(Boolean).join(' '))).filter(w=>w.length>1&&!/^\d+$/.test(w)));
 const amount=Number(order.amount||0);
 const out={known:[],candidates:[],unclear:[],details:0};
 const seen=new Set();
 for(const [field,text] of fields){
  if(!text.trim())continue;
  const rawLines=text.split(/\n+/);
  const lines=rawLines.map(l=>{
   const v=saleLine(c,l);if(!v)return {kind:'empty'};
   if(/(?:^|\D)(?:\+?962|0)?7\d{8}(?:\D|$)/.test(v.replace(/[\s-]/g,'')))return {kind:'personal'};
   if(personalLine(v,lexicon))return {kind:'personal'};
   const matches=matchesInLine(c,models,v);
   let rest=v;for(const m of [...matches].sort((a,b)=>b.index-a.index))rest=rest.slice(0,m.index)+' '+rest.slice(m.index+m.length);
   const toks=tokens(rest).map(w=>({w,k:classifyToken(w,an,personalWords)}));
   // the order amount next to a price word, or equal to the order amount, is a price
   for(const t of toks)if(t.k==='number'&&amount&&Number(t.w)===amount&&toks.some(x=>x.k==='price'))t.k='price';
   const words=toks.filter(t=>t.k==='word').map(t=>t.w);
   return {kind:matches.length?'product':words.length?'text':'detail',signal:toks.some(t=>SIGNAL.has(t.k)),words,dateOrPrice:toks.some(t=>t.k==='date'||t.k==='price'||t.k==='measure'),
    known:matches.map(m=>m.model.name),toks};
  });
  for(let i=0;i<lines.length;i++){
   const L=lines[i];if(L.kind==='product')out.known.push(...L.known);
   if(L.kind==='detail')out.details++;
   if(L.kind!=='text')continue;
   // context: a text line borrows the product signal of the detail-only line(s) right after it (e.g. «بيسك» / «2 اسود 1 ابيض»)
   let signal=L.signal;
   for(let j=i+1;!signal&&j<lines.length&&lines[j].kind==='detail';j++)signal=lines[j].signal;
   const phrase=L.words.join(' ');
   if(phrase.length<2)continue;
   const kind=signal&&L.words.length<=5&&!(L.dateOrPrice&&!L.toks.some(t=>t.k==='unit'||t.k==='colour'||t.k==='size'||t.k==='quantity'))?'candidate':'unclear';
   // unclear lines are reviewed from the product field only (raw_text also carries chat, names and addresses)
   if(kind==='unclear'&&field==='raw_text'&&fields[0][1].trim())continue;
   const key=phraseKey(phrase);if(seen.has(kind+key))continue;seen.add(kind+key);
   if(kind==='candidate'){
    // before calling it new: is it a spelling of a known product (catalogue + knowledge)?
    let near=null;
    for(const m of models)for(const a of m.aliases||[])for(const target of [a,...(a.includes(' ')?a.split(' ').filter(w=>phraseKey(w).length>=4):[])]){
     const d=lev(phraseKey(target),key),lim=key.length>=6?2:1;
     if(key.length>=3&&d<=lim&&(!near||d<near.d))near={d,name:m.name,alias:a};
    }
    out.candidates.push({phrase,key,field,near:near?{name:near.name,alias:near.alias}:null});
   }else out.unclear.push({phrase:rawLines[i].trim().slice(0,80)||phrase,key,field,line:rawLines[i].trim().slice(0,120)});
  }
 }
 out.known=[...new Set(out.known)];
 return out;
}

// Backwards-compatible helper: possible NEW product phrases of a text (used by correction suggestions).
export function unknownPhrases(text,models,lexicon=DEFAULT_LEXICON){
 return analyzeOrder({order_notes:text},models,lexicon).candidates.filter(c=>!c.near).map(c=>c.phrase);
}

// Group candidates across many orders: one entry per probable product, with its written variants.
export function groupPhrases(list){
 const groups=[];
 for(const x of list){
  let g=groups.find(g=>g.key===x.key||(x.key.length>=4&&g.key.length>=4&&lev(g.key,x.key)<=1));
  if(!g){g={key:x.key,label:x.phrase,variants:new Map(),orders:new Set(),examples:[],near:x.near||null};groups.push(g)}
  g.variants.set(x.phrase,(g.variants.get(x.phrase)||0)+1);
  if(!g.orders.has(x.order_id)){g.orders.add(x.order_id);if(g.examples.length<8)g.examples.push({id:x.order_id,order_code:x.order_code})}
  if(!g.near&&x.near)g.near=x.near;
 }
 return groups.map(g=>{const variants=[...g.variants].sort((a,b)=>b[1]-a[1]);return {label:variants[0][0],key:g.key,orders:g.orders.size,
  variants:variants.map(([phrase,n])=>({phrase,n})),examples:g.examples,near:g.near,order_ids:[...g.orders]}}).sort((a,b)=>b.orders-a.orders);
}
