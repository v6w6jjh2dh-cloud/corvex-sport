import {SOURCE_PROJECT,RECEIVER_URL} from './_cepoxy.js';
export function sourceSql(cfg) {
  if(!/^[0-9a-f-]{36}$/.test(cfg.installation_id)||!/^[0-9a-f]{64}$/.test(cfg.signing_key))throw new Error('invalid_config');
  return `-- سي ايبوكسي -> Corvex. Run once in the sea-epoxy-agent SQL Editor:
-- https://supabase.com/dashboard/project/${SOURCE_PROJECT}/sql/new
-- Contains a private integration key. Do not share this downloaded file.
-- Only NEW orders saved after installation are exported. No historical backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $check$
BEGIN
 IF to_regclass('public.orders') IS NULL OR to_regprocedure('public._order_json(public.orders)') IS NULL
   OR to_regprocedure('public.orders_create(jsonb)') IS NULL THEN
   RAISE EXCEPTION 'Wrong database: open the sea-epoxy-agent project (${SOURCE_PROJECT}).';
 END IF;
END $check$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $check$ BEGIN
 IF to_regprocedure('extensions.hmac(text,text,text)') IS NULL THEN
   RAISE EXCEPTION 'pgcrypto must provide extensions.hmac(text,text,text). Installation rolled back.';
 END IF;
END $check$;

CREATE SCHEMA IF NOT EXISTS corvex_export;
REVOKE ALL ON SCHEMA corvex_export FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS corvex_export.config (
 id integer PRIMARY KEY CHECK(id=1), installation_id text NOT NULL, signing_key text NOT NULL,
 starts_at timestamptz NOT NULL DEFAULT clock_timestamp(), enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS corvex_export.outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source_id text, payload text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','inflight','delivered','blocked')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 request_id bigint, sent_at timestamptz, delivered_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON corvex_export.outbox(state,next_attempt_at,id);
ALTER TABLE corvex_export.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE corvex_export.outbox ENABLE ROW LEVEL SECURITY;
INSERT INTO corvex_export.config(id,installation_id,signing_key)
 VALUES(1,'${cfg.installation_id}','${cfg.signing_key}') ON CONFLICT(id) DO NOTHING;
DO $check$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM corvex_export.config WHERE id=1
   AND installation_id='${cfg.installation_id}' AND signing_key='${cfg.signing_key}') THEN
   RAISE EXCEPTION 'An existing Corvex installation has different credentials. Nothing was replaced.';
 END IF;
END $check$;

CREATE OR REPLACE FUNCTION corvex_export.enqueue(kind text, order_data jsonb DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE eid bigint; cfg corvex_export.config;
BEGIN
 SELECT * INTO STRICT cfg FROM corvex_export.config WHERE id=1;
 INSERT INTO corvex_export.outbox(source_id) VALUES(order_data->>'order_id') RETURNING id INTO eid;
 UPDATE corvex_export.outbox SET payload=jsonb_build_object(
   'version',1,'installation_id',cfg.installation_id,'project_ref','${SOURCE_PROJECT}',
   'event_id',eid::text,'kind',kind,'order',order_data)::text WHERE id=eid;
 RETURN eid;
END $fn$;

CREATE OR REPLACE FUNCTION corvex_export.dispatch(eid bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE row_data corvex_export.outbox; cfg corvex_export.config; rid bigint; sig text;
BEGIN
 SELECT * INTO cfg FROM corvex_export.config WHERE id=1 AND enabled;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO row_data FROM corvex_export.outbox WHERE id=eid AND state='pending'
   AND next_attempt_at<=now() FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR row_data.payload IS NULL THEN RETURN; END IF;
 -- Sign the exact stored UTF-8 string. The secret never enters pg_net's request queue.
 sig:=encode(extensions.hmac(row_data.payload,cfg.signing_key,'sha256'),'hex');
 BEGIN
   rid:=net.http_post(url:='${RECEIVER_URL}',
     body:=jsonb_build_object('payload',row_data.payload,'signature',sig),
     headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000);
   UPDATE corvex_export.outbox SET state='inflight',request_id=rid,sent_at=now(),
     attempts=attempts+1,last_error=NULL WHERE id=eid;
 EXCEPTION WHEN OTHERS THEN
   UPDATE corvex_export.outbox SET attempts=attempts+1,next_attempt_at=now()+interval '1 minute',
     last_error='dispatch_'||SQLSTATE WHERE id=eid;
 END;
END $fn$;

CREATE OR REPLACE FUNCTION corvex_export.tick()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE row_data corvex_export.outbox; response_data record; ack jsonb;
BEGIN
 IF NOT pg_try_advisory_xact_lock(20261016,1032) THEN RETURN; END IF;
 FOR row_data IN SELECT * FROM corvex_export.outbox
   WHERE state='inflight' ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
   SELECT * INTO response_data FROM net._http_response WHERE id=row_data.request_id;
   IF FOUND THEN
     ack:=NULL;
     BEGIN ack:=response_data.content::jsonb; EXCEPTION WHEN OTHERS THEN ack:=NULL; END;
     IF response_data.status_code BETWEEN 200 AND 299 AND ack->'ok'='true'::jsonb
       AND ack->'terminal'='true'::jsonb AND ack->>'event_id'=row_data.id::text THEN
       UPDATE corvex_export.outbox SET state='delivered',delivered_at=now(),last_error=NULL WHERE id=row_data.id;
     ELSIF response_data.status_code IN (400,401,409,413,422) THEN
       UPDATE corvex_export.outbox SET state='blocked',last_error='http_'||response_data.status_code WHERE id=row_data.id;
     ELSE
       UPDATE corvex_export.outbox SET state='pending',request_id=NULL,
         next_attempt_at=now()+make_interval(secs=>least(3600,15*power(2,least(attempts,8)))::integer),
         last_error='http_'||coalesce(response_data.status_code::text,'timeout') WHERE id=row_data.id;
     END IF;
   ELSIF row_data.sent_at<now()-interval '2 minutes' THEN
     -- pg_net tables are unlogged; durable outbox retries after a crash or lost response.
     UPDATE corvex_export.outbox SET state='pending',request_id=NULL,next_attempt_at=now(),last_error='response_missing'
       WHERE id=row_data.id;
   END IF;
 END LOOP;
 FOR row_data IN SELECT * FROM corvex_export.outbox WHERE state='pending' AND next_attempt_at<=now()
   ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
   PERFORM corvex_export.dispatch(row_data.id);
 END LOOP;
 DELETE FROM corvex_export.outbox WHERE state='delivered' AND delivered_at<now()-interval '30 days';
END $fn$;

CREATE OR REPLACE FUNCTION corvex_export.on_order_saved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE eid bigint; started timestamptz;
BEGIN
 SELECT starts_at INTO started FROM corvex_export.config WHERE id=1;
 -- orders_create first INSERTs with a NULL number, then UPDATEs it to SE-xxxx.
 IF NEW.order_no IS NULL OR NEW.order_no !~ '^SE-[1-9][0-9]*$'
   OR NEW.status NOT IN ('confirmed','cancelled') OR NEW.created_at<started THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   IF (NEW.order_no,NEW.status,NEW.packs,NEW.total_jod,NEW.name,NEW.contact_phone,NEW.city,NEW.address)
     IS NOT DISTINCT FROM
      (OLD.order_no,OLD.status,OLD.packs,OLD.total_jod,OLD.name,OLD.contact_phone,OLD.city,OLD.address) THEN RETURN NEW; END IF;
 END IF;
 eid:=corvex_export.enqueue('order',public._order_json(NEW));
 PERFORM corvex_export.dispatch(eid);
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS corvex_export_order_saved ON public.orders;
CREATE TRIGGER corvex_export_order_saved AFTER INSERT OR UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION corvex_export.on_order_saved();

REVOKE ALL ON ALL TABLES IN SCHEMA corvex_export FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA corvex_export FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA corvex_export FROM PUBLIC,anon,authenticated,service_role;
-- A single named cron job is replaced safely on rerun; no extra scheduled jobs.
SELECT cron.schedule('cepoxy-corvex-export','* * * * *','SELECT corvex_export.tick();');
SELECT corvex_export.dispatch(corvex_export.enqueue('probe'));
COMMIT;
SELECT 'CORVEX_EXPORT_INSTALLED' AS result,
 '${SOURCE_PROJECT}' AS source_project,
 'سي ايبوكسي' AS destination_store,
 'ارجع لصفحة الربط في كورفكس واضغط تحديث الحالة' AS next_step;
`;
}
