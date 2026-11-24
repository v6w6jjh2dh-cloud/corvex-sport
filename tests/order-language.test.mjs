// Generic order-language parser: with DEFAULT_LEXICON it must read every text exactly like the active
// matcher (_inventory.js classifyInventoryItems); with a different lexicon it must adapt WITHOUT code
// changes (new products, new colours/units, another business vocabulary).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './_d1.mjs';
import {parseOrderText,unknownPhrases,DEFAULT_LEXICON,inlineQuantity,analyzeOrder,groupPhrases,phraseKey} from '../functions/api/_order-language.js';
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
 assert.deepEqual(unknownPhrases('هودي اوفر سايز 2 اسود',models),['هودي اوفر'],'«سايز» is a size detail, not part of the name');
 assert.deepEqual(unknownPhrases('جاكيت فرو عدد 2',models),[]);
});

test('learned conventions (single-product orders) are data, not code',()=>{
 for(const q of QUANTITY_RULES)for(const [t,n] of q.examples)assert.equal(inlineQuantity(t,{productName:t})?.quantity,n,`${q.id} «${t}»`);
 assert.equal(inlineQuantity('كيك ثلاث علب',{lexicon:{...DEFAULT_LEXICON,unitWords:[...DEFAULT_LEXICON.unitWords,'علب']}})?.quantity,3);
 assert.equal(inlineQuantity('كيك 17 شامل التوصيل'),null);
});

// ---- Production review 2026-11-24 (owner): details were reported as product names. Generic fixes, no product names in code.
const CAT=[{id:1,name:'جاكيت فرو',aliases:['جاكيت فرو']},{id:2,name:'تيشيرت بيسك',aliases:['تيشيرت بيسك']}];
const A=(t,extra={})=>analyzeOrder({order_notes:t,...extra},CAT);

test('details are never product candidates: quantity, colours, units, sizes, measures, price, dates/times',()=>{
 for(const t of ['الكمية: 3','الكمية:','3 ألوان','ثلاث الوان','2أسود','1أبيض','2أسود 1أبيض','عدد2','3قطع','25قطعة','إكس لارج','XL','عبوات','80/90','delivery included',
   'نوفمبر في 6:49','17 شامل التوصيل','وزن 70 كيلو','طول 160 سم','مقاس 42','قطعتين','2 حبات','12/11/2026']){
  const r=A(t);assert.deepEqual(r.candidates,[],`candidate from «${t}»`);assert.deepEqual(r.unclear,[],`unclear from «${t}»`);
 }
});

test('numbers glued to words are split (2أسود, عدد2, 3قطع) and the product phrase is separated from them',()=>{
 for(const t of ['بيسك عدد2','عدد2 بيسك','بيسك عدد3','بيسك عدد4','بيسك 3قطع','2أسود بيسك','بيسك\n2أسود 1أبيض','بيسك\nمقاس xl\n2 اسود'])
  assert.deepEqual(A(t).candidates.map(c=>c.phrase),['بيسك'],`«${t}»`);
});

test('similar phrases are grouped under one probable product with their variants and distinct orders',()=>{
 const list=[];let id=0;
 for(const t of ['بيسك 1 قطعه','بيسك عدد2','عدد2 بيسك','بيسك عدد3','البيسك 2 قطع','بييسك عدد 2','شنطه جلد عدد 2','شنطة جلد 3 قطع']){
  id++;for(const c of A(t).candidates)list.push({...c,order_id:id,order_code:String(id)});
 }
 // the same order twice is counted once
 for(const c of A('بيسك عدد5').candidates)list.push({...c,order_id:1,order_code:'1'});
 const g=groupPhrases(list);
 assert.equal(g.length,2,JSON.stringify(g.map(x=>x.variants)));
 assert.equal(g[0].orders,6);assert.equal(g[1].orders,2);
 assert.equal(phraseKey('البيسك'),phraseKey('بيسك'));
});

test('catalogue and knowledge are checked first: a near spelling is a possible alias, not a new product',()=>{
 const r=A('بيسيك عدد 2');assert.equal(r.candidates[0].near.name,'تيشيرت بيسك');
 assert.deepEqual(unknownPhrases('بيسيك عدد 2',CAT),[],'not listed as a NEW product');
 assert.equal(A('شنطه جلد عدد 2').candidates[0].near,null);
 assert.deepEqual(A('جاكيت فرو اسود\nمقاس xl\nعدد 2').candidates,[],'details attach to the known product');
});

test('unknown products are separated from unclear details; unclear text is kept for review, not ignored or guessed',()=>{
 const r=A('تأكد منهم نظاف');assert.deepEqual(r.candidates,[]);assert.equal(r.unclear.length,1);assert.equal(r.unclear[0].line,'تأكد منهم نظاف');
 const both=A('شنطه جلد عدد 2\nتأكد منهم نظاف');assert.deepEqual(both.candidates.map(c=>c.phrase),['شنطه جلد']);assert.equal(both.unclear.length,1);
});

test('whole-order context: this order\'s name, area, address and phone are personal, never products or unclear',()=>{
 const o={order_notes:'',raw_text:'محمد العلي\nعمان طبربور شارع الجامعه\n0791234567\nبيسك عدد 2',recipient_name:'محمد العلي',area:'طبربور',detailed_address:'شارع الجامعه'};
 const r=analyzeOrder(o,CAT);assert.deepEqual(r.candidates.map(c=>c.phrase),['بيسك']);assert.deepEqual(r.unclear,[]);
 assert.deepEqual(analyzeOrder({order_notes:'ام تركي\nبيسك 2 قطع'},CAT).candidates.map(c=>c.phrase),['بيسك']);
});

 test('form headings and external order references are not product candidates',()=>{
 for(const label of ['القطعة الأولى','اختر العرض المطلوب','litesale ord e','رقم ord d e','LiteSale ORD-123ABC']){
 const r=A(label+'\n2 أسود');assert.deepEqual(r.candidates,[],label);assert.deepEqual(r.unclear,[],label);
 }
 assert.deepEqual(A('القطعة الأولى\nشنطة جلد\n2 أسود').candidates.map(c=>c.phrase),['شنطه جلد']);
 });
