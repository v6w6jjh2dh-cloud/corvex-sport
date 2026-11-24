// Regression guards for problems fixed earlier (REGRESSION_TESTS.md). Each case documents the
// approved behaviour; do not change an expected value to make a test pass — fix the code or ask.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './_d1.mjs';
import {classifyInventoryItems,loadInventoryModels,deductOnFirstPrint,resetInventorySchemaCache} from '../functions/api/_inventory.js';

const rows=[
 {id:1,model_key:'fur_jacket',name:'جاكيت فرو',aliases_json:'["جاكيت فرو"]'},
 {id:2,model_key:'jokh_casual',name:'جاكيت جوخ كاجوال',aliases_json:'["جكيت جوخ كاجوال"]'},
 {id:3,model_key:'jokh_scarfo',name:'جاكيت جوخ سكايفو',aliases_json:'["جاكيت جوخ سكايفو","جاكيت نسائي","جاكيت جوخ ستاتي"]'},
 {id:4,model_key:'gap_filler',name:'مالئ الفراغات',aliases_json:'["ايبوكسي","سي ايبوكسي","مالئ الفراغات"]'}];
const env={DB:{prepare:()=>({all:async()=>({results:rows})})}};
const classify=async t=>(await classifyInventoryItems(env,t,await loadInventoryModels(env))).map(i=>[i.model_id,i.quantity]);

// R-QTY-1: one piece must never be counted as two (prices, phones, weights, colours, explicit counts)
test('R-QTY-1 one piece stays one piece',async()=>{
 for(const [text,expected] of [
  ['جاكيت فرو 1',[[1,1]]],['جاكيت فرو عدد 1',[[1,1]]],['عدد 1\nجاكيت فرو',[[1,1]]],
  ['جاكيت جوخ كاجوال 20 دينار شامل التوصيل',[[2,1]]],['جاكيت جوخ كاجوال\n15 دينار',[[2,1]]],
  ['جاكيت فرو لون اسود',[[1,1]]],['جاكيت فرو\nاسود',[[1,1]]],
  ['جاكيت فرو 1\nرقم الهاتف 0791234567',[[1,1]]],['جاكيت فرو\nالوزن 70 الطول 175',[[1,1]]],
  ['سي ايبوكسي 3',[[4,3]]],['عدد 2 فرو',[[1,2]]]
 ])assert.deepEqual(await classify(text),expected,text);
});

// R-ALIAS-1: approved short names (fur, stati = scarfo, «نسائي» = scarfo, epoxy spellings)
test('R-ALIAS-1 approved short and alternative names are recognised',async()=>{
 for(const [text,id] of [['فرو',1],['جكيت الفرو',1],['جاكيت جوخ ستاتي',3],['جاكيت نسائي',3],['ايوبكسي 2',4],['مالئ الفراغات',4]]){
  const got=await classify(text);assert.equal(got[0]?.[0],id,text);
 }
 assert.deepEqual(await classify('فروع عمان'),[],'«فروع» is not fur');
});

// R-INV-1 / R-INV-2: first print deducts once (reprint never again), from zero into negative
test('R-INV-1/2 first print deducts once, even from zero stock; reprint does not deduct',async()=>{
 resetInventorySchemaCache();
 const {db,env:e}=createD1();
 db.exec(`INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'a','A','x','admin',1);
  INSERT INTO profit_models(id,model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(1,'fur_jacket','جاكيت فرو',4,'["جاكيت فرو"]','{}',0,1);
  INSERT INTO orders(id,order_code,recipient_name,phone,amount,raw_text,created_by) VALUES(1,9001,'ع','0790000000',10,'جاكيت فرو عدد 2',1);`);
 const order=()=>db.prepare('SELECT * FROM orders WHERE id=1').get();
 const first=await deductOnFirstPrint(e,order(),1);assert.equal(first.changed,true);
 db.prepare("UPDATE orders SET first_printed_at=datetime('now') WHERE id=1").run();
 const again=await deductOnFirstPrint(e,order(),1);assert.equal(again.changed,false);
 assert.equal(db.prepare('SELECT quantity FROM inventory_balances WHERE model_id=1').get().quantity,-2);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory_movements WHERE order_id=1').get().n,1);
});

// R-CACHE-1: every script loaded by index.html carries a version (the CI script also checks that
// a changed script gets a new version)
test('R-CACHE-1 index.html scripts are versioned and exist once',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const srcs=[...html.matchAll(/<script[^>]*src="\/([^"?]+)\?v=([^"]+)"/g)].map(m=>m[1]);
 const all=[...html.matchAll(/<script[^>]*src="\/([^"?]+)/g)].map(m=>m[1]);
 assert.equal(srcs.length,all.length,'a script without ?v=');
 assert.equal(new Set(all).size,all.length,'a script loaded twice');
 for(const s of ['delivery-pdf-rows.js','app-v62.js','app-v115-reconcile-links.js','app-v116-daily-commitment.js'])assert.ok(all.includes(s),s);
});

// R-STORE-1: Corvex-only features never write rows for other stores (commitment); the returns
// risk warning counts the same store only (tests/return-risk.test.mjs)
test('R-STORE-1 the daily commitment is stored for the Corvex store only',async()=>{
 const {onRequestGet,onRequestPost}=await import('../functions/api/daily-commitment.js');
 const {db,env:e}=createD1();
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'متجر آخر'),(2,'كورفكس');
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'a','A','x','admin',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));`);
 const req=(m,b,q='')=>new Request('https://x/api/daily-commitment'+q,{method:m,headers:{authorization:'Bearer t','content-type':'application/json'},body:b?JSON.stringify(b):undefined});
 const d=await (await onRequestGet({request:req('GET',null,'?store_id=1'),env:e})).json();
 assert.equal(d.applies,false);assert.equal(d.daily,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_commitment_items WHERE store_id<>2').get().n,0);
 const today=new Date(Date.now()+3*3600e3).toISOString().slice(0,10);
 await onRequestPost({request:req('POST',{action:'add',name:'بند',monthly_amount:30,effective_from:today}),env:e});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_commitment_items WHERE store_id<>2').get().n,0);
});
