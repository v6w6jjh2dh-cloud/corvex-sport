// Returns matching: orders already received in a closed returns statement are not offered
// again; a "returned" status alone does not exclude; closed shipment codes cannot be closed twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {resetInventorySchemaCache,deductOnFirstPrint} from '../functions/api/_inventory.js';
import {onRequest as preview} from '../functions/api/cargo-returns-preview.js';
import {onRequest as commit} from '../functions/api/cargo-returns-commit.js';

function setup(){
 resetInventorySchemaCache();
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"]])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));
  INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('fur','جاكيت فرو',4,'["جاكيت فرو"]','{}',0,1);`);
 const order=(code,status,day)=>{const id=Number(db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,raw_text,created_by,created_at,store_id,delivery_status) VALUES(?,?,?,?,?,1,?,1,?)`).run(code,'ع','0791234567',10,'جاكيت فرو عدد 1',day,status).lastInsertRowid);return id};
 const print=async id=>{await deductOnFirstPrint(env,db.prepare('SELECT * FROM orders WHERE id=?').get(id),1);db.prepare('UPDATE orders SET first_printed_at=created_at WHERE id=?').run(id)};
 const call=(fn,method,body)=>fn({request:new Request('https://x/api/x',{method,headers:{authorization:'Bearer t','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));
 const row=(code,extra={})=>({shipment_code:code,phone:'0791234567',area:'عمان',city:'عمان',status:'ملغي',return_status:'تم ارسال المرتجع',...extra});
 const stock=()=>Number(db.prepare('SELECT quantity FROM inventory_balances').get()?.quantity||0);
 return {db,env,order,print,call,row,stock};
}

test('#10233 already received in a closed returns statement is not offered; #10437 is matched alone',async()=>{
 const t=setup();
 const a=t.order(10233,'pending','2026-11-18 08:00:00');await t.print(a);
 const first=await t.call(commit,'POST',{source_name:'كشف 1',rows:[{order_id:a,phone:'0791234567',shipment_code:'CB-10233'}]});
 assert.equal(first.body.updated,1);assert.equal(t.stock(),0);
 const b=t.order(10437,'pending','2026-11-21 08:00:00');await t.print(b);
 const p=await t.call(preview,'POST',{rows:[t.row('CB-10437')]});
 const r=p.body.rows[0];
 assert.equal(r.status,'matched');assert.equal(Number(r.order_code),10437);assert.match(r.reason,/استبعاد #10233/);
 const c=await t.call(commit,'POST',{source_name:'كشف 2',rows:[{order_id:b,phone:'0791234567',shipment_code:'CB-10437'}]});
 assert.equal(c.body.updated,1);assert.equal(t.stock(),0,'both pieces back once: -1-1+1+1');
});

test('a "returned" order that was never received stays a candidate (manual choice)',async()=>{
 const t=setup();
 const a=t.order(10233,'returned','2026-11-18 08:00:00');await t.print(a);
 const b=t.order(10437,'pending','2026-11-21 08:00:00');await t.print(b);
 const r=(await t.call(preview,'POST',{rows:[t.row('CB-1')]})).body.rows[0];
 assert.equal(r.status,'ambiguous');assert.deepEqual(r.candidate_codes.map(Number).sort(),[10233,10437]);
 const chosen=(await t.call(preview,'POST',{rows:[t.row('CB-1',{selected_order_id:a})]})).body.rows[0];
 assert.equal(chosen.status,'matched');assert.equal(Number(chosen.order_code),10233);
});

test('a shipment code closed before shows the report and date and cannot be closed again (server too)',async()=>{
 const t=setup();
 const a=t.order(10233,'pending','2026-11-18 08:00:00');await t.print(a);
 await t.call(commit,'POST',{source_name:'كشف 1',rows:[{order_id:a,phone:'0791234567',shipment_code:'CB-9'}]});
 const before=t.stock();
 const r=(await t.call(preview,'POST',{rows:[t.row('cb-9')]})).body.rows[0];
 assert.equal(r.status,'already_closed');assert.match(r.reason,/تم تسكير هذه الشحنة سابقًا — كشف المرتجعات #1 بتاريخ/);
 const again=await t.call(commit,'POST',{source_name:'كشف مكرر',rows:[{order_id:a,phone:'0791234567',shipment_code:'CB-9'}]});
 assert.equal(again.body.updated,0);assert.equal(again.body.skipped[0].already_closed,true);assert.equal(t.stock(),before);
 const other=await t.call(commit,'POST',{source_name:'كود آخر',rows:[{order_id:a,phone:'0791234567',shipment_code:'NEW-CODE'}]});
 assert.equal(other.body.updated,0,'the same received order under a new code is refused too');assert.equal(t.stock(),before);
});

test('all orders of the phone already received → "closed before", not unmatched; duplicate code in one statement',async()=>{
 const t=setup();
 const a=t.order(10233,'pending','2026-11-18 08:00:00');await t.print(a);
 await t.call(commit,'POST',{source_name:'كشف 1',rows:[{order_id:a,phone:'0791234567',shipment_code:'CB-1'}]});
 const r=(await t.call(preview,'POST',{rows:[t.row('CB-NEW')]})).body.rows[0];
 assert.equal(r.status,'already_closed');assert.match(r.reason,/#10233/);
 const b=t.order(10437,'pending','2026-11-21 08:00:00');await t.print(b);
 const d=(await t.call(preview,'POST',{rows:[t.row('CB-7'),t.row('CB-7')]})).body.rows;
 assert.equal(d[0].status,'matched');assert.equal(d[1].status,'duplicate');
});
