// Knowledge preservation: every name, spelling, abbreviation, quantity convention and guard that the
// older engines learned is kept by the central engine (functions/api/_product-knowledge.js).
// A rule that disappears, or an alias that moves to another product, fails these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createD1} from './_d1.mjs';
import {loadCatalogue,resolveOrderItems} from '../functions/api/_product-engine.js';
import {resetInventorySchemaCache,FUR_ALIASES} from '../functions/api/_inventory.js';
import {normalizeArabic,STATI_ALIASES,FILLER_ALIASES,canonicalModelName} from '../functions/api/_partial-delivery.js';
import {PRODUCT_KNOWLEDGE,QUANTITY_RULES,GUARD_RULES,NAME_SYNONYMS} from '../functions/api/_product-knowledge.js';

const key=x=>normalizeArabic(x);
const canon=n=>{const c=canonicalModelName(n);const s=Object.entries(NAME_SYNONYMS).find(([a])=>key(a)===key(c));return key(s?s[1]:c)};

function setup(){
 resetInventorySchemaCache();
 const {db,env}=createD1();
 for(const [k,n,c,a] of [['fur_jacket','جاكيت فرو',4,['جاكيت فرو']],['gap_filler','مالئ الفراغات',1,['مالئ الفراغات','سي ايبوكسي','ايبوكسي']],['jokh_casual','جاكيت جوخ كاجوال',5.2,['جاكيت جوخ كاجوال','جكيت جوخ كاجوال']],['jokh_scarfo','جاكيت جوخ سكايفو',7.55,['جاكيت جوخ سكايفو','جاكيت نسائي',...STATI_ALIASES]],['sahab_pants','بنطلون جيوب سحاب',2.3,['بنطلون جيوب سحاب']]])
  db.prepare("INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(?,?,?,?,'{}',0,1)").run(k,n,c,JSON.stringify(a));
 return env;
}
async function read(env,cat,text,notes=''){
 const r=await resolveOrderItems(env,{order_notes:notes,raw_text:text},cat);
 const out={};for(const i of r.items)out[canon(i.name)]=(out[canon(i.name)]||0)+i.quantity;return {items:out,trace:r.trace,needs_review:r.needs_review};
}
// T-11 (owner decision 2026-11-24): a single general word alone is not enough evidence. Such a name is kept
// (never lost) but needs product evidence on its line: alone it is flagged for review, never guessed.
const single=t=>!/\s/.test(key(t).trim());

// The older browser engines exactly as they run today (built-in rules, no remote catalogue).
function oldEngines(){
 const app=readFileSync(new URL('../public/app-v62.js',import.meta.url),'utf8');
 const helpers=app.slice(app.indexOf('function normalizeDigits('),app.indexOf('const COMMON_NAMES'));
 const ctx={console,setTimeout,state:{},api:undefined};ctx.window=ctx;ctx.globalThis=ctx;
 ctx.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,documentElement:{},addEventListener(){},createElement:()=>({style:{}}),head:{appendChild(){}}};
 ctx.MutationObserver=class{observe(){}};
 vm.createContext(ctx);
 vm.runInContext(helpers+';globalThis.normalizeDigits=normalizeDigits;globalThis.normalizeArabic=normalizeArabic;',ctx);
 vm.runInContext(readFileSync(new URL('../public/product-rules.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(readFileSync(new URL('../public/app-v109-cotton-sport-alias.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(readFileSync(new URL('../public/app-v73-model-performance.js',import.meta.url),'utf8'),ctx);
 const v62=app.slice(app.indexOf('const PRODUCT_COST_RULES'),app.indexOf('function safeSmallQuantity'));
 const v62Terms=[...v62.matchAll(/terms:\[([^\]]*)\]/g)].flatMap(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
 const v62Names=[...v62.matchAll(/name:'([^']+)'/g)].map(m=>m[1]);
 const v62Rules=v62Names.map((n,i)=>({name:n,terms:[...v62.matchAll(/terms:\[([^\]]*)\]/g)][i][1].match(/'([^']+)'/g).map(x=>x.slice(1,-1))}));
 return {
  knows:t=>(ctx.CORVEX_PRODUCT_RULES.calculateCost(t).items||[]).length>0||(ctx.corvexParseModels({order_notes:t,raw_text:''})||[]).length>0
   ||v62Terms.some(x=>key(t).includes(key(x)))||/ليكرا/.test(t),
  v62Rules
 };
}

test('every knowledge example is read by the central engine as the documented product and quantity',async()=>{
 const env=setup();const cat=await loadCatalogue(env,{storeId:2});
 for(const k of PRODUCT_KNOWLEDGE)for(const [text,qty] of k.examples){
  const r=await read(env,cat,text);
  if(single(text)){assert.deepEqual(r.items,{},`${k.id}: «${text}» alone`);assert.equal(r.needs_review,true,`${k.id}: «${text}» review`);
   assert.deepEqual((await read(env,cat,text+' عدد 2')).items,{[key(k.product)]:2},`${k.id}: «${text} عدد 2»`);continue}
  if(k.status==='superseded'){assert.ok(!r.items[key(k.product)],`${k.id} defers (T-10): «${text}»`);
   const rq=await read(env,cat,text+' عدد 2');assert.deepEqual(rq.items,{[key(k.defers_to)]:2},`${k.id} → ${k.defers_to}`);continue}
  assert.deepEqual(r.items,{[key(k.product)]:qty},`${k.id}: «${text}»`);
 }
});

test('every alias of every knowledge entry resolves to its product (none lost, none moved)',async()=>{
 const env=setup();const cat=await loadCatalogue(env,{storeId:2});
 for(const k of PRODUCT_KNOWLEDGE)for(const alias of [...k.aliases,...(k.review||[])]){
  const {items}=await read(env,cat,single(alias)?alias+' عدد 2':alias);
  if(k.status==='superseded'){assert.ok(!items[key(k.product)],`${k.id} defers: «${alias}»`);continue}
  assert.deepEqual(Object.keys(items),[key(k.product)],`${k.id}: «${alias}»`);
 }
});

test('fidelity: every knowledge alias and example comes from an older engine (nothing invented)',async()=>{
 const env=setup();const base=await loadCatalogue(env,{storeId:2,knowledge:false});const old=oldEngines();
 for(const k of PRODUCT_KNOWLEDGE)for(const t of [...k.aliases,...(k.review||[]),...k.examples.map(e=>e[0])]){
  const server=Object.keys((await read(env,base,t)).items).length>0;
  assert.ok(server||old.knows(t),`${k.id}: «${t}» is not known by any older engine`);
 }
});

test('no older rule is lost: every alias of the active profit catalogue keeps its product with knowledge on',async()=>{
 const env=setup();
 const base=await loadCatalogue(env,{storeId:2,knowledge:false}),full=await loadCatalogue(env,{storeId:2});
 for(const m of base.models)for(const alias of m.aliases){
  const t=single(alias)?alias+' عدد 2':alias;
  const a=await read(env,base,t),b=await read(env,full,t);
  assert.deepEqual(b.items,a.items,`«${t}» (${m.name})`);
  if(single(alias)){const r=await read(env,full,alias);assert.equal(r.needs_review,true,`«${alias}» alone → review`)}
 }
});

test('server alias lists (fur, stati, filler) and app-v62 cost terms are all recognised as the same product',async()=>{
 const env=setup();const cat=await loadCatalogue(env,{storeId:2});const old=oldEngines();
 for(const [list,product] of [[FUR_ALIASES,'جاكيت فرو'],[STATI_ALIASES,'جاكيت جوخ سكايفو'],[FILLER_ALIASES,'مالئ الفراغات']])
  for(const a of list)assert.deepEqual(Object.keys((await read(env,cat,single(a)?a+' عدد 2':a)).items),[key(product)],`«${a}»`);
 for(const r of old.v62Rules)for(const t of r.terms)
  assert.deepEqual(Object.keys((await read(env,cat,single(t)?t+' عدد 2':t)).items),[canon(r.name.split(' / ')[0])],`app-v62 «${t}» → ${r.name}`);
});

test('quantity conventions (Q-*) are kept, only for single-product orders',async()=>{
 const env=setup();const cat=await loadCatalogue(env,{storeId:2});
 for(const q of QUANTITY_RULES)for(const [text,qty] of q.examples){
  const r=await read(env,cat,text);
  assert.equal(Object.values(r.items)[0],qty,`${q.id}: «${text}»`);
  assert.equal(Object.keys(r.items).length,1,`${q.id}: «${text}»`);
 }
 // never applied to a multi-product order, never to a price or a phone
 assert.deepEqual((await read(env,cat,'جاكيت جوخ كاجوال لونين\nجاكيت فرو')).items,{[key('جاكيت جوخ كاجوال')]:1,[key('جاكيت فرو')]:1});
 assert.deepEqual((await read(env,cat,'15 دينار جاكيت جوخ كاجوال')).items,{[key('جاكيت جوخ كاجوال')]:1});
 assert.deepEqual((await read(env,cat,'جاكيت جوخ كاجوال 17 شامل التوصيل 0791234567')).items,{[key('جاكيت جوخ كاجوال')]:1});
});

test('guards: M only beside a product word, «سحاب» alone is a place, name/address fields are never read',async()=>{
 const env=setup();const cat=await loadCatalogue(env,{storeId:2});
 assert.deepEqual((await read(env,cat,'ام حمزة\nجاكيت فرو')).items,{[key('جاكيت فرو')]:1},'M guard');
 assert.deepEqual((await read(env,cat,'سحاب - المدينة الصناعية\nجاكيت فرو')).items,{[key('جاكيت فرو')]:1});
 const r=await resolveOrderItems(env,{recipient_name:'جاكيت فرو',detailed_address:'بنطلون تركي',order_notes:'',raw_text:''},cat);
 assert.equal(r.items.length,0,'address fields');
 for(const g of GUARD_RULES)assert.ok(g.id&&g.where&&g.test&&g.description,g.id);
});

test('T-11: a general word is understood in context — description vs customer name, address, notes, price, weight, size',async()=>{
 const env=setup();const cat=await loadCatalogue(env,{storeId:2});
 const T=key('بنطلون تركي');
 for(const [text,exp] of [
  ['تركي',null],['ام تركي',null],['الاسم: تركي العلي',null],['عمان - شارع تركي',null],['ابو تركي\n0791234567',null],
  ['تركي عدد 2',{[T]:2}],['تركي اسود وبني',{[T]:2}],['تركي مقاس xl',{[T]:1}],['تركي 12 دينار',{[T]:1}],['بنطلون تركي',{[T]:1}],
  ['الاسم: تركي العلي\nبنطلون تركي عدد 3',{[T]:3}],['ام تركي\nجاكيت فرو',{[key('جاكيت فرو')]:1}]
 ]){
  const r=await read(env,cat,text);
  if(exp===null){assert.deepEqual(r.items,{},`«${text}»`);assert.equal(r.needs_review,true,`«${text}» review`)}
  else assert.deepEqual(r.items,exp,`«${text}»`);
 }
});
