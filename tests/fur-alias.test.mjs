// «فرو / جاكيت فرو / جكيت فرو / جاكيت الفرو / جكيت الفرو» are one model «جاكيت فرو» (2026-11-24).
// The same recognition is used by inventory, cost/profit, returns (server: _inventory.js) and by
// model performance / client profit rules (public/app-v73, public/product-rules.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyInventoryItems,loadInventoryModels,FUR_ALIASES} from '../functions/api/_inventory.js';

const rows=[{id:1,model_key:'fur_jacket',name:'جاكيت فرو',aliases_json:'["جاكيت فرو"]'},{id:2,model_key:'jokh_casual',name:'جاكيت جوخ كاجوال',aliases_json:'["جكيت جوخ كاجوال"]'},{id:3,model_key:'gap_filler',name:'مالئ الفراغات',aliases_json:'["ايبوكسي","سي ايبوكسي"]'}];
const env={DB:{prepare:()=>({all:async()=>({results:rows})})}};
const classify=async t=>classifyInventoryItems(env,t,await loadInventoryModels(env));
const CASES=[
 ['عدد 2 فرو',[[1,2]]],            // order #10389
 ['فرو',[[1,1]]],['جاكيت فرو',[[1,1]]],['جكيت فرو 2',[[1,2]]],['جاكيت الفرو عدد 3',[[1,3]]],['جكيت الفرو',[[1,1]]],
 ['الفرو اسود وبني',[[1,2]]],
 ['جاكيت جوخ كاجوال مبطن فرو',[[2,1]]], // lining, not a fur jacket
 ['فروع عمان - جاكيت جوخ كاجوال',[[2,1]]],
 ['جكيت جوخ كاجوال\nعدد 2 فرو',[[2,1],[1,2]]],
 ['عدد 2 فرو\nسي ايبوكسي 1',[[1,2],[3,1]]],
 ['جاكيت فرو 15 دينار',[[1,1]]]
];

test('server: fur spellings resolve to the single fur model with the right quantity',async()=>{
 for(const [text,expected] of CASES){
  const got=(await classify(text)).map(i=>[i.model_id,i.quantity]).sort((a,b)=>a[0]-b[0]);
  assert.deepEqual(got,[...expected].sort((a,b)=>a[0]-b[0]),text);
 }
});

test('approved alias list',()=>{
 for(const a of ['فرو','جاكيت فرو','جكيت فرو','جاكيت الفرو','جكيت الفرو'])assert.ok(FUR_ALIASES.includes(a),a);
});

const clientFur=()=>{
 const src=readFileSync(new URL('../public/app-v73-model-performance.js',import.meta.url),'utf8');
 const m=src.match(/\['جاكيت فرو',\/(.+?)\/i\]/);assert.ok(m,'fur rule present in app-v73');
 return new RegExp(m[1],'i');
};
test('model performance (client) detects fur exactly where the server does',async()=>{
 const re=clientFur();
 for(const [text,expected] of CASES){
  const server=expected.some(([id])=>id===1);
  assert.equal(re.test(text),server,text);
 }
});
test('client profit rules (product-rules.js) also accept «عدد 2 فرو»',()=>{
 const src=readFileSync(new URL('../public/product-rules.js',import.meta.url),'utf8');
 const line=src.split('\n').find(l=>l.includes("id:'fur_jacket'"));
 const regs=[...line.matchAll(/\/((?:\\\/|[^\/])+)\/i/g)].map(m=>new RegExp(m[1],'i'));
 assert.ok(regs.some(r=>r.test('عدد 2 فرو')));
 assert.ok(regs.some(r=>r.test('جكيت الفرو')));
 assert.ok(!regs.some(r=>r.test('فروع عمان')));
});
