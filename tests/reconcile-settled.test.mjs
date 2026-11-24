// Delivery-statement matching: an order is "already settled" only when the earlier
// settlement is provably the same shipment — never from the phone number alone (#10349).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {onRequestPost as preview} from '../functions/api/delivery-reconcile/preview.js';
import {onRequestGet as settlementGet} from '../functions/api/delivery-reconcile/settlement.js';

const PHONE='0778636583';
function setup(){
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivery_company_settled','INTEGER NOT NULL DEFAULT 0'],['delivery_company_settlement_id','INTEGER'],['delivered_amount','REAL'],['settled_at','TEXT'],['cash_collected','REAL'],['delivery_fee','REAL']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE IF NOT EXISTS stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'كورفكس'),(2,'متجر آخر');
  CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_code TEXT NOT NULL UNIQUE,store_id INTEGER NOT NULL,source_name TEXT NOT NULL DEFAULT '',matched_count INTEGER NOT NULL DEFAULT 0,unmatched_count INTEGER NOT NULL DEFAULT 0,duplicate_count INTEGER NOT NULL DEFAULT 0,delivered_count INTEGER NOT NULL DEFAULT 0,refused_count INTEGER NOT NULL DEFAULT 0,pending_count INTEGER NOT NULL DEFAULT 0,collected_amount REAL NOT NULL DEFAULT 0,delivery_fees REAL NOT NULL DEFAULT 0,net_due REAL NOT NULL DEFAULT 0,created_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),statement_date TEXT);
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER NOT NULL,order_id INTEGER,phone TEXT NOT NULL DEFAULT '',imported_status TEXT NOT NULL DEFAULT '',applied_status TEXT NOT NULL DEFAULT '',imported_amount REAL NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',match_type TEXT NOT NULL DEFAULT '',PRIMARY KEY(settlement_id,phone,order_id));
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));`);
 const order=(code,printedUtc,amount=7,store=1)=>Number(db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,raw_text,created_by,created_at,first_printed_at,store_id) VALUES(?,?,?,?,?,1,?,?,?)`).run(code,'عميل',PHONE,amount,'جاكيت فرو',printedUtc,printedUtc,store).lastInsertRowid);
 // An earlier settlement exactly as commit.js leaves it (statement_date = shipment day - 1).
 const settle=(orderId,{code='DC-100',statementDate='2026-11-19',savedUtc='2026-11-21 09:00:00',amount=7,status='delivered',shipment=null}={})=>{
  db.prepare(`INSERT INTO delivery_company_settlements(settlement_code,store_id,matched_count,delivered_count,collected_amount,net_due,created_by,created_at,statement_date) VALUES(?,1,1,1,?,?,1,?,?)`).run(code,amount,amount-2,savedUtc,statementDate);
  const sid=Number(db.prepare('SELECT id FROM delivery_company_settlements WHERE settlement_code=?').get(code).id);
  db.prepare(`INSERT INTO delivery_company_settlement_orders(settlement_id,order_id,phone,imported_status,applied_status,imported_amount,match_type) VALUES(?,?,?,?,?,?,?)`).run(sid,orderId,PHONE,'تم التسليم',status,amount,'matched');
  if(shipment){try{db.exec('ALTER TABLE delivery_company_settlement_orders ADD COLUMN shipment_date TEXT')}catch{}db.prepare('UPDATE delivery_company_settlement_orders SET shipment_date=? WHERE settlement_id=?').run(shipment,sid)}
  db.prepare(`UPDATE orders SET delivery_status=?,delivered_amount=?,delivery_company_settled=1,delivery_company_settlement_id=?,settled_at=? WHERE id=?`).run(status,amount,sid,savedUtc,orderId);
  return sid;
 };
 const call=(fn,method,body,qs='')=>fn({request:new Request('https://x/api/x'+qs,{method,headers:{authorization:'Bearer t','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));
 const line=(extra={})=>({phone:PHONE,shipment_date:'2026-11-22',amount:7,delivery_fee:2,status:'delivered',...extra});
 return {db,env,order,settle,call,line};
}

test('#10349: settled earlier, new statement for 22/11 with same phone and value -> needs review, not "already settled"',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-19 08:00:00');
 const sid=t.settle(id); // earlier statement for the 20/11 shipment, saved 21/11
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line()]})).body.rows[0];
 assert.equal(r.match_type,'review_settled');
 assert.match(r.reason,/تحتاج مراجعة/);
 assert.match(r.reason,/بعد حفظ الكشف السابق/);
 const c=r.candidates.find(x=>x.id===id);
 assert.ok(c,'settled order is listed for review');
 assert.equal(c.delivery_company_settled,1);
 assert.equal(c.settlement_id,sid);
 assert.equal(c.settlement_code,'DC-100');
 assert.equal(c.settlement_date,'2026-11-19');
 assert.equal(c.settlement_imported_amount,7);
 assert.equal(c.settlement_applied_status,'delivered');
});

test('phone alone is never enough: different value in earlier statement -> review',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-21 08:00:00');
 t.settle(id,{statementDate:'2026-11-21',savedUtc:'2026-11-23 09:00:00',amount:12});
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line()]})).body.rows[0];
 assert.equal(r.match_type,'review_settled');
 assert.match(r.reason,/قيمة الكشف السابق 12/);
});

test('earlier statement result was a return, now delivered -> review',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-21 08:00:00');
 t.settle(id,{statementDate:'2026-11-21',savedUtc:'2026-11-23 09:00:00',status:'refused_no_fee',amount:7});
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line()]})).body.rows[0];
 assert.equal(r.match_type,'review_settled');
 assert.match(r.reason,/نتيجة الكشف السابق مختلفة/);
});

test('same shipment re-sent (same date, value, result, store) -> already settled, never counted twice',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-21 08:00:00');
 t.settle(id,{statementDate:'2026-11-21',savedUtc:'2026-11-23 09:00:00',shipment:'2026-11-22'});
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line()]})).body.rows[0];
 assert.equal(r.match_type,'already_settled');
 assert.equal(r.candidates[0].id,id);
 assert.equal(r.candidates[0].settlement_shipment_date,'2026-11-22');
});

test('exact per-line shipment date that differs wins over the approximate statement date',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-21 08:00:00');
 t.settle(id,{statementDate:'2026-11-21',savedUtc:'2026-11-25 09:00:00',shipment:'2026-11-21'});
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line()]})).body.rows[0];
 assert.equal(r.match_type,'review_settled');
});

test('a new open order for the same phone is matched, the settled one is not touched',async()=>{
 const t=setup();
 const old=t.order(10349,'2026-11-19 08:00:00');t.settle(old);
 const fresh=t.order(10460,'2026-11-21 08:00:00');
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line()]})).body.rows[0];
 assert.equal(r.match_type,'matched');
 assert.equal(r.order_id,fresh);
});

test('shipment code of a settled order is still "already settled" (code is proof)',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-19 08:00:00');t.settle(id);
 const r=(await t.call(preview,'POST',{store_id:1,rows:[t.line({shipment_code:'10349'})]})).body.rows[0];
 assert.equal(r.match_type,'already_settled');
 assert.match(r.reason,/رقم الشحنة #10349/);
});

test('settlement detail endpoint is read-only and lists the settled orders',async()=>{
 const t=setup();
 const id=t.order(10349,'2026-11-19 08:00:00');const sid=t.settle(id);
 const before=JSON.stringify(t.db.prepare('SELECT * FROM orders').all());
 const d=(await t.call(settlementGet,'GET',null,'?id='+sid)).body;
 assert.equal(d.settlement.settlement_code,'DC-100');
 assert.equal(d.orders.length,1);
 assert.equal(Number(d.orders[0].order_code),10349);
 assert.equal(d.orders[0].imported_amount,7);
 assert.equal(d.orders[0].still_linked,true);
 assert.equal(JSON.stringify(t.db.prepare('SELECT * FROM orders').all()),before);
 assert.equal((await t.call(settlementGet,'GET',null,'?id=999')).status,404);
});
