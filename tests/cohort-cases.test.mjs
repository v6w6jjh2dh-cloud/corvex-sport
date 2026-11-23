// End-to-end tests for /api/profit-shipping-cohorts on an in-memory D1 copy.
// The catalogue imitates an older production row set: scarfo has only its
// original aliases (no «نساءي», no stati) so the engine must not depend on seeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {onRequest} from '../functions/api/profit-shipping-cohorts.js';

function setup(){
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivered_amount','REAL DEFAULT 0'],['cash_collected','REAL DEFAULT 0'],['delivery_fee','REAL DEFAULT 2'],['cost_of_goods','REAL DEFAULT 0'],['delivery_company_settled','INTEGER DEFAULT 0'],['delivery_company_settlement_id','INTEGER'],['delivered_pieces','INTEGER DEFAULT 0'],['settlement_note',"TEXT DEFAULT ''"],['returned_pieces','INTEGER DEFAULT 0']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'Corvex-sport');
  CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_code TEXT,store_id INTEGER,source_name TEXT,created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER,order_id INTEGER,phone TEXT,imported_status TEXT,applied_status TEXT,imported_amount REAL,note TEXT,match_type TEXT);
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));
  INSERT INTO delivery_company_settlements(id,settlement_code,store_id,source_name,created_at) VALUES(7,'DC-22',1,'كشف 22','2026-11-22 15:00:00');`);
 const models=[['jokh_casual','جاكيت جوخ كاجوال',5.2,['جاكيت جوخ كاجوال','جكيت جوخ كاجوال']],['jokh_scarfo','جاكيت جوخ سكايفو',7.5,['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت نسائي']],['gap_filler','مالئ الفراغات',1,['مالئ الفراغات','سي ايبوكسي']],['jakar','جاكار',4.25,['جاكار']],['polo_knit','بولو تريكو',3.5,['بولو تريكو']]];
 for(const [k,n,c,a] of models)db.prepare("INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(?,?,?,?,'{}',0,1)").run(k,n,c,JSON.stringify(a));
 let code=10300;
 const add=(o)=>{const r={code:++code,notes:'',raw:'',status:'delivered',amount:20,cash:18,fee:2,settled:1,partialItems:'',deliveredPieces:0,reviewed:0,day:'2026-11-21',...o};
  db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,order_notes,raw_text,created_by,created_at,printed,first_printed_at,store_id,delivery_status,delivered_amount,cash_collected,delivery_fee,delivery_company_settled,delivery_company_settlement_id,partial_received_items,delivered_pieces,profit_reviewed_settlement_id) VALUES(?,?,?,?,?,?,1,?,1,?,1,?,?,?,?,?,?,?,?,?)`)
   .run(r.code,'ع','0790000000',r.amount,r.notes,r.raw,r.day+' 06:00:00',r.day+' 06:00:00',r.status,r.amount,r.cash,r.fee,r.settled,r.settled?7:null,r.partialItems,r.deliveredPieces,r.reviewed?7:null);
  return r.code};
 const report=async(date='2026-11-21')=>{const res=await onRequest({request:new Request('https://x/api/profit-shipping-cohorts?date='+date+'&store_id=0',{headers:{authorization:'Bearer t'}}),env});const d=await res.json();assert.equal(res.status,200,JSON.stringify(d));return d};
 const byCode=(d,c)=>d.orders.find(o=>Number(o.order_code)===c);
 return {db,add,report,byCode};
}

test('#10400 partial, two identical casual jackets, one received → cost 5.20 only',async()=>{
 const t=setup();
 const c=t.add({raw:'سلمى\n0791234567\nجاكيت جوخ كاجوال 2 قطعه بيج واسود\n20 دينار شامل التوصيل',status:'partial',amount:10,cash:8});
 const o=t.byCode(await t.report(),c);
 assert.equal(o.item_quantity,2);
 assert.equal(o.calculated_cost,5.2);assert.equal(o.received_pieces,1);
 assert.equal(o.cash,8);assert.equal(o.profit,2.8);
 assert.equal(o.cost_needs_review,false,o.missing_reason);
});

test('#10400 layout variants: colours on the next line, price on the model line',async()=>{
 const t=setup();
 const a=t.add({raw:'جاكيت جوخ كاجوال\nبيج واسود\n20 دينار شامل التوصيل',status:'partial',amount:10,cash:8});
 const b=t.add({raw:'جاكيت جوخ كاجوال 20 دينار شامل التوصيل\nبيج واسود',status:'partial',amount:10,cash:8});
 const d=await t.report();
 for(const c of [a,b]){const o=t.byCode(d,c);assert.equal(o.item_quantity,2,'shipped '+c);assert.equal(o.calculated_cost,5.2,'cost '+c)}
});

test('#10376 bare «جكيت جوخ», single piece → scarfo 7.55',async()=>{
 const t=setup();
 const c=t.add({raw:'جكيت جوخ\nاسود\nوزن 80',amount:15,cash:13});
 const o=t.byCode(await t.report(),c);
 assert.deepEqual(o.items.map(i=>[i.name,i.quantity]),[['جاكيت جوخ سكايفو',1]]);
 assert.equal(o.calculated_cost,7.55);assert.equal(o.profit,5.45);
});

test('bare «جاكيت جوخ» with two pieces is NOT guessed',async()=>{
 const t=setup();
 const c=t.add({raw:'جاكيت جوخ عدد 2\nاسود وبيج',amount:28,cash:26});
 const o=t.byCode(await t.report(),c);
 assert.equal(o.calculated_cost,null);assert.equal(o.cost_needs_review,true);
});

test('#10375 «عدد2» + «جاكيت نساءي» → scarfo × 2 = 15.10, not doubled across notes/raw',async()=>{
 const t=setup();
 const same=t.add({notes:'عدد2\nجاكيت نساءي',raw:'عدد2\nجاكيت نساءي',amount:30,cash:28});
 const split=t.add({notes:'عدد2',raw:'هبة\nالزرقاء\nجاكيت نساءي\nاسود',amount:30,cash:28});
 const d=await t.report();
 for(const c of [same,split]){const o=t.byCode(d,c);assert.deepEqual(o.items.map(i=>[i.name,i.quantity]),[['جاكيت جوخ سكايفو',2]],'items '+c);assert.equal(o.calculated_cost,15.1,'cost '+c)}
});

test('the three orders together cost 27.85',async()=>{
 const t=setup();
 t.add({raw:'جاكيت جوخ كاجوال 2 قطعه بيج واسود\n20 دينار شامل التوصيل',status:'partial',amount:10,cash:8});
 t.add({raw:'جكيت جوخ',amount:15,cash:13});
 t.add({notes:'عدد2',raw:'جاكيت نساءي',amount:30,cash:28});
 const d=await t.report();
 assert.equal(d.costs,27.85);assert.equal(d.cost_review_count,0);
 assert.equal(d.cash,49);assert.equal(d.gross_profit,21.15);
});

test('guards: casual stays casual, mixed partial is not inferred, prices are not quantities',async()=>{
 const t=setup();
 const casual=t.add({raw:'جكيت جوخ كاجوال عدد 1',amount:12,cash:10});
 const mixed=t.add({raw:'جاكيت جوخ كاجوال 1\nجاكيت جوخ سكايفو 1',status:'partial',amount:10,cash:8});
 const three=t.add({raw:'جاكيت جوخ كاجوال عدد 3',status:'partial',amount:10,cash:8});
 const price=t.add({raw:'جاكار 15 دينار',amount:15,cash:13});
 const d=await t.report();
 assert.equal(t.byCode(d,casual).calculated_cost,5.2);
 assert.equal(t.byCode(d,mixed).calculated_cost,null);
 assert.equal(t.byCode(d,three).calculated_cost,null);
 assert.equal(t.byCode(d,price).item_quantity,1,JSON.stringify(t.byCode(d,price)));
});

test('explicit received pieces win over inference; unsettled orders stay pending',async()=>{
 const t=setup();
 const explicit=t.add({raw:'جاكيت جوخ كاجوال عدد 2',status:'partial',amount:20,cash:18,partialItems:JSON.stringify([{model_id:1,model_name:'جاكيت جوخ كاجوال',shipped:2,received:2,returned:0}]),reviewed:1});
 const open=t.add({raw:'جاكيت جوخ كاجوال عدد 1',settled:0});
 const d=await t.report();
 assert.equal(t.byCode(d,explicit).calculated_cost,10.4);
 assert.equal(t.byCode(d,open).result,'pending');
});

test('a failing catalogue migration does not drop the catalogue',async()=>{
 const t=setup();
 t.db.exec('DROP TABLE profit_model_audit');
 const c=t.add({raw:'جاكار 2',amount:15,cash:13});
 const d=await t.report();
 // (migration results are cached per isolate, so the error flag is only set on a fresh run)
 assert.equal(t.byCode(d,c).calculated_cost,8.5);
});
