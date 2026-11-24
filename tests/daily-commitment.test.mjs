// «الالتزام اليومي»: Corvex only, monthly ÷ 30 per day, effective-dated versions (past days never
// change without an explicit retroactive confirmation), admin-only edits, one deduction per day.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {onRequestGet as get,onRequestPost as post} from '../functions/api/daily-commitment.js';
import {onRequestGet as statements} from '../functions/api/profit-statements.js';

const today=new Date(Date.now()+3*3600e3).toISOString().slice(0,10);
const shift=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
function setup(){
 const {db,env}=createD1();
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'متجر آخر'),(2,'Corvex-sport');
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1),(2,'emp','E','x','staff',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day')),('e',2,datetime('now','+1 day'));`);
 const call=(fn,qs,body,tok='t')=>fn({request:new Request('https://x/api/daily-commitment'+qs,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tok,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env}).then(async r=>({status:r.status,body:await r.json()}));
 return {db,env,call};
}
const item=(d,kind)=>d.items.find(i=>i.kind===kind);

test('Corvex only, default items, admin-only edits, monthly ÷ 30',async()=>{
 const t=setup();
 const d0=(await t.call(get,'?date='+today)).body;
 assert.equal(d0.store.name,'Corvex-sport');
 assert.deepEqual(d0.items.map(i=>i.kind),['salaries','rent','electricity','internet']);
 assert.equal(d0.daily,0,'nothing until amounts are set');
 assert.equal((await t.call(post,'',{action:'set',item_id:item(d0,'salaries').id,monthly_amount:600,effective_from:today},'e')).status,403);
 for(const [k,v] of [['salaries',600],['rent',240],['electricity',45],['internet',15]])assert.equal((await t.call(post,'',{action:'set',item_id:item(d0,k).id,monthly_amount:v,effective_from:today})).status,200);
 const add=await t.call(post,'',{action:'add',name:'اشتراكات',monthly_amount:30,effective_from:today});assert.equal(add.status,200);
 const d=(await t.call(get,'?date='+today)).body;
 assert.equal(d.monthly_total,930);assert.equal(d.daily,31);
 // other store: does not apply; all-stores and Corvex views: applies
 assert.equal((await t.call(get,'?date='+today+'&store_id=1')).body.daily,0);
 assert.equal((await t.call(get,'?date='+today+'&store_id=1')).body.applies,false);
 assert.equal((await t.call(get,'?date='+today+'&store_id=2')).body.daily,31);
 assert.equal((await t.call(get,'?date='+today+'&store_id=0')).body.daily,31);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM daily_commitment_items WHERE store_id<>2').get().n,0,'nothing stored for other stores');
});

test('effective dates: past days keep their commitment; retroactive needs explicit approval; disable',async()=>{
 const t=setup();
 const d0=(await t.call(get,'?date='+today)).body,sal=item(d0,'salaries').id;
 await t.call(post,'',{action:'set',item_id:sal,monthly_amount:600,effective_from:today});
 assert.equal((await t.call(get,'?date='+shift(today,-1))).body.daily,0,'yesterday unaffected (no retroactive deduction)');
 // a raise from next week: today unchanged
 await t.call(post,'',{action:'set',item_id:sal,monthly_amount:900,effective_from:shift(today,7)});
 assert.equal((await t.call(get,'?date='+today)).body.daily,20);
 assert.equal((await t.call(get,'?date='+shift(today,7))).body.daily,30);
 // retroactive change refused without approval, accepted with it
 const r=await t.call(post,'',{action:'set',item_id:sal,monthly_amount:300,effective_from:shift(today,-3)});
 assert.equal(r.status,409);assert.equal(r.body.needs_retroactive_confirmation,true);
 assert.equal((await t.call(get,'?date='+shift(today,-3))).body.daily,0);
 assert.equal((await t.call(post,'',{action:'set',item_id:sal,monthly_amount:300,effective_from:shift(today,-3),confirm_retroactive:true})).status,200);
 assert.equal((await t.call(get,'?date='+shift(today,-3))).body.daily,10);
 assert.equal((await t.call(get,'?date='+today)).body.daily,20,'later version still wins on its own dates');
 // disable from tomorrow
 await t.call(post,'',{action:'set',item_id:sal,active:false,effective_from:shift(today,1)});
 assert.equal((await t.call(get,'?date='+today)).body.daily,20);
 assert.equal((await t.call(get,'?date='+shift(today,1))).body.daily,0);
 assert.equal(t.db.prepare('SELECT retroactive FROM daily_commitment_versions WHERE effective_from=?').get(shift(today,-3)).retroactive,1);
});

test('profit statements: ads of the date exposed once; days without statements still answer (commitment applies)',async()=>{
 const t=setup();
 for(const [c,ty] of [['store_id','INTEGER'],['delivery_status','TEXT'],['delivered_amount','REAL'],['cash_collected','REAL'],['delivery_fee','REAL'],['delivery_company_settlement_id','INTEGER']])t.db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${ty}`);
 t.db.exec(`CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY,settlement_code TEXT,store_id INTEGER,source_name TEXT,net_due REAL,statement_date TEXT,created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER,order_id INTEGER,phone TEXT,imported_status TEXT,applied_status TEXT,imported_amount REAL,note TEXT,match_type TEXT);
  CREATE TABLE shipping_cohort_ad_spend(date TEXT,store_id INTEGER,amount REAL);INSERT INTO shipping_cohort_ad_spend VALUES('2026-11-21',0,12.5);
  INSERT INTO delivery_company_settlements(id,settlement_code,store_id,source_name,net_due,statement_date) VALUES(1,'DC-A',2,'a',0,'2026-11-21'),(2,'DC-B',2,'b',0,'2026-11-21');`);
 const call=qs=>statements({request:new Request('https://x/api/profit-statements'+qs,{headers:{authorization:'Bearer t'}}),env:t.env}).then(r=>r.json());
 const d=await call('?date=2026-11-21&store_id=0');
 assert.equal(d.statements.length,2,'two statements the same day');
 assert.equal(d.ad_spend,12.5,'ads once for the date, not per statement');
 const empty=await call('?date=2026-11-22&store_id=0');
 assert.deepEqual(empty.statements,[]);assert.equal(empty.totals.profit,0);assert.equal(empty.ad_spend,0);
});
