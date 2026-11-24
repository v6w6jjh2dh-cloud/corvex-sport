// Generic order-language parser: with DEFAULT_LEXICON it must read every text exactly like the active
// matcher (_inventory.js classifyInventoryItems); with a different lexicon it must adapt WITHOUT code
// changes (new products, new colours/units, another business vocabulary).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './_d1.mjs';
import {parseOrderText,unknownPhrases,DEFAULT_LEXICON,inlineQuantity} from '../functions/api/_order-language.js';
import {classifyInventoryItems,resetInventorySchemaCache} from '../functions/api/_inventory.js';
import {loadCatalogue} from '../functions/api/_product-engine.js';
import {PRODUCT_KNOWLEDGE,QUANTITY_RULES} from '../functions/api/_product-knowledge.js';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/product-corpus.json',import.meta.url),'utf8')).cases;
const sorted=l=>[...l].sort((a,b)=>a.model_id-b.model_id);

// realistic variations built from real fragments: quantities, colours, prices, phones, returns, line breaks
function variations(names){
 const parts=['عدد 2','3 قطع','قطعتين','لونين','اسود وبني','2 اسود 1 بني','15 دينار','17 شامل التوصيل','0791234567','وزن 70','مقاس XL','استرجاع جاكيت فرو','طلب جديد و ارجاع','مع فرو','مبطن فرو','x2','+3','20','25','عدد: 4','اربع قطع','ثلاث الوان','\n','\nعدد 2\n','\nاسود\nبني'];
 const out=[];let seed=7;const rnd=n=>(seed=(seed*1103515245+12345)%2147483648)%n;
 for(let i=0;i<1500;i++){
  let t='';for(let k=0;k<1+rnd(4);k++)t+=(rnd(3)?names[rnd(names.length)]:parts[rnd(parts.length)])+(rnd(4)?' ':'\n')+(rnd(2)?parts[rnd(parts.length)]+' ':'');
  out.push(t);
 }
 return out;
}

test('DEFAULT_LEXICON = active matcher on corpus, knowledge examples, every alias and 1500 generated variations',async()=>{
 resetInventorySchemaCache();const {env}=createD1();
 const cat=await loadCatalogue(env,{storeId:0});const models=cat.models;
 const texts=[...corpus.flatMap(c=>[c.notes,c.raw]),...PRODUCT_KNOWLEDGE.flatMap(k=>k.examples.map(e=>e[0])),...QUANTITY_RULES.flatMap(q=>q.examples.map(e=>e[0])),
  ...models.flatMap(m=>m.aliases),...variations(models.flatMap(m=>m.aliases).filter((_,i)=>i%3===0))];
 let checked=0;
 for(const t of texts){
  const a=sorted(await classifyInventoryItems(env,t,models)),b=sorted(parseOrderText(t,models).items);
  assert.deepEqual(b,a,`«${t}»`);checked++;
 }
 assert.ok(checked>1700,String(checked));
});

test('adapts to a new product with no code change: catalogue is data',()=>{
 const models=[{id:1,name:'كريم مرطب',aliases:['كريم مرطب','مرطب']},{id:2,name:'سيروم فيتامين سي',aliases:['سيروم فيتامين سي','سيروم']}];
 assert.deepEqual(parseOrderText('مرطب عدد 3\nسيروم 2 حبات\n12 دينار شامل التوصيل',models).items,[{model_id:1,quantity:3},{model_id:2,quantity:2}]);
});

test('adapts to another business vocabulary (lexicon) with no code change',()=>{
 const lex={...DEFAULT_LEXICON,unitWords:[...DEFAULT_LEXICON.unitWords,'علبه','علب','كرتونه'],colours:[...DEFAULT_LEXICON.colours,'فانيلا','شوكولا']};
 const models=[{id:1,name:'كيك',aliases:['كيك']}];
 assert.deepEqual(parseOrderText('كيك 4 علب',models,lex).items,[{model_id:1,quantity:4}]);
 assert.deepEqual(parseOrderText('كيك فانيلا وشوكولا',models,lex).items,[{model_id:1,quantity:2}]);
 assert.deepEqual(parseOrderText('كيك فانيلا وشوكولا',models).items,[{model_id:1,quantity:1}],'default lexicon does not know these flavours');
 assert.deepEqual(parseOrderText('كيك\n4 علب',models).items,[{model_id:1,quantity:1}],'default lexicon does not know «علب» as a unit');
 assert.deepEqual(parseOrderText('كيك\n4 علب',models,lex).items,[{model_id:1,quantity:4}]);
});

test('evidence explains every quantity (for review and future learning)',()=>{
 const models=[{id:1,name:'X',aliases:['منتج']}];
 const r=parseOrderText('منتج 15 دينار\nمنتج عدد 2',models);
 assert.deepEqual(r.evidence.map(e=>[e.quantity,e.rule]),[[1,'default_one'],[2,'after_product']]);
});

test('unknown phrases: a product-like line with a quantity that matches nothing becomes a candidate (no product word list)',()=>{
 const models=[{id:1,name:'X',aliases:['جاكيت فرو']}];
 assert.deepEqual(unknownPhrases('جاكيت فرو\nشنطه جلد عدد 2\nعمان - طبربور\n0791234567\n17 شامل التوصيل',models),['شنطه جلد']);
 assert.deepEqual(unknownPhrases('هودي اوفر سايز 2 اسود',models),['هودي اوفر سايز']);
 assert.deepEqual(unknownPhrases('جاكيت فرو عدد 2',models),[]);
});

test('learned conventions (single-product orders) are data, not code',()=>{
 for(const q of QUANTITY_RULES)for(const [t,n] of q.examples)assert.equal(inlineQuantity(t,{productName:t})?.quantity,n,`${q.id} «${t}»`);
 assert.equal(inlineQuantity('كيك ثلاث علب',{lexicon:{...DEFAULT_LEXICON,unitWords:[...DEFAULT_LEXICON.unitWords,'علب']}})?.quantity,3);
 assert.equal(inlineQuantity('كيك 17 شامل التوصيل'),null);
});
