// CORVEX central product engine (shadow phase — see docs/PRODUCT_ENGINE.md).
// ONE place that answers, for an order: which products (stable ids/keys), how many pieces,
// and the approved unit cost. Phase 1: a faithful extraction of the shipment-day profit engine's
// item logic (profit-shipping-cohorts.js, which stays unchanged and active), plus store-scoped
// approved aliases. Nothing here writes to the database; no section uses it yet except the
// read-only comparison endpoint (/api/product-engine). Activation needs the owner's approval.
import {loadInventoryModels,FUR_ALIASES} from './_inventory.js';
import {loadCostedModels,approvedCost,canonicalModelName,normalizeArabic,STATI_ALIASES,FILLER_ALIASES,round2} from './_partial-delivery.js';

import {PRODUCT_KNOWLEDGE,NAME_SYNONYMS,KNOWLEDGE_VERSION} from './_product-knowledge.js';
import {parseOrderText,inlineQuantity,DEFAULT_LEXICON,LEARNED_DEFAULTS,LANGUAGE_VERSION} from './_order-language.js';
// The generic order-language parser replaces the matcher here (identical with DEFAULT_LEXICON — tested).
const parse=(text,models,lexicon=DEFAULT_LEXICON)=>parseOrderText(text,models,lexicon).items;
export const ENGINE_VERSION='product-engine-3-shadow';
const key=x=>normalizeArabic(x);
// ---- copied verbatim from profit-shipping-cohorts.js (kept identical; equivalence is tested)
const MODEL_COSTS=[
 {name:'جاكيت فرو',cost:4},{name:'جاكيت جوخ كاجوال',cost:5.2},{name:'جاكيت جوخ سكايفو',cost:7.55},{name:'مالئ الفراغات',cost:1},
 {name:'بنطلون جيوب سحاب',cost:2.3},{name:'بنطلون رياضة سحاب',cost:2.7},{name:'بنطلون تركي',cost:2.7},{name:'بنطلون زرار',cost:2.2},{name:'بنطلون جيوب',cost:2.2},
 {name:'تيشيرت سادة تريكو',cost:2.5},{name:'بجامة جاكار',cost:4.25},{name:'تيشيرت بولو',cost:3.5}
];
const listCost=name=>MODEL_COSTS.find(m=>key(m.name)===key(name))?.cost??null;
// Approved costs first (fur / jokh casual / jokh scarfo incl. stati / gap filler), then the
// report's fixed list, then the catalogue cost when it is set (> 0). Otherwise unknown.
const unitCostFor=(name,catalogueCost)=>approvedCost({name})??listCost(name)??(Number(catalogueCost)>0?Number(catalogueCost):null);

const FALLBACK_MODELS=[
 {id:-1,name:'جاكيت فرو',aliases:[...FUR_ALIASES]},
 {id:-2,name:'جاكيت جوخ كاجوال',aliases:['جاكيت جوخ كاجوال','جكيت جوخ كاجوال','جاكيت جوخ كاجول','جوخ كاجوال','جاكيت الجوخ الكاجوال']},
 {id:-3,name:'جاكيت جوخ سكايفو',aliases:['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت جوخ سكارفو','جاكيت الجوخ سكارفو','جوخ سكايفو','جوخ سكارفو','جاكيت سكايفو','جاكيت سكارفو','جاكيت نسائي','جكيت نسائي','جاكيت نساءي','جكيت نساءي','جوخ شتائي',...STATI_ALIASES]},
 {id:-4,name:'مالئ الفراغات',aliases:['مالئ الفراغات','مالى الفراغات','ملي الفراغات','مالئ فراغات',...FILLER_ALIASES]},
 {id:-5,name:'بنطلون جيوب سحاب',aliases:['بنطلون جيوب سحاب','جيوب سحاب']},
 {id:-6,name:'بنطلون رياضة سحاب',aliases:['بنطلون رياضة سحاب','بنطلون رياضه سحاب','رياضة سحاب']},
 {id:-7,name:'بنطلون تركي',aliases:['بنطلون تركي']},
 {id:-8,name:'بنطلون زرار',aliases:['بنطلون زرار']},
 {id:-9,name:'بنطلون جيوب',aliases:['بنطلون جيوب']},
 {id:-10,name:'تيشيرت سادة تريكو',aliases:['تيشيرت سادة تريكو','تيشيرت ساده تريكو']},
 {id:-11,name:'بجامة جاكار',aliases:['بجامة جاكار','بجامه جاكار','ترينغ','تريننغ']},
 {id:-12,name:'تيشيرت بولو',aliases:['تيشيرت بولو تريكو','بولو ترند','تيشيرت بولو','بولو']},
 // Models that exist in the app's product catalogue (product-rules.js) with their
 // approved costs but are missing from the server profit_models table.
 {id:-13,name:'تيشيرت برادا',cost:2.4,aliases:['تيشيرت برادا','تيشرت برادا','بلوزه برادا','بلوز برادا','برادا']},
 {id:-14,name:'جاكيت ترند',cost:4,aliases:['جاكيت ترند','جكيت ترند','ترند جاكيت']},
 {id:-15,name:'بلوزة سادة كوم',cost:3.5,aliases:['بلوزه ساده كوم','بلوز ساده كوم','ساده كوم']},
 {id:-16,name:'تيشيرت N',cost:3,aliases:['تيشيرت n','تيشرت n','تيشيرت حرف n','تيشرت حرف n','بلوزه n','حرف n']},
 {id:-17,name:'جاكيت نايك',cost:6,aliases:['جاكيت نايك','جكيت نايك','نايك جاكيت']},
 {id:-18,name:'بلوز صوف',cost:3.5,aliases:['بلوز صوف','بلوزه صوف','صوف بلوز']}
].map(m=>({...m,unit_cost:m.cost??null,aliases:[...new Set(m.aliases.map(key))].sort((a,b)=>b.length-a.length)}));

const BARE_JOKH=/(?:^|[^\p{L}])(?:جكيت|جاكيت|جاكت)\s+جوخ(?![\p{L}])(?!\s*(?:ال)?(?:كاجوال|كاجول|سكايفو|سكارفو|ستا|شتا|نسا))/u;
const QTY_LABEL=/(?:^|[^\p{L}])(?:عدد|العدد|كميه|الكميه|كمية|الكمية)\s*[:：=\-]?\s*(\d{1,2})(?!\d)/u;
// Explicit quantity in a free-text field: «عدد2», «الكمية: 3», «قطعتين», «لونين».
function explicitQuantity(text){
 const t=key(text);const m=t.match(QTY_LABEL);if(m)return Number(m[1]);
 if(/(?:^|\s)(?:قطعتين|قطعتان|حبتين|لونين)(?=\s|$)/.test(t))return 2;
 const u=t.match(/(?:^|\s)(\d{1,2})\s*(?:قطعه|قطع|حبه|حبات)(?=\s|$)/);return u?Number(u[1]):0;
}
const hasQuantityMarker=text=>/(?:عدد|العدد|كميه|كمية|قطعه|قطع|حبه|حبات|قطعتين|قطعتان|لونين|الوان|\d)/.test(key(text).replace(/(?:وزن|الوزن|طول|مقاس|قياس|سعر|السعر)\S*\s*\d+/g,' ').replace(/0?7\d{8}/g,' ').replace(/\d+(?:[.,]\d+)?\s*(?:دينار|دنانير|jd)/gi,' '));

// ---- catalogue (cohort loadModels, verbatim) + Corvex-only approved aliases
async function cohortModels(env){
 let catalogueError='';
 let catalogue=[];
 try{catalogue=await loadCostedModels(env)}
 catch(error){
  // A failed one-time catalogue migration must not silently drop the whole catalogue
  // (that leaves only the short fallback list and most orders unrecognised).
  console.error('cohort: catalogue migration failed, loading catalogue directly',error);
  catalogueError=String(error?.message||error);
  try{
   const base=await loadInventoryModels(env);
   const rows=(await env.DB.prepare('SELECT id,name,cost FROM profit_models WHERE active=1').all()).results||[];
   const cost=new Map(rows.map(r=>[Number(r.id),Number(r.cost||0)]));
   catalogue=base.map(m=>({...m,unit_cost:approvedCost({name:m.name})??cost.get(m.id)??0}));
  }catch(inner){catalogueError+=' | '+String(inner?.message||inner);catalogue=[]}
 }
 const names=new Set(catalogue.map(m=>key(canonicalModelName(m.name))));
 // Merge approved aliases even when a catalogue row already exists.
 const enriched=catalogue.map(m=>{
  const fallback=FALLBACK_MODELS.find(f=>key(f.name)===key(canonicalModelName(m.name)));
  return fallback?{...m,aliases:[...new Set([...(m.aliases||[]),...fallback.aliases])].sort((a,b)=>b.length-a.length)}:m;
 });
 const models=[...enriched,...FALLBACK_MODELS.filter(m=>!names.has(key(m.name)))];
 return {models,catalogueError};
}
// One line per canonical model (stati is folded into scarfo); quantities summed, never duplicated.
function mergeItems(raw,models){
 const byName=new Map();
 for(const x of raw){
  const model=models.find(m=>m.id===Number(x.model_id))||{};
  const name=canonicalModelName(x.name||model.name||'موديل غير معروف');
  const unit=unitCostFor(name,model.unit_cost);
  const prev=byName.get(key(name))||{model_id:Number(x.model_id),name,quantity:0,received:0,unit_cost:unit};
  prev.quantity+=Number(x.quantity||0);prev.received+=Number(x.received??x.quantity??0);
  byName.set(key(name),prev);
 }
 return [...byName.values()].map(i=>({...i,total_cost:i.unit_cost===null?null:round2(i.quantity*i.unit_cost),received_cost:i.unit_cost===null?null:round2(i.received*i.unit_cost)}));
}
export async function receivedItems(env,order,models){
 const raw=String(order.partial_received_items||'').trim();if(!raw)return null;
 let parsed=null;try{parsed=JSON.parse(raw)}catch{}
 if(Array.isArray(parsed)){
  const list=parsed.map(x=>({model_id:Number(x.model_id||0),name:x.model_name||'',quantity:Number(x.shipped??x.quantity??0),received:Number(x.received??x.quantity??0)}));
  if(list.some(x=>!Number.isFinite(x.received)||x.received<0))return null;
  return mergeItems(list,models);
 }
 const matches=parse(raw,models);
 return matches.length?mergeItems(matches.map(x=>({...x,received:x.quantity})),models):null;
}


// Stable product reference: catalogue model_key, otherwise «name:<canonical name>» (fallback list).
export const productRef=m=>m&&m.key?String(m.key):'name:'+key(canonicalModelName(m?.name||''));

export async function ensureProductAliasTable(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_aliases(id INTEGER PRIMARY KEY AUTOINCREMENT,store_id INTEGER NOT NULL,
  product_ref TEXT NOT NULL,alias TEXT NOT NULL,alias_raw TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
  proposed_by INTEGER,proposed_via TEXT NOT NULL DEFAULT 'admin',note TEXT NOT NULL DEFAULT '',test_json TEXT NOT NULL DEFAULT '',
  decided_by INTEGER,decided_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,alias,status))`).run();
}

// Interpretation memory (future CORVEX AI memory; nothing reads it for calculations):
// original text → system interpretation → user correction → approved rule + approval date.
// ai_training_allowed stays 0: customer data is never sent to train external models without owner approval.
export async function ensureInterpretationTable(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_interpretations(id INTEGER PRIMARY KEY AUTOINCREMENT,store_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,source_field TEXT NOT NULL DEFAULT '',source_text TEXT NOT NULL DEFAULT '',source_hash TEXT NOT NULL,
  engine_version TEXT NOT NULL,system_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'recorded',
  corrected_json TEXT,correction_note TEXT NOT NULL DEFAULT '',corrected_by INTEGER,corrected_at TEXT,
  rule_kind TEXT,rule_ref TEXT,rule_status TEXT,rule_approved_by INTEGER,rule_approved_at TEXT,
  ai_training_allowed INTEGER NOT NULL DEFAULT 0,created_by INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id,order_id,engine_version,source_hash))`).run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_order_interpretations_order ON order_interpretations(store_id,order_id)').run();
}
export function textHash(text){let h=2166136261;for(const c of String(text||'')){h^=c.codePointAt(0);h=Math.imul(h,16777619)>>>0}return h.toString(16)}

// Store language (how this store's staff write orders), learned with approval: propose → test → approve.
// Each approved entry extends the generic lexicon for that store only — no code change.
export const LEXICON_KINDS={
 colour:{field:'colours',label:'لون'},unit:{field:'unitWords',label:'وحدة/عبوة'},quantity_label:{field:'quantityLabels',label:'كلمة كمية'},
 meta_word:{field:'metaWords',label:'كلمة ليست منتجًا (سعر/عنوان/وزن…)'},operation_word:{field:'operationWords',label:'كلمة إرجاع/تبديل'},
 number_word:{field:'numberWords',label:'رقم بالكلمات',needs:'quantity'},pair_word:{learned:'inlinePairWords',label:'كلمة تعني كمية',needs:'quantity'},
 typo:{learned:'typos',label:'خطأ إملائي',needs:'fix'},phrase_quantity:{learned:'phraseQuantities',label:'عبارة تعني كمية',needs:'quantity'},
 product_word:{learned:'productWords',label:'كلمة عرض لمنتج',needs:'product+quantity'}
};
export async function ensureLexiconTable(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS store_lexicon(id INTEGER PRIMARY KEY AUTOINCREMENT,store_id INTEGER NOT NULL,kind TEXT NOT NULL,
  value TEXT NOT NULL,value_raw TEXT NOT NULL,data_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',proposed_by INTEGER,
  proposed_via TEXT NOT NULL DEFAULT 'admin',note TEXT NOT NULL DEFAULT '',test_json TEXT NOT NULL DEFAULT '',decided_by INTEGER,decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,kind,value,status))`).run();
}
export function buildLexicon(entries=[]){
 const lex={...DEFAULT_LEXICON,colours:[...DEFAULT_LEXICON.colours],unitWords:[...DEFAULT_LEXICON.unitWords],quantityLabels:[...DEFAULT_LEXICON.quantityLabels],
  metaWords:[...DEFAULT_LEXICON.metaWords],operationWords:[...DEFAULT_LEXICON.operationWords],numberWords:{...DEFAULT_LEXICON.numberWords}};
 const learned={...LEARNED_DEFAULTS,typos:{...LEARNED_DEFAULTS.typos},inlinePairWords:{...LEARNED_DEFAULTS.inlinePairWords},
  phraseQuantities:[...LEARNED_DEFAULTS.phraseQuantities],productWords:[...LEARNED_DEFAULTS.productWords]};
 for(const e of entries){
  const k=LEXICON_KINDS[e.kind];if(!k)continue;let d={};try{d=JSON.parse(e.data_json||'{}')}catch{}
  const v=key(e.value);if(!v)continue;
  if(k.field==='numberWords')lex.numberWords[v]=Number(d.quantity)||0;
  else if(k.field){if(!lex[k.field].includes(v))lex[k.field].push(v)}
  else if(k.learned==='inlinePairWords')learned.inlinePairWords[v]=Number(d.quantity)||0;
  else if(k.learned==='typos')learned.typos[v]=key(d.fix||'');
  else if(k.learned==='phraseQuantities')learned.phraseQuantities.push({phrase:v,quantity:Number(d.quantity)||0});
  else if(k.learned==='productWords')learned.productWords.push({product:key(d.product||''),word:v,quantity:Number(d.quantity)||0});
 }
 return {lexicon:lex,learned};
}
async function storeLexicon(env,storeId){
 if(!storeId)return [];
 try{await ensureLexiconTable(env);return (await env.DB.prepare("SELECT kind,value,data_json FROM store_lexicon WHERE store_id=? AND status='approved'").bind(storeId).all()).results||[]}catch{return []}
}

// storeId: aliases approved for that store are added to their product (Corvex only for now).
// extraAliases: [{product_ref, alias}] — used by the dry-run test of a proposed alias.
// Accumulated knowledge (_product-knowledge.js): its aliases are added to the catalogue product with
// the same canonical name (older engines' names via NAME_SYNONYMS); products only the older engines
// know become knowledge products (ids -101…). An alias already owned by another product is never moved.
const canonicalFor=name=>{const n=canonicalModelName(name);const syn=Object.entries(NAME_SYNONYMS).find(([a])=>key(a)===key(n));return key(syn?syn[1]:n)};
export function withKnowledge(models){
 const owner=new Map();for(const m of models)for(const a of m.aliases||[])if(!owner.has(a))owner.set(a,m.id);
 const out=models.map(m=>({...m,aliases:[...(m.aliases||[])]}));
 PRODUCT_KNOWLEDGE.forEach((k,i)=>{
  if(k.status==='disabled')return;
  let target=out.find(m=>canonicalFor(m.name)===key(k.product));
  if(!target){target={id:-101-i,name:k.product,unit_cost:k.cost??null,aliases:[],knowledge_id:k.id};out.push(target)}
  for(const a of [...k.aliases,...(k.review||[])].map(key).filter(a=>a.length>1)){
   if(owner.has(a)&&owner.get(a)!==target.id)continue;
   if(!target.aliases.includes(a))target.aliases.push(a);owner.set(a,target.id);
  }
  target.aliases.sort((a,b)=>b.length-a.length);
 });
 return out;
}
export async function loadCatalogue(env,{storeId=0,extraAliases=[],knowledge=true,extraLexicon=[]}={}){
 const base=await cohortModels(env),catalogueError=base.catalogueError;
 const models=knowledge?withKnowledge(base.models):base.models;
 let approved=[];
 if(storeId){try{await ensureProductAliasTable(env);approved=(await env.DB.prepare("SELECT product_ref,alias FROM product_aliases WHERE store_id=? AND status='approved'").bind(storeId).all()).results||[]}catch{}}
 const add=[...approved,...extraAliases];
 const out=models.map(m=>{
  const ref=productRef(m),extra=add.filter(a=>a.product_ref===ref).map(a=>key(a.alias)).filter(a=>a.length>1);
  return extra.length?{...m,aliases:[...new Set([...(m.aliases||[]),...extra])].sort((a,b)=>b.length-a.length)}:m;
 });
 // knowledge:false = exactly the active engine (default lexicon, no learned conventions, no store language)
 const lang=knowledge?buildLexicon([...(await storeLexicon(env,storeId)),...extraLexicon]):{lexicon:DEFAULT_LEXICON,learned:null};
 return {models:out,catalogueError,storeId,knowledge,lexicon:lang.lexicon,learned:lang.learned,
  version:ENGINE_VERSION+'+'+LANGUAGE_VERSION+(knowledge?'+'+KNOWLEDGE_VERSION:'')};
}

export function describeCatalogue(cat){
 return cat.models.map(m=>{const name=canonicalModelName(m.name);const unit=unitCostFor(name,m.unit_cost);
  return {ref:productRef(m),id:m.id>0?m.id:null,key:m.key||null,name,aliases:m.aliases||[],unit_cost:unit,
   cost_source:approvedCost({name})!=null?'approved':listCost(name)!=null?'fixed_list':unit!=null?'catalogue':'unknown',in_database:m.id>0}});
}

// ---- items of one order (cohort item logic, verbatim; returns the same structure plus refs)

// allocation: [{model_id,name,quantity}] from inventory_order_items (print-time deduction), used
// only when the text cannot be read — exactly like the cohort engine.
export async function resolveOrderItems(env,o,cat,allocation=null){
 const models=cat.models;
  let items=[],itemSource='none';
  const trace=[];
  const sources=[['order_notes',String(o.order_notes||'')],['raw_text',String(o.raw_text||'')]];
  for(const [source,text] of sources){
   if(!text.trim()){trace.push({source,empty:true});continue}
   const parsed=parse(text,models,cat.lexicon);
   trace.push({source,found:parsed.map(x=>({name:(models.find(m=>m.id===Number(x.model_id))||{}).name||String(x.model_id),quantity:x.quantity}))});
   if(!parsed.length)continue;
   let list=parsed;
   // Quantity written only in the other field («عدد2» in notes, product in raw_text):
   // use it for a single-model order whose own text carries no quantity at all.
   // The sources are never added together, so the same piece is not counted twice.
   const other=sources.find(([name])=>name!==source)[1];
   if(parsed.length===1&&parsed[0].quantity===1&&!hasQuantityMarker(text)&&other.trim()&&!parse(other,models,cat.lexicon).length){
    const q=explicitQuantity(other);if(q>1){list=[{...parsed[0],quantity:q}];trace.push({source:'quantity_from_'+sources.find(([name])=>name!==source)[0],quantity:q})}
   }
   items=mergeItems(list,models);itemSource=source;break;
  }
  // «جكيت جوخ» / «جاكيت جوخ» with no model word is jokh scarfo only for a single piece.
  if(!items.length){
   const scarfo=models.find(m=>key(canonicalModelName(m.name))===key('جاكيت جوخ سكايفو'));
   for(const [source,text] of sources){
    if(!scarfo||!text.trim()||!BARE_JOKH.test(key(text)))continue;
    const probe=parse(text,[{id:scarfo.id,name:scarfo.name,aliases:['جاكيت جوخ','جكيت جوخ','جاكت جوخ']}],cat.lexicon);
    const other=sources.find(([name])=>name!==source)[1];
    const otherQ=explicitQuantity(other);
    const q=probe.reduce((n,x)=>n+x.quantity,0);
    trace.push({source:source+'_bare_jokh',quantity:q,other_quantity:otherQ});
    if(probe.length===1&&q===1&&otherQ<=1){items=mergeItems([{model_id:scarfo.id,name:scarfo.name,quantity:1}],models);itemSource=source+'_bare_jokh_single'}
    break;
   }
  }
  // Knowledge quantity conventions (Q-* rules): single-product orders read as 1 piece only.
  if(cat.knowledge&&items.length===1&&items[0].quantity===1&&(itemSource==='order_notes'||itemSource==='raw_text')){
   const text=sources.find(([name])=>name===itemSource)[1],model=models.find(m=>m.id===Number(items[0].model_id))||{};
   for(const line of text.split(/\n+/)){
    if(!line.trim()||!parse(line,models,cat.lexicon).length)continue;
    const kq=inlineQuantity(line,{productName:model.name||items[0].name,lexicon:cat.lexicon,learned:cat.learned});
    if(kq){items=mergeItems([{model_id:items[0].model_id,name:model.name||items[0].name,quantity:kq.quantity}],models);trace.push({source:'knowledge',rule:kq.rule,quantity:kq.quantity})}
    break;
   }
  }
  if(!items.length&&allocation?.length){items=mergeItems(allocation,models);itemSource='inventory'}
 const itemsValid=items.length>0&&items.every(i=>Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=50);
 const byId=new Map(models.map(m=>[m.id,m]));
 return {items:items.map(i=>({...i,ref:productRef(byId.get(Number(i.model_id))||{name:i.name})})),source:itemSource,trace,valid:itemsValid,
  cost:itemsValid&&items.every(i=>i.unit_cost!==null)?round2(items.reduce((n,i)=>n+i.total_cost,0)):null};
}
