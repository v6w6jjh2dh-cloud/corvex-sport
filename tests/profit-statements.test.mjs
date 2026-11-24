// Upper section of «الأرباح اليومية»: whole statements by statement date, whatever day each
// shipment left the warehouse; corrections counted once; the shipment-day section is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {createD1} from './_d1.mjs';
import {onRequestPost as correct} from '../functions/api/delivery-reconcile/correction.js';
import {onRequestPost as commit} from '../functions/api/delivery-reconcile/commit.js';
import {onRequest as cohorts} from '../functions/api/profit-shipping-cohorts.js';
import {onRequestGet as statements} from '../functions/api/profit-statements.js';

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

const addOrder=(t,code,phone,day,text='سي ايبوكسي 2',amount=7)=>Number(t.db.prepare(`INSERT INTO orders(order_code,recipient_name,phone,amount,order_notes,raw_text,created_by,created_at,printed,first_printed_at,store_id) VALUES(?,?,?,?,?,?,1,?,1,?,1)`).run(code,'ع',phone,amount,text,text,day+' 06:00:00',day+' 06:00:00').lastInsertRowid);
const settle=(t,rows,source)=>t.call(commit,'/c',{store_id:1,source_name:source,rows});

test('statement date groups orders shipped on different days; cost from the shipment-day engine; refusals by real fee',async()=>{
 const t=setup();
 const a=addOrder(t,10401,'0791000001','2026-11-18'),b=addOrder(t,10402,'0791000002','2026-11-20'),c=addOrder(t,10403,'0791000003','2026-11-20');
 const r=await settle(t,[
  {row_index:1,order_id:a,selection:'manual',confirm_date_outside:true,phone:'0791000001',shipment_date:'2026-11-22',status:'delivered',amount:7,delivery_fee:2,has_net:true,net_amount:5,match_type:'matched'},
  {row_index:2,order_id:b,selection:'auto',phone:'0791000002',shipment_date:'2026-11-22',status:'refused_fee_paid',amount:2,delivery_fee:1.75,has_net:true,net_amount:.25,match_type:'matched'},
  {row_index:3,order_id:c,selection:'auto',phone:'0791000003',shipment_date:'2026-11-22',status:'refused_no_fee',amount:0,delivery_fee:2,has_net:true,net_amount:-2,match_type:'matched'}],'كشف 22');
 assert.equal(r.status,200,JSON.stringify(r.body));
 const d=(await t.call(statements,'/profit-statements?date=2026-11-21&store_id=0')).body;
 assert.equal(d.statements.length,1);
 const T=d.totals;
 assert.deepEqual([T.orders,T.delivered,T.returned,T.sales,T.cash,T.costs,T.fees,T.returns,T.profit],[3,1,2,7,3.25,2,5.75,-1.75,1.25]);
 assert.equal(d.statements[0].net_matches_statement,true,'computed cash = statement net due');
 // same order, same cost as the shipment-day section
 const day18=(await t.call(cohorts,'/profit-shipping-cohorts?date=2026-11-18&store_id=0')).body.orders.find(o=>o.id===a);
 assert.equal(d.statements[0].orders.find(o=>o.order_id===a).cost,day18.calculated_cost);
});

test('correction (#10349): original statement keeps the refusal, correction statement carries only the change, totals never double',async()=>{
 const t=setup();const o=await seed10349(t);
 const before=(await t.call(statements,'/profit-statements?date=2026-11-19&store_id=0')).body;
 assert.equal(before.totals.cash,-2);assert.equal(before.totals.profit,-2);
 const r=await t.call(correct,'/x',body(o));assert.equal(r.status,200,JSON.stringify(r.body));
 const orig=(await t.call(statements,'/profit-statements?date=2026-11-19&store_id=0')).body;
 assert.equal(orig.totals.cash,-2,'original statement unchanged after the correction');
 assert.equal(orig.statements[0].orders[0].kind,'as_settled');
 const corr=(await t.call(statements,'/profit-statements?date=2026-11-21&store_id=0')).body;
 const row=corr.statements[0].orders[0];
 assert.equal(row.kind,'correction');assert.equal(corr.statements[0].is_correction,true);
 assert.deepEqual([row.sales,row.cash,row.cost,row.returns,row.profit],[7,5,2,2,3]);
 // across both statements = the order's final result (cash 3, cost 2, profit 1)
 assert.equal(round(orig.totals.cash+corr.totals.cash),3);
 assert.equal(round(orig.totals.profit+corr.totals.profit),1);
 const day=(await t.call(cohorts,'/profit-shipping-cohorts?date=2026-11-19&store_id=0')).body.orders.find(x=>x.order_code===10349||Number(x.order_code)===10349);
 assert.equal(day.profit,1,'shipment-day section shows the same final profit');
});
const round=n=>Math.round(n*100)/100;

test('store filter and empty dates',async()=>{
 const t=setup();
 assert.deepEqual((await t.call(statements,'/profit-statements?date=2026-11-30&store_id=0')).body.statements,[]);
 assert.equal((await t.call(statements,'/profit-statements?date=bad')).status,400);
});

test('the shipment-day engine file is untouched by this change',()=>{
 const diff=execSync('git diff HEAD --stat -- functions/api/profit-shipping-cohorts.js',{cwd:new URL('..',import.meta.url).pathname}).toString().trim();
 assert.equal(diff,'');
});
