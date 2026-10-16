import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {ensureSchema,config,SOURCE_PROJECT,STORE_NAME,validatePayload} from '../functions/api/_cepoxy.js';
import {onRequest as hook} from '../functions/api/cepoxy-hook.js';
import {onRequest as connect} from '../functions/api/cepoxy-connect.js';
import {sourceSql} from '../functions/api/_cepoxy-source-sql.js';
import {onRequest as core} from '../functions/api/[[path]].js';

class D1 {
  constructor(){this.sql=new DatabaseSync(':memory:');this.failBatchAt=-1;}
  prepare(sql){
    const db=this;
    const bound=values=>({
      bind:(...v)=>bound(v),
      first:async()=>db.sql.prepare(sql).get(...values)||null,
      all:async()=>({results:db.sql.prepare(sql).all(...values)}),
      run:async()=>({meta:db.sql.prepare(sql).run(...values)}),
      execute:()=>({results:db.sql.prepare(sql).all(...values)})
    });
    return bound([]);
  }
  async batch(statements){
    this.sql.exec('BEGIN');
    try{const rows=statements.map((s,i)=>{if(i===this.failBatchAt)throw new Error('injected_failure');return s.execute()});this.sql.exec('COMMIT');return rows}
    catch(e){this.sql.exec('ROLLBACK');throw e}
  }
}
async function fixture(){
  const db=new D1();
  db.sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.sql.exec(`CREATE TABLE stores(id INTEGER PRIMARY KEY,name TEXT UNIQUE,is_active INTEGER DEFAULT 1,phone TEXT DEFAULT '');
    CREATE TABLE couriers(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER DEFAULT 1);
    INSERT INTO stores VALUES(1,'${STORE_NAME}',1,''),(2,'متجر آخر',1,'');
    INSERT INTO users(id,username,display_name,password_hash,role) VALUES(1,'admin','Manager','unused','admin'),(2,'staff','Staff','unused','staff');
    INSERT INTO sessions(token,user_id,expires_at) VALUES('admin-token',1,datetime('now','+1 day')),('staff-token',2,datetime('now','+1 day'));
    INSERT INTO couriers VALUES(1,'مندوب',1);`);
  for(const [key,type] of Object.entries({delivery_status:"TEXT NOT NULL DEFAULT 'pending'",store_id:'INTEGER',courier_id:'INTEGER',delivery_fee:'REAL DEFAULT 0',cash_collected:'REAL DEFAULT 0',delivered_amount:'REAL DEFAULT 0',cost_of_goods:'REAL DEFAULT 0',settled_at:'TEXT',store_settled:'INTEGER DEFAULT 0',courier_settled:'INTEGER DEFAULT 0',delivery_company_settled:'INTEGER DEFAULT 0',delivery_company_settlement_id:'INTEGER'}))db.sql.exec(`ALTER TABLE orders ADD COLUMN ${key} ${type}`);
  await ensureSchema(db);
  await db.prepare(`INSERT INTO cepoxy_config(id,store_id,actor_id,installation_id,signing_key) VALUES(1,1,1,?,?)`).bind(crypto.randomUUID(),'a'.repeat(64)).run();
  return {db,cfg:await config(db)};
}
function payload(cfg,event=1,changes={}){
  return {version:1,installation_id:cfg.installation_id,project_ref:SOURCE_PROJECT,event_id:String(event),kind:'order',
    order:{order_id:'SE-2000',status:'confirmed',currency:'JOD',packs:3,total_jod:10,name:'عميل تجريبي',contact_phone:'962790000001',city:'عمان',address:'عنوان تجريبي — لا يشحن',created_at:'2026-10-16T00:00:00Z',updated_at:'2026-10-16T00:00:00Z',...changes}};
}
async function deliver(db,cfg,p,{signed=true}={}){
  const text=JSON.stringify(p),signature=createHmac('sha256',signed?cfg.signing_key:'wrong').update(text).digest('hex');
  const response=await hook({env:{DB:db},request:new Request('https://corvex-sport.pages.dev/api/cepoxy-hook',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload:text,signature})})});
  return {status:response.status,data:await response.json()};
}
async function management(db,body,token='admin-token'){
  const r=await connect({env:{DB:db},request:new Request('https://corvex-sport.pages.dev/api/cepoxy-connect',{
    method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
  return {status:r.status,data:await r.json()};
}
const order=db=>db.sql.prepare('SELECT * FROM orders ORDER BY id').get();

test('creates a normal unprinted order in the exact store; repeated concurrent deliveries are idempotent',async()=>{
  const {db,cfg}=await fixture(),p=payload(cfg);
  const results=await Promise.all(Array.from({length:8},()=>deliver(db,cfg,p)));
  assert.ok(results.every(r=>r.status===200));
  assert.equal(db.sql.prepare('SELECT count(*) n FROM orders').get().n,1);
  const o=order(db);assert.equal(o.store_id,1);assert.equal(o.phone,'0790000001');assert.equal(o.amount,10);assert.equal(o.delivery_fee,0);assert.equal(o.printed,0);assert.equal(o.courier_id,1);
  assert.match(o.order_notes,/3 عبوات/);assert.match(o.raw_text,/SE-2000/);
});
test('update changes the original order; cancellation prevents printing and stale messages cannot resurrect it',async()=>{
  const {db,cfg}=await fixture();
  await deliver(db,cfg,payload(cfg,1));const id=order(db).id;
  await deliver(db,cfg,payload(cfg,3,{packs:2,total_jod:8,address:'العنوان الجديد'}));
  assert.equal(order(db).id,id);assert.equal(order(db).amount,8);
  const old=await deliver(db,cfg,payload(cfg,2,{packs:1,total_jod:6}));assert.equal(old.data.outcome,'superseded');assert.equal(old.data.saved,false);assert.equal(order(db).amount,8);
  await deliver(db,cfg,payload(cfg,4,{status:'cancelled'}));assert.equal(order(db).delivery_status,'canceled_before_arrival');
  db.sql.exec("INSERT INTO print_batches(id,batch_code,created_by) VALUES(1,'TEST',1)");
  assert.throws(()=>db.sql.prepare('INSERT INTO print_batch_orders VALUES(1,?,1)').run(id),/ملغي/);
  assert.equal((await deliver(db,cfg,payload(cfg,5))).data.outcome,'closed');
});
test('cancel arriving before create records a tombstone without a shippable order',async()=>{
  const {db,cfg}=await fixture();
  assert.equal((await deliver(db,cfg,payload(cfg,2,{status:'cancelled'}))).status,200);
  assert.equal((await deliver(db,cfg,payload(cfg,1))).data.outcome,'superseded');
  assert.equal(db.sql.prepare('SELECT count(*) n FROM orders').get().n,0);
});
test('manual edits, deletion, printed orders, financial settlement, inventory and print reservations require review',async()=>{
  for(const [mutation,expected] of [
    ["UPDATE orders SET recipient_name='تعديل يدوي'",'manual_change'],
    ['DELETE FROM orders','local_deleted'],
    ["UPDATE orders SET printed=1,first_printed_at=datetime('now')",'dispatched'],
    ['UPDATE orders SET delivery_company_settled=1','dispatched'],
    ['UPDATE orders SET store_id=2','store_changed'],
    ['INSERT INTO inventory_order_tracking(order_id) SELECT id FROM orders','inventory_review'],
    ["INSERT INTO print_batches(id,batch_code,created_by) VALUES(1,'TEST',1);INSERT INTO print_batch_orders SELECT 1,id,1 FROM orders",'dispatched']
  ]){
    const {db,cfg}=await fixture();await deliver(db,cfg,payload(cfg,1));db.sql.exec(mutation);
    const before=JSON.stringify(order(db));const r=await deliver(db,cfg,payload(cfg,2,{status:'cancelled'}));
    assert.equal(r.status,409);assert.equal(r.data.outcome,expected);assert.equal(r.data.saved,false);assert.equal(JSON.stringify(order(db)),before);
  }
});
test('a 48-hour duplicate is held for review, including Jordanian and Arabic-digit equivalents; other stores remain separate',async()=>{
  for(const phone of ['+962 790-000-001','٠٧٩٠٠٠٠٠٠١','00962790000001','790000001']){
    const {db,cfg}=await fixture();
    db.sql.prepare(`INSERT INTO orders(order_code,recipient_name,phone,created_by,store_id) VALUES(4444,'Manual',?,1,1)`).run(phone);
    const r=await deliver(db,cfg,payload(cfg));assert.equal(r.status,409,phone);assert.equal(r.data.outcome,'duplicate_phone');
    assert.equal(db.sql.prepare('SELECT count(*) n FROM orders').get().n,1);
  }
  const {db,cfg}=await fixture();db.sql.exec("INSERT INTO orders(order_code,recipient_name,phone,created_by,store_id) VALUES(4444,'Manual','0790000001',1,2)");
  assert.equal((await deliver(db,cfg,payload(cfg))).status,200);assert.equal(db.sql.prepare('SELECT count(*) n FROM orders').get().n,2);
});
test('invalid signatures, installation, currency and fields never write orders; same event with different data conflicts',async()=>{
  const {db,cfg}=await fixture();assert.equal((await deliver(db,cfg,payload(cfg),{signed:false})).status,401);
  const wrong=payload(cfg);wrong.installation_id=crypto.randomUUID();assert.equal((await deliver(db,cfg,wrong)).status,422);
  for(const changes of [{currency:'USD'},{contact_phone:'رقمي الواتس'},{packs:0},{total_jod:-10},{status:'shipped'}])assert.equal((await deliver(db,cfg,payload(cfg,1,changes))).status,422);
  assert.equal(db.sql.prepare('SELECT count(*) n FROM orders').get().n,0);
  await deliver(db,cfg,payload(cfg));assert.equal((await deliver(db,cfg,payload(cfg,1,{total_jod:6}))).data.error,'event_conflict');assert.equal(order(db).amount,10);
});
test('database failure rolls the entire import back; retry can subsequently save it',async()=>{
  const {db,cfg}=await fixture();db.failBatchAt=7;
  assert.equal((await deliver(db,cfg,payload(cfg))).status,503);
  for(const table of ['orders','cepoxy_links','cepoxy_inbox'])assert.equal(db.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  db.failBatchAt=-1;assert.equal((await deliver(db,cfg,payload(cfg))).status,200);assert.equal(order(db).amount,10);
});
test('pause and disabled store or actor prevent acceptance',async()=>{
  for(const mutation of ['UPDATE cepoxy_config SET enabled=0','UPDATE stores SET is_active=0 WHERE id=1','UPDATE users SET is_active=0 WHERE id=1',"UPDATE users SET role='staff' WHERE id=1"]){
    const {db,cfg}=await fixture();db.sql.exec(mutation);assert.equal((await deliver(db,cfg,payload(cfg))).status,503);assert.equal(order(db),undefined);
  }
});
test('management requires admin; setup is idempotent, read status never exposes the signing key and only signed probes verify',async()=>{
  const {db,cfg}=await fixture();assert.equal((await management(db,null,'staff-token')).status,401);assert.equal((await management(db,null,'bad')).status,401);
  const a=await management(db,{action:'setup'}),b=await management(db,{action:'setup'});assert.equal(a.status,200);assert.equal(a.data.sql,b.data.sql);
  let status=await management(db);assert.equal(status.data.verified,false);assert.ok(!JSON.stringify(status).includes(cfg.signing_key));
  const p=payload(cfg);p.kind='probe';delete p.order;
  assert.equal((await deliver(db,cfg,p,{signed:false})).status,401);assert.equal((await management(db)).data.verified,false);
  assert.equal((await deliver(db,cfg,p)).status,200);assert.equal((await management(db)).data.verified,true);assert.equal(order(db),undefined);
});
test('admin retry rechecks current state without overriding a manual change',async()=>{
  const {db,cfg}=await fixture();await deliver(db,cfg,payload(cfg));db.sql.exec("UPDATE orders SET recipient_name='تغيير' WHERE id=1");
  await deliver(db,cfg,payload(cfg,2,{total_jod:8,packs:2}));assert.equal((await management(db,{action:'retry',event_id:2})).status,409);assert.equal(order(db).amount,10);
  db.sql.exec("UPDATE orders SET recipient_name='عميل تجريبي' WHERE id=1");
  assert.equal((await management(db,{action:'retry',event_id:2})).status,200);assert.equal(order(db).amount,8);
});
test('SQL generation accepts only generated installation credentials',async()=>{
  const {cfg}=await fixture();assert.ok(sourceSql(cfg).includes('corvex_export.on_order_saved'));
  assert.throws(()=>sourceSql({...cfg,signing_key:"'; DROP TABLE orders;--"}));
  assert.throws(()=>validatePayload({...payload(cfg),event_id:'9007199254740993'},cfg));
});
test('ordinary unprinted and print routes exclude and reject a canceled import',async()=>{
  const {db,cfg}=await fixture();
  await deliver(db,cfg,payload(cfg,1));await deliver(db,cfg,payload(cfg,2,{status:'cancelled'}));
  const get=await core({env:{DB:db},params:{path:['unprinted']},request:new Request('https://corvex-sport.pages.dev/api/unprinted?store_id=1',{headers:{Authorization:'Bearer admin-token'}})});
  assert.equal(get.status,200);assert.deepEqual((await get.json()).orders,[]);
  const print=await core({env:{DB:db},params:{path:['print-batches']},request:new Request('https://corvex-sport.pages.dev/api/print-batches',{method:'POST',headers:{Authorization:'Bearer admin-token','content-type':'application/json'},body:JSON.stringify({order_ids:[order(db).id]})})});
  assert.equal(print.status,409);assert.equal(db.sql.prepare('SELECT count(*) n FROM print_batches').get().n,0);
});
