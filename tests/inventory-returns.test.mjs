// Inventory rules for returns: deduct once at first print, restock only when a returns
// statement is closed (or a receipt is confirmed), never twice, partial = returned pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {deductOnFirstPrint,syncOrderInventory} from '../functions/api/_inventory.js';
import {onRequest as closeReturns} from '../functions/api/cargo-returns-commit.js';
import {onRequest as receipt} from '../functions/api/cargo-return-receipt.js';
import {onRequest as auditApi} from '../functions/api/inventory-return-audit.js';

function setup(){
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"]])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));`);
 const model=(key,name)=>Number(db.prepare("INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(?,?,1,?,'{}',0,1)").run(key,name,JSON.stringify([name])).lastInsertRowid);
 const FUR=model('fur','جاكيت فرو'),SC=model('sc','جاكيت جوخ سكايفو');
 let code=30000;
 const order=(text,phone='0791000000')=>{const r=db.prepare("INSERT INTO orders(order_code,recipient_name,phone,amount,raw_text,created_by,created_at,store_id) VALUES(?,?,?,?,?,1,'2026-11-20 08:00:00',1)").run(++code,'ع',phone,10,text);return Number(r.lastInsertRowid)};
 const get=id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id);
 const print=async id=>{const o=get(id);const r=await deductOnFirstPrint(env,o,1);db.prepare("UPDATE orders SET printed=1,first_printed_at=COALESCE(first_printed_at,'2026-11-20 09:00:00') WHERE id=?").run(id);return r};
 const stock=id=>Number(db.prepare('SELECT quantity FROM inventory_balances WHERE model_id=?').get(id)?.quantity||0);
 const call=(fn,method,body,url='https://x/api/x')=>fn({request:new Request(url,{method,headers:{authorization:'Bearer t','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));
 const close=rows=>call(closeReturns,'POST',{source_name:'كشف',rows:rows.map(([id,code])=>({order_id:id,phone:get(id).phone,shipment_code:code})),snapshot_rows:[]});
 return {db,env,FUR,SC,order,get,print,stock,call,close};
}

test('first print deducts once; reprint does not deduct again',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 2');
 assert.equal((await t.print(id)).changed,true);assert.equal(t.stock(t.FUR),-2);
 assert.equal((await t.print(id)).changed,false);assert.equal(t.stock(t.FUR),-2);
});

test('changing status to returned by hand does not touch stock',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 1');await t.print(id);
 const before=t.get(id);t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id=?").run(id);
 await syncOrderInventory(t.env,before,t.get(id),1);assert.equal(t.stock(t.FUR),-1);
});

test('closing the returns statement restocks the originally deducted model/quantity once',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 2\nجاكيت جوخ سكايفو 1');await t.print(id);
 t.db.prepare("UPDATE orders SET raw_text='تم تعديل النص لاحقًا' WHERE id=?").run(id); // deduction record wins
 const r=await t.close([[id,'CB-1']]);
 assert.equal(r.body.updated,1);assert.equal(r.body.restocked_pieces,3);
 assert.equal(t.get(id).delivery_status,'returned');assert.equal(t.stock(t.FUR),0);assert.equal(t.stock(t.SC),0);
 const again=await t.close([[id,'CB-1']]); // same statement uploaded again
 assert.equal(again.body.restocked_pieces||0,0);assert.equal(t.stock(t.FUR),0);
 const rec=await t.call(receipt,'POST',{shipment_code:'CB-1b',order_id:id,items:[{model_id:t.FUR,quantity:1}]});
 assert.equal(rec.status,422,'receipt after closing cannot add the same pieces');assert.equal(t.stock(t.FUR),0);
});

test('a manual "returned" order is restocked when its returns statement is closed',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 1');await t.print(id);
 t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id=?").run(id);
 const r=await t.close([[id,'CB-2']]);assert.equal(r.body.restocked_pieces,1);assert.equal(t.stock(t.FUR),0);
});

test('partial delivery: only the returned pieces come back',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 2\nجاكيت جوخ سكايفو 1');await t.print(id);
 t.db.prepare("UPDATE orders SET delivery_status='partial',partial_received_items=? WHERE id=?").run(JSON.stringify([{model_id:t.FUR,model_name:'جاكيت فرو',shipped:2,quantity:1,received:1,returned:1},{model_id:t.SC,shipped:1,quantity:0,received:0,returned:1}]),id);
 const r=await t.close([[id,'CB-3']]);
 assert.equal(r.body.restocked_pieces,2);assert.equal(t.get(id).delivery_status,'partial','status unchanged');
 assert.equal(t.stock(t.FUR),-1);assert.equal(t.stock(t.SC),0);
});

test('partial without detailed received pieces is held, no stock change',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 2');await t.print(id);
 t.db.prepare("UPDATE orders SET delivery_status='partial' WHERE id=?").run(id);
 const r=await t.close([[id,'CB-4']]);assert.equal(r.body.restocked_pieces||0,0);assert.equal(t.stock(t.FUR),-2);
 assert.match(r.body.skipped[0].reason,/تفصيل/);
});

test('receipt first, statement later: no double addition',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 2');await t.print(id);
 const rec=await t.call(receipt,'POST',{shipment_code:'CB-5',order_id:id,items:[{model_id:t.FUR,quantity:2}]});
 assert.equal(rec.status,200);assert.equal(t.stock(t.FUR),0);
 const r=await t.close([[id,'CB-5']]);assert.equal(r.body.restocked_pieces,0);assert.equal(t.stock(t.FUR),0);
});

test('delivered, pending-review and unprinted orders do not change stock',async()=>{
 const t=setup();const del=t.order('جاكيت فرو عدد 1','0792000000');await t.print(del);
 t.db.prepare("UPDATE orders SET delivery_status='delivered' WHERE id=?").run(del);
 const noAlloc=t.order('شي غريب','0793000000');t.db.prepare("UPDATE orders SET first_printed_at='2026-11-20 09:00:00' WHERE id=?").run(noAlloc);
 const r=await t.close([[del,'CB-6'],[noAlloc,'CB-7']]);
 assert.equal(t.stock(t.FUR),-1);assert.equal(r.body.restocked_pieces,0);
 assert.equal(t.get(noAlloc).delivery_status,'returned','status still closes, but nothing added');
 assert.equal(r.body.skipped.find(s=>s.order_id===del).reason.includes('مستلم'),true);
});

test('historical audit reports missing restocks, applies once, then shows none',async()=>{
 const t=setup();
 const a=t.order('جاكيت فرو عدد 2','0794000000'),b=t.order('جاكيت جوخ سكايفو 1','0795000000');await t.print(a);await t.print(b);
 // closed before automatic restock existed: only the status changed
 t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id IN (?,?)").run(a,b);
 t.db.exec("CREATE TABLE IF NOT EXISTS cargo_return_close_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by INTEGER NOT NULL, source_name TEXT NOT NULL DEFAULT '', matched_count INTEGER NOT NULL DEFAULT 0, closed_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, details_json TEXT NOT NULL DEFAULT '{}')");
 t.db.prepare("INSERT INTO cargo_return_close_reports(created_by,details_json) VALUES(1,?)").run(JSON.stringify({closed:[{order_id:a,shipment_code:'OLD-1'},{order_id:b,shipment_code:'OLD-2'}],skipped:[]}));
 const rep=await t.call(auditApi,'GET');
 assert.equal(rep.body.summary.missing_orders,2);assert.equal(rep.body.summary.missing_pieces,3);
 assert.equal(t.stock(t.FUR),-2,'the report alone changes nothing');
 const bad=await t.call(auditApi,'POST',{action:'apply'});assert.equal(bad.status,400);
 const ap=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح'});
 assert.equal(ap.body.applied_pieces,3);assert.equal(t.stock(t.FUR),0);assert.equal(t.stock(t.SC),0);
 const ap2=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح'});assert.equal(ap2.body.applied_orders,0);
 assert.equal((await t.call(auditApi,'GET')).body.summary.missing_orders,0);
});
