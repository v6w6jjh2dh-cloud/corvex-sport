// Inventory rules for returns: deduct once at first print, restock only when a returns
// statement is closed (or a receipt is confirmed), never twice, partial = returned pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {deductOnFirstPrint,syncOrderInventory,resetInventorySchemaCache} from '../functions/api/_inventory.js';
import {onRequest as closeReturns} from '../functions/api/cargo-returns-commit.js';
import {onRequest as receipt} from '../functions/api/cargo-return-receipt.js';
import {onRequest as auditApi} from '../functions/api/inventory-return-audit.js';

function setup(){
 resetInventorySchemaCache();
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
 assert.equal(rep.body.summary.missing,2);assert.equal(rep.body.summary.missing_pieces,3);
 assert.equal(t.stock(t.FUR),-2,'the report alone changes nothing');
 const bad=await t.call(auditApi,'POST',{action:'apply',items:[{order_id:a}]});assert.equal(bad.status,400,'confirmation required');
 const none=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح'});assert.equal(none.status,400,'explicit selection required');
 const one=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح',items:[{order_id:a}]});
 assert.equal(one.body.applied_pieces,2);assert.equal(t.stock(t.FUR),0);assert.equal(t.stock(t.SC),-1,'unselected order untouched');
 const ap=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح',items:[{order_id:a},{order_id:b}]});
 assert.equal(ap.body.applied_pieces,1);assert.equal(t.stock(t.SC),0);
 const ap2=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح',items:[{order_id:a},{order_id:b}]});assert.equal(ap2.body.applied_orders,0);
 assert.equal((await t.call(auditApi,'GET')).body.summary.missing,0);
});

test('guarded restock: two plans computed before either runs add the pieces only once',async()=>{
 const {returnRestockPlan,restockStatements}=await import('../functions/api/_inventory.js');
 const t=setup();const id=t.order('جاكيت فرو عدد 2');await t.print(id);
 t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id=?").run(id);
 const p1=await returnRestockPlan(t.env,t.get(id)),p2=await returnRestockPlan(t.env,t.get(id));
 await t.env.DB.batch(restockStatements(t.env,id,p1.items,1,'a',{sourceRef:'x1'}));
 await t.env.DB.batch(restockStatements(t.env,id,p2.items,1,'b',{sourceRef:'x2'}));
 assert.equal(t.stock(t.FUR),0,'second identical restock is ignored by the database');
 assert.equal(t.db.prepare("SELECT COUNT(*) c FROM inventory_movements WHERE movement_type='cargo_return'").get().c,1);
});

test('report details show stock state from recorded movements, with summary',async()=>{
 const t=setup();
 const a=t.order('جاكيت فرو عدد 2','0791000001');await t.print(a);                 // will be added now
 const b=t.order('جاكيت فرو عدد 1','0791000002');await t.print(b);                 // added before by receipt
 await t.call(receipt,'POST',{shipment_code:'R-B',order_id:b,items:[{model_id:t.FUR,quantity:1}]});
 t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id=?").run(b);
 const c=t.order('شي غريب','0791000003');t.db.prepare("UPDATE orders SET first_printed_at='2026-11-20 09:00:00' WHERE id=?").run(c); // no deduction
 const d=t.order('جاكيت فرو عدد 2','0791000004');await t.print(d);t.db.prepare("UPDATE orders SET delivery_status='partial' WHERE id=?").run(d); // review
 const r=await t.call(closeReturns,'POST',{source_name:'كشف',rows:[a,b,c,d].map((id,i)=>({order_id:id,phone:t.get(id).phone,shipment_code:'S-'+i})),
  snapshot_rows:[a,b,c,d].map((id,i)=>({order_id:id,shipment_code:'S-'+i,phone:t.get(id).phone,status:'matched',order_status:t.get(id).delivery_status})).concat([{shipment_code:'S-X',phone:'0799999999',status:'unmatched'}])});
 assert.equal(r.body.restocked_pieces,2,'response counts only movements recorded for this report');
 const det=(await t.call(closeReturns,'GET',null,'https://x/api/cargo-returns-commit?id='+r.body.report_id)).body.report;
 const st=code=>det.shipments.find(x=>x.shipment_code===code).stock;
 assert.equal(st('S-0').state,'added');assert.equal(st('S-0').label,'تمت إضافة +2 للمخزون');assert.ok(st('S-0').at);
 assert.equal(st('S-1').state,'added_before');
 assert.equal(st('S-2').state,'no_deduction');
 assert.equal(st('S-3').state,'review');
 assert.equal(st('S-X').state,'waiting');
 assert.equal(det.shipments.find(x=>x.shipment_code==='S-0').proven_label,'مرتجع مثبت');
 assert.deepEqual(det.stock_summary,{closed:2,added_pieces:2,added_before_pieces:1,review:2,by_model:[{model_name:'جاكيت فرو',quantity:2}]});
});

test('a legacy closed return without a movement is shown as missing, not as added',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 1');await t.print(id);
 t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id=?").run(id);
 await t.call(closeReturns,'GET'); // creates the reports table
 t.db.prepare("INSERT INTO cargo_return_close_reports(created_by,details_json) VALUES(1,?)").run(JSON.stringify({closed:[{order_id:id,order_code:1,shipment_code:'OLD'}],skipped:[]}));
 const rid=t.db.prepare('SELECT MAX(id) id FROM cargo_return_close_reports').get().id;
 const det=(await t.call(closeReturns,'GET',null,'https://x/api/cargo-returns-commit?id='+rid)).body.report;
 assert.equal(det.shipments[0].stock.state,'missing');
});


test('print deducts into negative stock even from zero (no prior balance row)',async()=>{
 const t=setup();const id=t.order('جاكيت فرو عدد 3');
 assert.equal(t.db.prepare('SELECT COUNT(*) c FROM inventory_balances').get().c,0);
 await t.print(id);assert.equal(t.stock(t.FUR),-3);
});

test('audit explains "no deduction" by print time vs deduct-on-print start and the last stock count',async()=>{
 const t=setup();
 const mk=(text,phone,printedAt)=>{const id=t.order(text,phone);t.db.prepare("UPDATE orders SET first_printed_at=?,delivery_status='returned' WHERE id=?").run(printedAt,id);return id};
 // stock counts (manual "set") per model
 t.db.prepare("INSERT INTO inventory_movements(model_id,quantity_delta,movement_type,note,created_at) VALUES(?,?,'manual','تعيين الرصيد','2026-11-19 12:00:00')").run(t.FUR,0);
 // shipments printed before deduct-on-print started (first deduction below is 2026-11-22)
 const before=mk('جاكيت فرو عدد 2','0795000001','2026-11-18 10:00:00');     // left before the count → candidate
 const after=mk('جاكيت فرو عدد 1','0795000002','2026-11-20 10:00:00');      // left after the count → never deducted
 const nobase=mk('جاكيت جوخ سكايفو 1','0795000003','2026-11-18 10:00:00');  // no count for scarfo
 const late=t.order('جاكيت فرو عدد 1','0795000004');await t.print(late);t.db.prepare("UPDATE inventory_movements SET created_at='2026-11-22 09:00:00' WHERE order_id=?").run(late);
 const unk=mk('جاكيت فرو عدد 1','0795000005','2026-11-23 10:00:00');       // printed after start but no deduction
 t.db.prepare("UPDATE orders SET delivery_status='returned' WHERE id=?").run(late);
 await t.call(closeReturns,'GET');
 t.db.prepare("INSERT INTO cargo_return_close_reports(created_by,created_at,details_json) VALUES(1,'2026-11-24 09:00:00',?)").run(JSON.stringify({closed:[before,after,nobase,late,unk].map((id,i)=>({order_id:id,shipment_code:'H-'+i})),skipped:[]}));
 const d=(await t.call(auditApi,'GET')).body;
 const kind=id=>d.rows.find(r=>r.order_id===id).kind;
 assert.equal(kind(before),'count_excluded');assert.equal(kind(after),'never_deducted');assert.equal(kind(nobase),'no_baseline');
 assert.equal(kind(late),'missing');assert.equal(kind(unk),'bug_not_deducted');
 assert.equal(d.summary.no_deduction,4);assert.equal(d.summary.no_deduction_before_system,3);
 const s0=t.stock(t.FUR);
 const ap=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح',items:[{order_id:before},{order_id:after},{order_id:nobase}]});
 assert.equal(ap.body.applied_pieces,2,'only the candidate is applied; never-deducted and no-baseline are refused');
 assert.equal(t.stock(t.FUR),s0+2);assert.equal(t.stock(t.SC),0);
 const again=await t.call(auditApi,'POST',{action:'apply',confirm:'تطبيق التصحيح',items:[{order_id:before}]});
 assert.equal(again.body.applied_orders,0);assert.equal(t.stock(t.FUR),s0+2);
 assert.equal((await t.call(auditApi,'GET')).body.rows.find(r=>r.order_id===before).kind,'ok');
});

test('audit evidence: activation time, deductions log, prints since activation; never "all good" with open rows',async()=>{
 const t=setup();
 const a=t.order('جاكيت فرو عدد 1','0796000001');t.db.prepare("UPDATE orders SET first_printed_at='2026-11-23 10:00:00',delivery_status='returned' WHERE id=?").run(a); // after activation, no deduction
 const b=t.order('جاكيت فرو عدد 1','0796000002');await t.print(b);t.db.prepare("UPDATE orders SET first_printed_at='2026-11-23 11:00:00',delivery_status='returned' WHERE id=?").run(b);
 await t.call(closeReturns,'GET');
 t.db.prepare("INSERT INTO cargo_return_close_reports(created_by,details_json) VALUES(1,?)").run(JSON.stringify({closed:[{order_id:a,shipment_code:'E-1'}],skipped:[{order_id:b,order_code:'x',shipment_code:'E-2',reason:'مرتجع مسبقًا'}]}));
 const d=(await t.call(auditApi,'GET')).body;
 assert.equal(d.evidence.activated_at,'22/11/2026 11:49');
 assert.equal(d.evidence.deduction_movements,1);assert.equal(d.evidence.printed_since_activation,2);assert.equal(d.evidence.printed_since_activation_deducted,1);
 assert.equal(d.summary.closed_shipments,2,'legacy «مرتجع مسبقًا» rows count as received');
 assert.equal(d.summary.printed_after_activation_without_deduction,1);assert.equal(d.summary.bug_not_deducted,1);
 assert.equal(d.summary.needs_attention,2);
 assert.equal(d.rows.find(r=>r.order_id===a).status_ar,'مرتجع');
});
