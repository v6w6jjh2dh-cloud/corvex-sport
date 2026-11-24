// The order investigation is strictly read-only and reports the settlement history (#10349).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {onRequestGet as investigate} from '../functions/api/order-investigation.js';

test('#10349: refused earlier, never received in the warehouse — reported without writing anything',async()=>{
 const {db,env}=createD1();
 for(const [c,t] of [['store_id','INTEGER'],['delivery_status',"TEXT DEFAULT 'pending'"],['delivered_amount','REAL'],['cash_collected','REAL'],['delivery_fee','REAL'],['delivery_company_settled','INTEGER DEFAULT 0'],['delivery_company_settlement_id','INTEGER'],['settled_at','TEXT']])db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
 db.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO stores VALUES(1,'كورفكس');
  CREATE TABLE delivery_company_settlements(id INTEGER PRIMARY KEY,settlement_code TEXT,store_id INTEGER,source_name TEXT,created_by INTEGER,created_at TEXT,statement_date TEXT);
  CREATE TABLE delivery_company_settlement_orders(settlement_id INTEGER,order_id INTEGER,phone TEXT,imported_status TEXT,applied_status TEXT,imported_amount REAL,note TEXT,match_type TEXT);
  INSERT INTO users(id,username,display_name,password_hash,role,is_active) VALUES(1,'admin','A','x','admin',1),(2,'emp','E','x','staff',1);
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day')),('e',2,datetime('now','+1 day'));
  INSERT INTO orders(id,order_code,recipient_name,phone,amount,created_by,created_at,first_printed_at,store_id,delivery_status,delivered_amount,cash_collected,delivery_fee,delivery_company_settled,delivery_company_settlement_id)
   VALUES(6,10349,'ز','0778636583',7,1,'2026-11-19 08:00:00','2026-11-19 09:00:00',1,'refused_no_fee',0,-2,2,1,2);
  INSERT INTO delivery_company_settlements VALUES(2,'DC-20',1,'كشف 20/11',1,'2026-11-20 14:00:00','2026-11-19');
  INSERT INTO delivery_company_settlement_orders VALUES(2,6,'0778636583','راجع بعد الوصول - لا رد','refused_no_fee',0,'','matched');`);
 const dump=()=>JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t=>[t.name,db.prepare(`SELECT * FROM "${t.name}"`).all()]));
 const before=dump();
 const call=tok=>investigate({request:new Request('https://x/api/order-investigation?code=10349',{headers:{authorization:'Bearer '+tok}}),env}).then(async r=>({status:r.status,body:await r.json()}));
 assert.equal((await call('e')).status,403,'admin only');
 const r=await call('t');
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(dump(),before,'read-only');
 assert.equal(r.body.settlement_lines.length,1);
 assert.equal(r.body.settlement_lines[0].settlement_code,'DC-20');
 assert.ok(r.body.findings.some(x=>/لا يوجد أي دليل أن الشحنة رجعت للمستودع/.test(x)));
 assert.ok(r.body.hints.some(x=>/أعادت محاولة التسليم|ربط خاطئ/.test(x)));
});
