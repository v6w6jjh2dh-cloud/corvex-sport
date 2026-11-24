// Refusal results: the customer pays a 2 JOD refusal charge, the company keeps the real fee of
// the area. Paid refusal = charge − real fee (0 with fee 2, +0.25 with fee 1.75); unpaid
// refusal = −real fee. Taken from the statement, never a fixed value; no goods cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {refusalCash} from '../functions/api/_partial-delivery.js';
import {onRequest as cohorts} from '../functions/api/profit-shipping-cohorts.js';
import {onRequestPost as commit} from '../functions/api/delivery-reconcile/commit.js';

test('refusalCash: statement net, legacy gross rows, unpaid refusal, unknown fee',()=>{
 assert.deepEqual(refusalCash({cash_collected:0,delivery_fee:2,delivered_amount:2},'refused_fee_paid'),{cash:0,unknown:false});
 assert.deepEqual(refusalCash({cash_collected:.25,delivery_fee:1.75,delivered_amount:2},'refused_fee_paid'),{cash:.25,unknown:false});
 assert.deepEqual(refusalCash({cash_collected:2,delivery_fee:1.75,delivered_amount:2},'refused_fee_paid'),{cash:.25,unknown:false},'legacy row stored gross');
 assert.deepEqual(refusalCash({cash_collected:-1.75,delivery_fee:1.75},'refused_no_fee'),{cash:-1.75,unknown:false});
 assert.deepEqual(refusalCash({cash_collected:0,delivery_fee:1.75},'refused_no_fee'),{cash:-1.75,unknown:false});
 assert.deepEqual(refusalCash({cash_collected:-2,delivery_fee:2},'refused_no_fee'),{cash:-2,unknown:false});
 assert.deepEqual(refusalCash({cash_collected:0,delivery_fee:0},'refused_no_fee'),{cash:0,unknown:true},'no fixed −2');
});

function setup(){
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivered_amount','REAL DEFAULT 0'],['cash_collected','REAL DEFAULT 0'],['delivery_fee','REAL DEFAULT 2'],['cost_of_goods','REAL DEFAULT 0'],['delivery_company_settled','INTEGER DEFAULT 0'],['delivery_company_settlement_id','INTEGER'],['delivered_pieces','INTEGER DEFAULT 0'],['settlement_note',"TEXT DEFAULT ''"],['returned_pieces','INTEGER DEFAULT 0'],['settled_at','TEXT']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'Corvex-sport');
  CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_code TEXT NOT NULL UNIQUE,store_id INTEGER NOT NULL,source_name TEXT NOT NULL DEFAULT '',matched_count INTEGER NOT NULL DEFAULT 0,unmatched_count INTEGER NOT NULL DEFAULT 0,duplicate_count INTEGER NOT NULL DEFAULT 0,delivered_count INTEGER NOT NULL DEFAULT 0,refused_count INTEGER NOT NULL DEFAULT 0,pending_count INTEGER NOT NULL DEFAULT 0,collected_amount REAL NOT NULL DEFAULT 0,delivery_fees REAL NOT NULL DEFAULT 0,net_due REAL NOT NULL DEFAULT 0,created_by INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (datetime('now')),statement_date TEXT);
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER NOT NULL,order_id INTEGER,phone TEXT NOT NULL DEFAULT '',imported_status TEXT NOT NULL DEFAULT '',applied_status TEXT NOT NULL DEFAULT '',imported_amount REAL NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',match_type TEXT NOT NULL DEFAULT '',PRIMARY KEY(settlement_id,phone,order_id));
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));
  INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('jokh_casual','جاكيت جوخ كاجوال',5.2,'["جاكيت جوخ كاجوال"]','{}',0,1);`);
 let code=10500;
 const add=(phone)=>{const id=Number(db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,order_notes,raw_text,created_by,created_at,printed,first_printed_at,store_id) VALUES(?,?,?,?,?,?,1,?,1,?,1)`).run(++code,'ع',phone,15,'جاكيت جوخ كاجوال','جاكيت جوخ كاجوال','2026-11-21 06:00:00','2026-11-21 06:00:00').lastInsertRowid);return {id,code}};
 const call=(fn,url,body)=>fn({request:new Request('https://x/api'+url,{method:body?'POST':'GET',headers:{authorization:'Bearer t','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));
 return {db,env,add,call};
}
const line=(o,phone,extra)=>({row_index:1,order_id:o.id,selection:'auto',phone,shipment_date:'2026-11-22',match_type:'matched',has_net:false,...extra});

test('commit + profit report: refusal results come from the statement (+0.25, 0, −1.75, −2), no goods cost',async()=>{
 const t=setup();
 const a=t.add('0791000001'),b=t.add('0791000002'),c=t.add('0791000003'),d=t.add('0791000004'),e=t.add('0791000005');
 const res=await t.call(commit,'/delivery-reconcile/commit',{store_id:1,source_name:'كشف',rows:[
  line(a,'0791000001',{status:'refused_fee_paid',amount:2,delivery_fee:1.75,has_net:true,net_amount:.25}),
  line(b,'0791000002',{status:'refused_fee_paid',amount:2,delivery_fee:2}),          // no net column: 2 − 2
  line(c,'0791000003',{status:'refused_no_fee',amount:0,delivery_fee:1.75}),        // −1.75
  line(d,'0791000004',{status:'refused_no_fee',amount:0,delivery_fee:2,has_net:true,net_amount:-2}),
  line(e,'0791000005',{status:'refused_no_fee',amount:0,delivery_fee:0})           // fee unknown → held
 ]});
 assert.equal(res.status,200,JSON.stringify(res.body));
 const cash=id=>t.db.prepare('SELECT cash_collected c,delivery_company_settled s FROM orders WHERE id=?').get(id);
 assert.equal(cash(a.id).c,.25);assert.equal(cash(b.id).c,0);assert.equal(cash(c.id).c,-1.75);assert.equal(cash(d.id).c,-2);
 assert.equal(cash(e.id).s,0,'unknown refusal fee is held, not settled with a fixed −2');
 assert.ok(res.body.held.some(h=>/أجور الرفض الفعلية غير موجودة/.test(h.reason)));
 const r=(await t.call(cohorts,'/profit-shipping-cohorts?date=2026-11-21&store_id=0')).body;
 const by=code=>r.orders.find(o=>Number(o.order_code)===code);
 assert.equal(by(a.code).return_cash,.25);assert.equal(by(b.code).return_cash,0);
 assert.equal(by(c.code).return_cash,-1.75);assert.equal(by(d.code).return_cash,-2);
 assert.equal(r.return_cash,-3.5);
 for(const o of [a,b,c,d])assert.equal(by(o.code).calculated_cost,null,'no goods cost on a full refusal');
 assert.equal(r.engine,'cohort-v4.4');
});

test('legacy settled refusal stored without cash: unpaid uses the real fee, unknown fee is flagged, not −2',async()=>{
 const t=setup();
 const a=t.add('0792000001'),b=t.add('0792000002'),c=t.add('0792000003');
 t.db.prepare("INSERT INTO delivery_company_settlements(id,settlement_code,store_id) VALUES(9,'DC-OLD',1)").run();
 const set=(o,status,amount,cash,fee)=>t.db.prepare('UPDATE orders SET delivery_status=?,delivered_amount=?,cash_collected=?,delivery_fee=?,delivery_company_settled=1,delivery_company_settlement_id=9 WHERE id=?').run(status,amount,cash,fee,o.id);
 set(a,'refused_no_fee',0,0,1.75);set(b,'refused_no_fee',0,0,0);set(c,'refused_fee_paid',2,2,1.75);
 const r=(await t.call(cohorts,'/profit-shipping-cohorts?date=2026-11-21&store_id=0')).body;
 const by=code=>r.orders.find(o=>Number(o.order_code)===code);
 assert.equal(by(a.code).return_cash,-1.75);
 assert.equal(by(b.code).return_cash,0);assert.equal(by(b.code).return_fee_unknown,true);
 assert.equal(by(c.code).return_cash,.25);
 assert.equal(r.return_fee_unknown,1);
});
