// Correction of an earlier settlement (#10349: settled as "refused, fee not paid" on 20/11, then
// delivered by the courier). Original kept, difference recorded once, profit on the original
// shipment day, no stock movement, warehouse receipt stops it, no double run, admin only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {onRequestPost as correct} from '../functions/api/delivery-reconcile/correction.js';
import {onRequestPost as preview} from '../functions/api/delivery-reconcile/preview.js';
import {onRequestPost as commit} from '../functions/api/delivery-reconcile/commit.js';
import {onRequest as cohorts} from '../functions/api/profit-shipping-cohorts.js';
import {ensureStatusHistory} from '../functions/api/_status-history.js';

const PHONE='0778636583';
function setup(){
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivered_amount','REAL DEFAULT 0'],['cash_collected','REAL DEFAULT 0'],['delivery_fee','REAL DEFAULT 2'],['cost_of_goods','REAL DEFAULT 0'],['delivery_company_settled','INTEGER DEFAULT 0'],['delivery_company_settlement_id','INTEGER'],['delivered_pieces','INTEGER DEFAULT 0'],['settlement_note',"TEXT DEFAULT ''"],['returned_pieces','INTEGER DEFAULT 0'],['settled_at','TEXT']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'Corvex-sport');
  CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_code TEXT NOT NULL UNIQUE,store_id INTEGER NOT NULL,source_name TEXT NOT NULL DEFAULT '',matched_count INTEGER NOT NULL DEFAULT 0,unmatched_count INTEGER NOT NULL DEFAULT 0,duplicate_count INTEGER NOT NULL DEFAULT 0,delivered_count INTEGER NOT NULL DEFAULT 0,refused_count INTEGER NOT NULL DEFAULT 0,pending_count INTEGER NOT NULL DEFAULT 0,collected_amount REAL NOT NULL DEFAULT 0,delivery_fees REAL NOT NULL DEFAULT 0,net_due REAL NOT NULL DEFAULT 0,created_by INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (datetime('now')),statement_date TEXT);
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER NOT NULL,order_id INTEGER,phone TEXT NOT NULL DEFAULT '',imported_status TEXT NOT NULL DEFAULT '',applied_status TEXT NOT NULL DEFAULT '',imported_amount REAL NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',match_type TEXT NOT NULL DEFAULT '',PRIMARY KEY(settlement_id,phone,order_id));
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1),(2,'emp','E','x','staff',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day')),('e',2,datetime('now','+1 day'));
  INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('gap_filler','مالئ الفراغات',1,'["سي ايبوكسي"]','{}',0,1);`);
 const call=(fn,url,body,tok='t')=>fn({request:new Request('https://x/api'+url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tok,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));
 return {db,env,call};
}
// #10349 printed 19/11, deducted 2 pieces at print, settled 20/11 as refused/no fee (−2)
async function seed10349(t,{withCode=true}={}){
 const id=Number(t.db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,order_notes,raw_text,created_by,created_at,printed,first_printed_at,store_id) VALUES(10349,'ز',?,7,'سي ايبوكسي 2','سي ايبوكسي 2',1,'2026-11-19 08:00:00',1,'2026-11-19 09:00:00',1)`).run(PHONE).lastInsertRowid);
 const first=await t.call(commit,'/delivery-reconcile/commit',{store_id:1,source_name:'كشف 20/11',rows:[{row_index:1,order_id:id,selection:'auto',phone:PHONE,shipment_date:'2026-11-20',status:'refused_no_fee',raw_status:'راجع بعد الوصول',amount:0,delivery_fee:2,has_net:true,net_amount:-2,match_type:'matched',display_code:withCode?'BS05AUTOOUT':''}]});
 assert.equal(first.status,200,JSON.stringify(first.body));
 return {id,sid:first.body.settlement.id};
}
const newLine={status:'delivered',raw_status:'تم التسليم',amount:7,delivery_fee:2,has_net:true,net_amount:5,shipment_date:'2026-11-22',shipment_code:'BS05AUTOOUT',phone:PHONE};
const body=(o,extra={})=>({order_id:o.id,expected_settlement_id:o.sid,line:newLine,identity:{verified_code:'BS05AUTOOUT',confirmed:true},previous_charge:'kept',reason:'شركة التوصيل أعادت المحاولة وسلّمت الشحنة',confirm:'تصحيح التسوية',...extra});

test('commit stores the shipment code per line; status changes are recorded with source and user',async()=>{
 const t=setup();const o=await seed10349(t);
 assert.equal(t.db.prepare('SELECT shipment_code FROM delivery_company_settlement_orders WHERE order_id=?').get(o.id).shipment_code,'BS05AUTOOUT');
 const h=t.db.prepare('SELECT * FROM order_status_history WHERE order_id=?').all(o.id);
 assert.equal(h.length,1);assert.equal(h[0].from_status,'pending');assert.equal(h[0].to_status,'refused_no_fee');
 assert.match(h[0].source,/^delivery_statement:DC-/);assert.equal(h[0].changed_by,1);
 // a change from a path that does not declare itself is still recorded
 t.db.prepare("UPDATE orders SET delivery_status='pending' WHERE id=?").run(o.id);t.db.prepare("UPDATE orders SET delivery_status='refused_no_fee' WHERE id=?").run(o.id);
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM order_status_history WHERE order_id=? AND source='other'").get(o.id).n,2);
});

test('preview flags the conflict (same code, refused → delivered) instead of settling it again',async()=>{
 const t=setup();const o=await seed10349(t);
 const r=(await t.call(preview,'/delivery-reconcile/preview',{store_id:1,rows:[{phone:PHONE,shipment_date:'2026-11-22',amount:7,delivery_fee:2,status:'delivered',display_code:'BS05AUTOOUT'}]})).body.rows[0];
 assert.equal(r.match_type,'review_settled');
 const c=r.candidates.find(x=>x.id===o.id);
 assert.equal(c.identity,'same_code');assert.equal(c.result_conflict,true);assert.equal(c.correction_possible,true);
 const other=(await t.call(preview,'/delivery-reconcile/preview',{store_id:1,rows:[{phone:PHONE,shipment_date:'2026-11-22',amount:7,delivery_fee:2,status:'delivered',display_code:'BS99OTHER'}]})).body.rows[0];
 assert.equal(other.candidates.find(x=>x.id===o.id).correction_possible,false,'different shipment code: no correction');
});

test('dry run writes nothing; staff refused; wrong code / missing confirmation refused',async()=>{
 const t=setup();const o=await seed10349(t);
 const dump=()=>JSON.stringify(['orders','delivery_company_settlements','delivery_company_settlement_orders','order_status_history'].map(n=>t.db.prepare(`SELECT * FROM ${n}`).all()));
 const before=dump();
 const d=await t.call(correct,'/x',body(o,{dry_run:true,confirm:''}));
 assert.equal(d.status,200,JSON.stringify(d.body));
 assert.deepEqual([d.body.from.cash,d.body.to.line_net,d.body.to.final_cash,d.body.cash_difference],[-2,5,3,5]);
 assert.equal(dump(),before,'dry run is read-only');
 assert.equal((await t.call(correct,'/x',body(o),'e')).status,403);
 assert.equal((await t.call(correct,'/x',body(o,{line:{...newLine,shipment_code:'BS77'}}))).status,400);
 assert.equal((await t.call(correct,'/x',body(o,{identity:{verified_code:'BS05AUTOOUT',confirmed:false}}))).status,400);
 assert.equal((await t.call(correct,'/x',body(o,{confirm:'نعم'}))).status,400);
 assert.equal(dump(),before);
});

test('correction: original kept, difference recorded once, final result in the original day report, no stock change, no double run',async()=>{
 const t=setup();const o=await seed10349(t);
 t.db.exec(`CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY,model_id INTEGER,order_id INTEGER,quantity_delta INTEGER,movement_type TEXT,note TEXT,created_by INTEGER,created_at TEXT DEFAULT (datetime('now')),ref TEXT,source_ref TEXT);
  INSERT INTO inventory_movements(model_id,order_id,quantity_delta,movement_type,note) VALUES(1,${o.id},-2,'order','خصم أول طباعة بوليصة');`);
 const stockBefore=JSON.stringify(t.db.prepare('SELECT * FROM inventory_movements').all());
 const r=await t.call(correct,'/x',body(o));
 assert.equal(r.status,200,JSON.stringify(r.body));
 const ord=t.db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);
 assert.equal(ord.delivery_status,'delivered');assert.equal(ord.cash_collected,3);assert.equal(ord.delivered_amount-ord.delivery_fee,3);
 // original settlement and line untouched
 const orig=t.db.prepare('SELECT * FROM delivery_company_settlements WHERE id=?').get(o.sid);
 assert.equal(orig.net_due,-2);
 assert.equal(t.db.prepare('SELECT applied_status FROM delivery_company_settlement_orders WHERE settlement_id=?').get(o.sid).applied_status,'refused_no_fee');
 // difference only in the correction settlement: −2 + 5 = 3 = final cash
 const corr=t.db.prepare("SELECT * FROM delivery_company_settlements WHERE settlement_code LIKE 'DCX-%'").get();
 assert.equal(corr.net_due,5);
 assert.equal(t.db.prepare('SELECT SUM(net_due) s FROM delivery_company_settlements').get().s,ord.cash_collected);
 // history: refused_no_fee -> delivered by settlement_correction
 const h=t.db.prepare('SELECT * FROM order_status_history WHERE order_id=? ORDER BY id').all(o.id).at(-1);
 assert.equal(h.from_status,'refused_no_fee');assert.equal(h.to_status,'delivered');assert.match(h.source,/^settlement_correction:DCX-/);assert.equal(h.cash_before,-2);assert.equal(h.cash_after,3);
 // stock untouched
 assert.equal(JSON.stringify(t.db.prepare('SELECT * FROM inventory_movements').all()),stockBefore);
 // profit report of the ORIGINAL shipment day (19/11): delivered, cash 3, cost 2 × 1 = 2 once, profit 1
 const rep=(await t.call(cohorts,'/profit-shipping-cohorts?date=2026-11-19&store_id=0')).body;
 const row=rep.orders.find(x=>Number(x.order_code)===10349);
 assert.equal(row.status,'delivered');assert.equal(row.calculated_cost,2);assert.equal(row.profit,1);assert.equal(rep.return_cash,0);
 // second run refused (same settlement), nothing changes
 const again=await t.call(correct,'/x',body(o));
 assert.equal(again.status,409);
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM delivery_company_settlements WHERE settlement_code LIKE 'DCX-%'").get().n,1);
 // the same statement line is now "already settled" (never counted twice)
 const p=(await t.call(preview,'/delivery-reconcile/preview',{store_id:1,rows:[{phone:PHONE,shipment_date:'2026-11-22',amount:7,delivery_fee:2,status:'delivered',display_code:'BS05AUTOOUT'}]})).body.rows[0];
 assert.equal(p.match_type,'already_settled');
 // a later, documented correction corrects the correction settlement
 const later=await t.call(correct,'/x',{...body(o),expected_settlement_id:corr.id,previous_charge:'reversed',reason:'تبيّن أن شركة التوصيل ألغت أجور المحاولة الأولى'});
 assert.equal(later.status,200,JSON.stringify(later.body));
 assert.equal(t.db.prepare('SELECT cash_collected c FROM orders WHERE id=?').get(o.id).c,5);
 assert.equal(t.db.prepare('SELECT SUM(net_due) s FROM delivery_company_settlements').get().s,5);
});

test('goods recorded as received in the warehouse stop the correction',async()=>{
 const t=setup();const o=await seed10349(t);
 t.db.exec(`CREATE TABLE cargo_return_close_reports(id INTEGER PRIMARY KEY,created_at TEXT DEFAULT (datetime('now')),created_by INTEGER,source_name TEXT,matched_count INTEGER,closed_count INTEGER,skipped_count INTEGER,details_json TEXT);
  INSERT INTO cargo_return_close_reports(created_by,source_name,details_json) VALUES(1,'مرتجعات','{"closed":[{"order_id":${o.id},"order_code":10349,"shipment_code":"BS05AUTOOUT"}]}');`);
 const r=await t.call(correct,'/x',body(o));
 assert.equal(r.status,423);assert.equal(r.body.stopped,true);
 assert.equal(t.db.prepare('SELECT delivery_status s FROM orders WHERE id=?').get(o.id).s,'refused_no_fee');
});

test('trigger setup is idempotent',async()=>{
 const t=setup();await ensureStatusHistory(t.env);await ensureStatusHistory(t.env);
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='trg_order_status_history'").get().n,1);
});
