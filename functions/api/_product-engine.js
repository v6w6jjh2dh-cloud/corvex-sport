// CORVEX central product engine (shadow phase — see docs/PRODUCT_ENGINE.md).
// ONE place that answers, for an order: which products (stable ids/keys), how many pieces,
// and the approved unit cost. Phase 1: a faithful extraction of the shipment-day profit engine's
// item logic (profit-shipping-cohorts.js, which stays unchanged and active), plus store-scoped
// approved aliases. Nothing here writes to the database; no section uses it yet except the
// read-only comparison endpoint (/api/product-engine). Activation needs the owner's approval.
import {classifyInventoryItems,loadInventoryModels,FUR_ALIASES} from './_inventory.js';
import {loadCostedModels,approvedCost,canonicalModelName,normalizeArabic,STATI_ALIASES,FILLER_ALIASES,round2} from './_partial-delivery.js';

export const ENGINE_VERSION='product-engine-1-shadow';
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
 const matches=await classifyInventoryItems(env,raw,models);
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

// storeId: aliases approved for that store are added to their product (Corvex only for now).
// extraAliases: [{product_ref, alias}] — used by the dry-run test of a proposed alias.
export async function loadCatalogue(env,{storeId=0,extraAliases=[]}={}){
 const {models,catalogueError}=await cohortModels(env);
 let approved=[];
 if(storeId){try{await ensureProductAliasTable(env);approved=(await env.DB.prepare("SELECT product_ref,alias FROM product_aliases WHERE store_id=? AND status='approved'").bind(storeId).all()).results||[]}catch{}}
 const add=[...approved,...extraAliases];
 const out=models.map(m=>{
  const ref=productRef(m),extra=add.filter(a=>a.product_ref===ref).map(a=>key(a.alias)).filter(a=>a.length>1);
  return extra.length?{...m,aliases:[...new Set([...(m.aliases||[]),...extra])].sort((a,b)=>b.length-a.length)}:m;
 });
 return {models:out,catalogueError,storeId,version:ENGINE_VERSION};
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
   const parsed=await classifyInventoryItems(env,text,models);
   trace.push({source,found:parsed.map(x=>({name:(models.find(m=>m.id===Number(x.model_id))||{}).name||String(x.model_id),quantity:x.quantity}))});
   if(!parsed.length)continue;
   let list=parsed;
   // Quantity written only in the other field («عدد2» in notes, product in raw_text):
   // use it for a single-model order whose own text carries no quantity at all.
   // The sources are never added together, so the same piece is not counted twice.
   const other=sources.find(([name])=>name!==source)[1];
   if(parsed.length===1&&parsed[0].quantity===1&&!hasQuantityMarker(text)&&other.trim()&&!(await classifyInventoryItems(env,other,models)).length){
    const q=explicitQuantity(other);if(q>1){list=[{...parsed[0],quantity:q}];trace.push({source:'quantity_from_'+sources.find(([name])=>name!==source)[0],quantity:q})}
   }
   items=mergeItems(list,models);itemSource=source;break;
  }
  // «جكيت جوخ» / «جاكيت جوخ» with no model word is jokh scarfo only for a single piece.
  if(!items.length){
   const scarfo=models.find(m=>key(canonicalModelName(m.name))===key('جاكيت جوخ سكايفو'));
   for(const [source,text] of sources){
    if(!scarfo||!text.trim()||!BARE_JOKH.test(key(text)))continue;
    const probe=await classifyInventoryItems(env,text,[{id:scarfo.id,name:scarfo.name,aliases:['جاكيت جوخ','جكيت جوخ','جاكت جوخ']}]);
    const other=sources.find(([name])=>name!==source)[1];
    const otherQ=explicitQuantity(other);
    const q=probe.reduce((n,x)=>n+x.quantity,0);
    trace.push({source:source+'_bare_jokh',quantity:q,other_quantity:otherQ});
    if(probe.length===1&&q===1&&otherQ<=1){items=mergeItems([{model_id:scarfo.id,name:scarfo.name,quantity:1}],models);itemSource=source+'_bare_jokh_single'}
    break;
   }
  }
  if(!items.length&&allocation?.length){items=mergeItems(allocation,models);itemSource='inventory'}
 const itemsValid=items.length>0&&items.every(i=>Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=50);
 const byId=new Map(models.map(m=>[m.id,m]));
 return {items:items.map(i=>({...i,ref:productRef(byId.get(Number(i.model_id))||{name:i.name})})),source:itemSource,trace,valid:itemsValid,
  cost:itemsValid&&items.every(i=>i.unit_cost!==null)?round2(items.reduce((n,i)=>n+i.total_cost,0)):null};
}
