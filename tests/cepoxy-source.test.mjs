// Real PostgreSQL engine and pgcrypto. pg_net transport and cron scheduling are
// mocked because these background-worker extensions are not available in WASM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {sourceSql} from '../functions/api/_cepoxy-source-sql.js';
const require=createRequire(import.meta.url);
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const cfg={installation_id:'11111111-1111-4111-8111-111111111111',signing_key:'a'.repeat(64)};
function sql(c=cfg){return sourceSql(c).replace(/^CREATE EXTENSION IF NOT EXISTS pg_(net|cron) WITH SCHEMA \w+;\n/gm,'')}
async function fixture(){
  const db=new PGlite({extensions:{pgcrypto}});
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE public.orders(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_no text,
      status text DEFAULT 'confirmed',packs int DEFAULT 3,total_jod numeric DEFAULT 10,
      name text DEFAULT 'عميل اختبار',contact_phone text DEFAULT '962790000001',city text DEFAULT 'عمان',
      address text DEFAULT 'تجربة لا تشحن',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE FUNCTION public._order_json(o public.orders) RETURNS jsonb LANGUAGE sql AS
      $$ SELECT (to_jsonb(o)-'id'-'order_no')||jsonb_build_object('order_id',o.order_no,'currency','JOD') $$;
    CREATE FUNCTION public.orders_create(jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
    INSERT INTO public.orders(order_no,created_at) VALUES('SE-OLD',now()-interval '1 day');
    CREATE SCHEMA net;CREATE TABLE net.control(fail boolean);INSERT INTO net.control VALUES(false);
    CREATE TABLE net.http_request_queue(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,headers jsonb);
    CREATE TABLE net._http_response(id bigint PRIMARY KEY,status_code int,content text);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds int DEFAULT 2000)
    RETURNS bigint LANGUAGE plpgsql AS $$DECLARE rid bigint;BEGIN
      IF (SELECT fail FROM net.control) THEN RAISE EXCEPTION 'network unavailable'; END IF;
      INSERT INTO net.http_request_queue(url,body,headers) VALUES(url,body,headers) RETURNING id INTO rid;RETURN rid;END$$;
    CREATE SCHEMA cron;CREATE TABLE cron.jobs(name text PRIMARY KEY,schedule text,command text);
    CREATE FUNCTION cron.schedule(job_name text,job_schedule text,job_command text) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN
      INSERT INTO cron.jobs VALUES(job_name,job_schedule,job_command) ON CONFLICT(name) DO UPDATE SET schedule=excluded.schedule,command=excluded.command;RETURN 1;END$$;`);
  try{await db.exec(sql())}catch(error){await db.close();throw error}
  return db;
}
const one=async(db,query)=> (await db.query(query)).rows[0];
test('installation executes on PostgreSQL, remains private, and pgcrypto signatures match the receiver',async()=>{
  const db=await fixture();
  const request=await one(db,'SELECT * FROM net.http_request_queue');
  assert.equal(request.body.signature,createHmac('sha256',cfg.signing_key).update(request.body.payload).digest('hex'));
  assert.ok(!JSON.stringify(request.headers).includes(cfg.signing_key));assert.equal(JSON.parse(request.body.payload).kind,'probe');
  const before=await one(db,'SELECT starts_at FROM corvex_export.config');await db.exec(sql());
  assert.deepEqual(await one(db,'SELECT starts_at FROM corvex_export.config'),before);
  assert.equal((await one(db,'SELECT count(*)::int AS n FROM cron.jobs')).n,1);
  await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM corvex_export.config'),/permission denied/);await db.exec('RESET ROLE');
  await assert.rejects(db.exec(sql({...cfg,signing_key:'b'.repeat(64)})),/different credentials/);await db.exec('ROLLBACK');
  assert.equal((await one(db,'SELECT signing_key FROM corvex_export.config')).signing_key,cfg.signing_key);
  await db.close();
});
test('trigger handles NULL-to-SE numbering, changes and cancellation without backfilling old or unchanged orders',async()=>{
  const db=await fixture();
  await db.exec("UPDATE public.orders SET order_no='SE-1001',address='تغيير طلب قديم' WHERE id=1;INSERT INTO public.orders DEFAULT VALUES;");
  assert.equal((await one(db,"SELECT count(*)::int AS n FROM corvex_export.outbox WHERE source_id IS NOT NULL")).n,0);
  await db.exec("UPDATE public.orders SET order_no='SE-1002' WHERE id=2");
  let row=await one(db,"SELECT * FROM corvex_export.outbox WHERE source_id='SE-1002'");
  assert.equal(row.state,'inflight');assert.equal(JSON.parse(row.payload).order.packs,3);
  await db.exec("UPDATE public.orders SET updated_at=now() WHERE id=2;UPDATE public.orders SET packs=2,total_jod=8 WHERE id=2;UPDATE public.orders SET status='cancelled' WHERE id=2");
  const events=(await db.query("SELECT payload FROM corvex_export.outbox WHERE source_id='SE-1002' ORDER BY id")).rows.map(r=>JSON.parse(r.payload));
  assert.equal(events.length,3);assert.equal(events[1].order.total_jod,8);assert.equal(events[2].order.status,'cancelled');
  await db.exec('BEGIN;INSERT INTO public.orders(order_no) VALUES(\'SE-ROLLBACK\');ROLLBACK;');
  assert.equal((await one(db,"SELECT count(*)::int AS n FROM corvex_export.outbox WHERE source_id='SE-ROLLBACK'")).n,0);
  await db.close();
});
test('outbox handles acknowledged delivery, transient errors, lost responses and review-required responses',async()=>{
  const db=await fixture();
  await db.exec(`INSERT INTO net._http_response SELECT request_id,200,json_build_object('ok',true,'terminal',true,'event_id',id::text)::text FROM corvex_export.outbox;SELECT corvex_export.tick();`);
  assert.equal((await one(db,'SELECT state FROM corvex_export.outbox ORDER BY id LIMIT 1')).state,'delivered');
  await db.exec("INSERT INTO public.orders(order_no) VALUES('SE-2000');INSERT INTO net._http_response SELECT request_id,503,'{}' FROM corvex_export.outbox WHERE source_id='SE-2000';SELECT corvex_export.tick();");
  assert.equal((await one(db,"SELECT state FROM corvex_export.outbox WHERE source_id='SE-2000'")).state,'pending');
  await db.exec("UPDATE corvex_export.outbox SET next_attempt_at=now() WHERE source_id='SE-2000';SELECT corvex_export.tick();");
  let r=await one(db,"SELECT * FROM corvex_export.outbox WHERE source_id='SE-2000'");assert.equal(r.state,'inflight');assert.equal(r.attempts,2);
  await db.exec("UPDATE corvex_export.outbox SET sent_at=now()-interval '3 minutes' WHERE source_id='SE-2000';SELECT corvex_export.tick();");
  r=await one(db,"SELECT * FROM corvex_export.outbox WHERE source_id='SE-2000'");assert.equal(r.attempts,3);assert.equal(r.state,'inflight');
  await db.exec("INSERT INTO net._http_response SELECT request_id,409,'{\"ok\":false,\"error\":\"review_required\"}' FROM corvex_export.outbox WHERE source_id='SE-2000';SELECT corvex_export.tick();");
  assert.equal((await one(db,"SELECT state FROM corvex_export.outbox WHERE source_id='SE-2000'")).state,'blocked');
  await db.close();
});
test('transport queue failure does not lose the saved source order or its pending export',async()=>{
  const db=await fixture();await db.exec("UPDATE net.control SET fail=true;INSERT INTO public.orders(order_no) VALUES('SE-3000');");
  const row=await one(db,"SELECT * FROM corvex_export.outbox WHERE source_id='SE-3000'");assert.equal(row.state,'pending');assert.equal(row.attempts,1);
  assert.equal((await one(db,"SELECT count(*)::int AS n FROM public.orders WHERE order_no='SE-3000'")).n,1);
  await db.exec("UPDATE net.control SET fail=false;UPDATE corvex_export.outbox SET next_attempt_at=now() WHERE source_id='SE-3000';SELECT corvex_export.tick();");
  assert.equal((await one(db,"SELECT state FROM corvex_export.outbox WHERE source_id='SE-3000'")).state,'inflight');await db.close();
});
