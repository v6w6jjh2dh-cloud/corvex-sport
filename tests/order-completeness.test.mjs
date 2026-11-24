// Order completeness (owner request 2026-11-24): old orders often carry only colour + count («2 أسود / 1 بيج»).
// Such an order is «product name missing» (data completeness), never guessed and never an engine error.
// Form labels / LiteSale references are metadata, not products (follow-up of PR #17).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {analyzeOrder} from '../functions/api/_order-language.js';
import {loadCatalogue,resolveOrderItems,classifyCompleteness} from '../functions/api/_product-engine.js';
import {resetInventorySchemaCache} from '../functions/api/_inventory.js';

async function setup(){
 resetInventorySchemaCache();const {db,env}=createD1();
 db.prepare("INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('fur_jacket','جاكيت فرو',4,'[\"جاكيت فرو\"]','{}',0,1)").run();
 return {env,cat:await loadCatalogue(env,{storeId:0})};
}
async function classify(env,cat,o,others={},sourceProduct=null){
 const central=await resolveOrderItems(env,o,cat),analysis=analyzeOrder(o,cat.models,cat.lexicon);
 const sourceKnown=!!(sourceProduct&&(await resolveOrderItems(env,{order_notes:sourceProduct},cat)).items.length);
 return classifyCompleteness({central,analysis,others,sourceProduct,sourceKnown}).cls;
}

test('colour + count without a product name → «missing» (orange), never guessed',async()=>{
 const {env,cat}=await setup();
 for(const t of ['2 أسود\n1 بيج','2 أسود','1 بيج','عدد 2 اسود','2أسود 1أبيض','اسود وبني\nمقاس xl','القطعة الأولى: أسود - L\nالقطعة الثانية: بيج - XL'])
  assert.equal(await classify(env,cat,{order_notes:t,amount:17}),'missing',t);
 const r=await resolveOrderItems(env,{order_notes:'2 أسود\n1 بيج'},cat);assert.deepEqual(r.items,[]);assert.equal(r.cost,null,'no product, no cost');
});

test('form labels and LiteSale references are metadata, not products (real LiteSale note format)',()=>{
 const note='بيسك | اللون: أسود | المقاس: L | الكمية: 2\nالقطعة 1: اللون أسود | الوزن 70 كغ\nالقطعة 2: اللون بيج | المقاس XL\nحالة التواصل: لم يرد\nLiteSale: ORD-5F2K9';
 const a=analyzeOrder({order_notes:note},[]);assert.deepEqual(a.candidates.map(c=>c.phrase),['بيسك']);assert.deepEqual(a.unclear,[]);
 for(const t of ['القطعة الأولى','القطعة الأولى:','رقم ORD: 88213','رقم ORD','LiteSale ORD-ABC123','LiteSale: ORD-ABC123','litesale ord e','ORD-77ab2','#10415','حالة التواصل: لم يرد','المصدر: LiteSale']){
  const r=analyzeOrder({order_notes:t+'\n2 أسود'},[]);assert.deepEqual(r.candidates,[],t);assert.deepEqual(r.unclear,[],t);
 }
 assert.deepEqual(analyzeOrder({order_notes:'#10415 بيسك عدد 2'},[]).candidates.map(c=>c.phrase),['بيسك'],'a reference does not hide a product on the same line');
 assert.deepEqual(analyzeOrder({order_notes:'المنتج: شنطه جلد\nالكمية: 2'},[]).candidates.map(c=>c.phrase),['شنطه جلد'],'a field label is dropped, its value is read');
});

test('classes: known / learn / failure / unclear — and source data is checked before judging',async()=>{
 const {env,cat}=await setup();
 assert.equal(await classify(env,cat,{order_notes:'جاكيت فرو عدد 2'}),'known');
 assert.equal(await classify(env,cat,{order_notes:'شنطه جلد عدد 2'}),'learn');
 assert.equal(await classify(env,cat,{order_notes:'جاكيت فرو\nشنطه جلد عدد 2'}),'learn','known + new name');
 assert.equal(await classify(env,cat,{order_notes:'2 أسود'},{allocation:{'جاكيت فرو':2}}),'failure','stock deduction names a product the engine cannot read');
 assert.equal(await classify(env,cat,{order_notes:'2 أسود'},{},'جاكيت فرو'),'failure','source names a known product');
 assert.equal(await classify(env,cat,{order_notes:'2 أسود'},{},'شنطه جلد'),'learn','source names an unknown product');
 assert.equal(await classify(env,cat,{order_notes:'تأكد منهم نظاف'}),'unclear');
 assert.equal(await classify(env,cat,{order_notes:''}),'unclear');
});
