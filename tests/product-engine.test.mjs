// Central product engine (shadow): equivalence with the active shipment-day engine, approved
// results on the incident corpus, and a 4-engine comparison whose differences are documented
// (docs/PRODUCT_ENGINE.md). A new, unexplained difference fails the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {createD1} from './_d1.mjs';
import {loadCatalogue,resolveOrderItems,describeCatalogue,productRef} from '../functions/api/_product-engine.js';
import {classifyInventoryItems,loadInventoryModels,resetInventorySchemaCache} from '../functions/api/_inventory.js';
import {onRequest as cohorts} from '../functions/api/profit-shipping-cohorts.js';
import {onRequest as engineApi} from '../functions/api/product-engine.js';
import {normalizeArabic} from '../functions/api/_partial-delivery.js';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/product-corpus.json',import.meta.url),'utf8')).cases;
const key=x=>normalizeArabic(x);
const shape=list=>Object.fromEntries(list.map(([n,q])=>[key(n),q]).sort());

function setup(){
 resetInventorySchemaCache();
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivered_amount','REAL DEFAULT 0'],['cash_collected','REAL DEFAULT 0'],['delivery_fee','REAL DEFAULT 2'],['cost_of_goods','REAL DEFAULT 0'],['delivery_company_settled','INTEGER DEFAULT 0'],['delivery_company_settlement_id','INTEGER'],['delivered_pieces','INTEGER DEFAULT 0'],['settlement_note',"TEXT DEFAULT ''"],['returned_pieces','INTEGER DEFAULT 0']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'متجر آخر'),(2,'Corvex-sport');
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1),(2,'e','E','x','staff',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day')),('e',2,datetime('now','+1 day'));
  CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_code TEXT,store_id INTEGER,source_name TEXT,created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER,order_id INTEGER,phone TEXT,imported_status TEXT,applied_status TEXT,imported_amount REAL,note TEXT,match_type TEXT);
  INSERT INTO delivery_company_settlements(id,settlement_code,store_id,source_name) VALUES(1,'DC-T',2,'t');`);
 // catalogue as on production (the catalogue migrations run once per process, so rows are explicit here)
 for(const [k,n,c,a] of [['fur_jacket','جاكيت فرو',4,['جاكيت فرو']],['gap_filler','مالئ الفراغات',1,['مالئ الفراغات','سي ايبوكسي','ايبوكسي']],['jokh_casual','جاكيت جوخ كاجوال',5.2,['جاكيت جوخ كاجوال','جكيت جوخ كاجوال']],['jokh_scarfo','جاكيت جوخ سكايفو',7.55,['جاكيت جوخ سكايفو']],['sahab_pants','بنطلون جيوب سحاب',2.3,['بنطلون جيوب سحاب','جيوب سحاب']]])
  db.prepare("INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(?,?,?,?,'{}',0,1)").run(k,n,c,JSON.stringify(a));
 return {db,env};
}
const day='2026-11-21';
function seedCorpus(db){
 const ids=new Map();let code=20000;
 for(const c of corpus){
  const id=Number(db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,order_notes,raw_text,created_by,created_at,printed,first_printed_at,store_id,delivery_status,delivered_amount,cash_collected,delivery_company_settled,delivery_company_settlement_id) VALUES(?,?,?,?,?,?,1,?,1,?,2,'delivered',10,8,1,1)`)
   .run(++code,'ع','0790000000',10,c.notes,c.raw,day+' 06:00:00',day+' 06:00:00').lastInsertRowid);
  ids.set(c.id,id);
 }
 return ids;
}
const call=(env,fn,url,body,tok='t')=>fn({request:new Request('https://x/api'+url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tok,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));

test('central engine = active shipment-day engine, order by order (same products, quantities, costs)',async()=>{
 const {db,env}=setup();const ids=seedCorpus(db);
 const cat=await loadCatalogue(env,{storeId:2});
 const report=(await call(env,cohorts,'/profit-shipping-cohorts?date='+day+'&store_id=0')).body;
 for(const c of corpus){
  const o=db.prepare('SELECT * FROM orders WHERE id=?').get(ids.get(c.id));
  const central=await resolveOrderItems(env,o,cat);
  const active=report.orders.find(x=>x.id===o.id);
  assert.deepEqual(central.items.map(i=>[i.name,i.quantity,i.unit_cost]),active.items.map(i=>[i.name,i.quantity,i.unit_cost]),c.id);
  assert.equal(central.source,active.item_source,c.id);
 }
});

test('central engine gives the approved result on every corpus case with an expectation',async()=>{
 const {db,env}=setup();const ids=seedCorpus(db);
 const cat=await loadCatalogue(env,{storeId:2});
 for(const c of corpus.filter(x=>x.expected)){
  const o=db.prepare('SELECT * FROM orders WHERE id=?').get(ids.get(c.id));
  const got=Object.fromEntries((await resolveOrderItems(env,o,cat)).items.map(i=>[key(i.name),i.quantity]).sort());
  assert.deepEqual(got,shape(Object.entries(c.expected)),`${c.id} (${c.rule})`);
 }
});

// ---- the other engines, loaded as they run today
function browserEngines(){
 const app=readFileSync(new URL('../public/app-v62.js',import.meta.url),'utf8');
 const helpers=app.slice(app.indexOf('function normalizeDigits('),app.indexOf('const COMMON_NAMES'));
 const ctx={console,setTimeout,state:{},api:undefined};
 ctx.window=ctx;ctx.globalThis=ctx;
 ctx.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,documentElement:{},addEventListener(){},createElement:()=>({style:{}}),head:{appendChild(){}}};
 ctx.MutationObserver=class{observe(){}};
 vm.createContext(ctx);
 vm.runInContext(helpers+';globalThis.normalizeDigits=normalizeDigits;globalThis.normalizeArabic=normalizeArabic;',ctx);
 vm.runInContext(readFileSync(new URL('../public/product-rules.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(readFileSync(new URL('../public/app-v73-model-performance.js',import.meta.url),'utf8'),ctx);
 return {
  productRules:t=>(ctx.CORVEX_PRODUCT_RULES.calculateCost(t).items||[]).map(i=>[i.name,i.qty]),
  modelPerformance:(notes,raw)=>(ctx.corvexParseModels({order_notes:notes,raw_text:raw})||[]).map(i=>[i.name,i.qty])
 };
}
const sum=list=>{const m={};for(const [n,q] of list)m[key(n)]=(m[key(n)]||0)+Number(q||0);return Object.fromEntries(Object.entries(m).sort())};

test('4-engine comparison on the corpus: every difference from the central engine is documented',async()=>{
 const {db,env}=setup();const ids=seedCorpus(db);
 const cat=await loadCatalogue(env,{storeId:2}),inv=await loadInventoryModels(env),B=browserEngines();
 const diffs={};
 for(const c of corpus){
  const o=db.prepare('SELECT * FROM orders WHERE id=?').get(ids.get(c.id));
  const central=sum((await resolveOrderItems(env,o,cat)).items.map(i=>[i.name,i.quantity]));
  const print=sum((await classifyInventoryItems(env,o.raw_text||o.order_notes||'',inv)).map(x=>[(inv.find(m=>m.id===x.model_id)||{}).name,x.quantity]));
  const rules=sum(B.productRules(o.order_notes||o.raw_text||''));
  const perf=sum(B.modelPerformance(o.order_notes,o.raw_text));
  for(const [engine,got] of [['print_inventory',print],['product_rules_js',rules],['model_performance_js',perf]]){
   if(JSON.stringify(got)!==JSON.stringify(central))(diffs[c.id]??={central})[engine]=got;
  }
 }
 const file=new URL('./fixtures/product-engine-diffs.json',import.meta.url);
 if(process.env.UPDATE_ENGINE_DIFFS==='1')writeFileSync(file,JSON.stringify(diffs,null,1)+'\n');
 const documented=JSON.parse(readFileSync(file,'utf8'));
 assert.deepEqual(diffs,documented,'a difference between engines changed — review docs/PRODUCT_ENGINE.md before updating the snapshot');
});

test('catalogue: stable refs, names, aliases, approved cost and its source',async()=>{
 const {env}=setup();
 const list=describeCatalogue(await loadCatalogue(env,{storeId:2}));
 const fur=list.find(p=>p.name==='جاكيت فرو');
 assert.equal(fur.ref,'fur_jacket');assert.equal(fur.unit_cost,4);assert.equal(fur.cost_source,'approved');assert.ok(fur.aliases.includes('فرو'));
 const prada=list.find(p=>p.name==='تيشيرت برادا');
 assert.equal(prada.in_database,false);assert.equal(prada.ref.startsWith('name:'),true);
 assert.equal(new Set(list.map(p=>p.ref)).size,list.length,'refs are unique');
});

test('alias API: admin only, propose → test (dry run, no order change) → approve; Corvex only; active engines untouched',async()=>{
 const {db,env}=setup();
 const id=Number(db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,order_notes,raw_text,created_by,created_at,first_printed_at,store_id) VALUES(30001,'ع','0790000000',10,'جاكيت بومبر بني','',1,datetime('now'),datetime('now'),2)`).run().lastInsertRowid);
 assert.equal((await call(env,engineApi,'/product-engine',{action:'propose',product_ref:'fur_jacket',alias:'جاكيت بومبر'},'e')).status,403);
 const before=JSON.stringify(db.prepare('SELECT * FROM orders').all())+JSON.stringify(db.prepare('SELECT * FROM profit_models').all());
 const p=await call(env,engineApi,'/product-engine',{action:'propose',product_ref:'fur_jacket',alias:'جاكيت بومبر'});
 assert.equal(p.status,200,JSON.stringify(p.body));
 assert.equal((await call(env,engineApi,'/product-engine',{action:'propose',product_ref:'fur_jacket',alias:'فرو'})).status,409,'already an alias');
 assert.equal((await call(env,engineApi,'/product-engine',{action:'approve',id:p.body.id,confirm:'اعتماد الاسم'})).status,409,'must be tested first');
 const t=await call(env,engineApi,'/product-engine',{action:'test',id:p.body.id});
 assert.equal(t.body.changed,1);assert.equal(t.body.examples[0].id,id);
 assert.equal((await call(env,engineApi,'/product-engine',{action:'approve',id:p.body.id,confirm:'نعم'})).status,400);
 assert.equal((await call(env,engineApi,'/product-engine',{action:'approve',id:p.body.id,confirm:'اعتماد الاسم'})).body.status,'approved');
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM orders').all())+JSON.stringify(db.prepare('SELECT * FROM profit_models').all()),before,'orders and the shared catalogue are not written');
 const corvex=await loadCatalogue(env,{storeId:2}),other=await loadCatalogue(env,{storeId:1});
 assert.ok(corvex.models.find(m=>productRef(m)==='fur_jacket').aliases.includes('جاكيت بومبر'));
 assert.ok(!other.models.find(m=>productRef(m)==='fur_jacket').aliases.includes('فروه'),'other stores unaffected');
 const inv=await loadInventoryModels(env);
 assert.deepEqual(await classifyInventoryItems(env,'جاكيت بومبر بني',inv),[],'active print-time engine unchanged until activation');
});

test('compare endpoint is read-only and reports differences per order',async()=>{
 const {db,env}=setup();seedCorpus(db);
 const dump=()=>JSON.stringify(db.prepare('SELECT * FROM orders').all())+JSON.stringify(db.prepare('SELECT * FROM inventory_movements').all());
 const before=dump();
 const r=await call(env,engineApi,`/product-engine?view=compare&from=${day}&to=${day}`);
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.read_only,true);assert.equal(r.body.counts.orders,corpus.length);
 assert.equal(r.body.counts.central_vs_profit_engine,0,'central = active profit engine on every order');
 assert.equal(dump(),before);
});
