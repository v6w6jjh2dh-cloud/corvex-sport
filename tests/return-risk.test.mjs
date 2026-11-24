import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {onRequestGet} from '../functions/api/customer-return-risk.js';

function setup(){
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivery_company_settled','INTEGER DEFAULT 0'],['settled_at','TEXT']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'Corvex-sport'),(2,'متجر ثاني');
  CREATE TABLE cargo_return_close_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT DEFAULT (datetime('now')),details_json TEXT);
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'staff','S','x','staff',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));`);
 let code=20000,day=1;
 const add=(phone,status,{settled=1,store=1,cargo=false}={})=>{const d=`2026-11-${String(day++).padStart(2,'0')} 09:00:00`;
  const r=db.prepare("INSERT INTO orders(order_code,recipient_name,phone,amount,created_by,created_at,first_printed_at,store_id,delivery_status,delivery_company_settled,settled_at) VALUES(?,?,?,?,1,?,?,?,?,?,?)").run(++code,'ع',phone,10,d,d,store,status,cargo?0:settled,settled&&!cargo?d:null);
  if(cargo)db.prepare("INSERT INTO cargo_return_close_reports(details_json) VALUES(?)").run(JSON.stringify({closed:[{order_id:Number(r.lastInsertRowid)}]}));
  return code};
 const check=async(phone,store=1)=>{const res=await onRequestGet({request:new Request(`https://x/api/customer-return-risk?phone=${encodeURIComponent(phone)}&store_id=${store}`,{headers:{authorization:'Bearer t'}}),env});return res.json()};
 return {add,check};
}

test('return → return warns (count 2), with order details',async()=>{
 const t=setup();const a=t.add('0791111111','refused_no_fee'),b=t.add('0791111111','refused_fee_paid');
 const d=await t.check('0791111111');
 assert.equal(d.warning,true);assert.equal(d.count,2);assert.deepEqual(d.orders.map(o=>o.order_code),[b,a]);
 assert.equal(d.store_name,'Corvex-sport');assert.ok(d.orders[0].return_date);
});
test('return → delivered → return does not warn',async()=>{
 const t=setup();t.add('0792222222','refused_no_fee');t.add('0792222222','delivered');t.add('0792222222','returned',{cargo:true});
 const d=await t.check('0792222222');assert.equal(d.warning,false);assert.equal(d.count,1);
});
test('three returns → count 3; a delivery before them does not reset',async()=>{
 const t=setup();t.add('0793333333','delivered');t.add('0793333333','refused_no_fee');t.add('0793333333','returned',{cargo:true});t.add('0793333333','canceled_before_arrival');
 const d=await t.check('0793333333');assert.equal(d.warning,true);assert.equal(d.count,3);
});
test('pending / unproven returns are neither returns nor deliveries',async()=>{
 const t=setup();t.add('0794444444','refused_no_fee');t.add('0794444444','pending',{settled:0});t.add('0794444444','returned',{settled:0});t.add('0794444444','refused_fee_paid');
 const d=await t.check('0794444444');assert.equal(d.warning,true);assert.equal(d.count,2,'unproven "returned" and pending are skipped');
});
test('phone formats are unified; other stores are not counted',async()=>{
 const t=setup();t.add('+962 79 555 5555','refused_no_fee');t.add('962795555555','refused_no_fee');t.add('0795555555','refused_no_fee',{store:2});
 for(const p of ['0795555555','795555555','00962795555555','+962795555555','٠٧٩٥٥٥٥٥٥٥']){const d=await t.check(p);assert.equal(d.warning,true,p);assert.equal(d.count,2,p)}
 assert.equal((await t.check('0795555555',2)).warning,false);
});
test('a delivery after the returns resets the streak; new customers get no warning',async()=>{
 const t=setup();t.add('0796666666','refused_no_fee');t.add('0796666666','refused_no_fee');t.add('0796666666','partial');
 assert.equal((await t.check('0796666666')).warning,false);
 assert.equal((await t.check('0797777777')).warning,false);
});
