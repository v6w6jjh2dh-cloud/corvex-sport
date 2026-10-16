# C-Epoxy WhatsApp → Corvex

The new integration imports **new, confirmed** source orders into ordinary Corvex
orders for the exact active store name `سي ايبوكسي`. Deployment alone does not
enable imports. No bot prompt, Kapso function, historical source order, or existing
store credential is changed.

## Activate

1. Sign into Corvex as administrator, then open `/cepoxy-connect.html` in the same browser.
2. Download the generated SQL with **تجهيز وتحميل ملف الربط**. The download contains
   a private installation key; do not commit or share it.
3. Run the download in the **sea-epoxy-agent** Supabase SQL Editor linked on the page
   (`pvskozqwjiqtlmybckad`). It installs a private outbox, an order-save trigger,
   pg_net/pgcrypto/pg_cron if needed, and one retry job. Existing installation
   credentials are preserved on rerun; a mismatch aborts the transaction.
4. Refresh the Corvex page. Only a valid signed source probe verifies connectivity.
5. Create a clearly marked new test order through the existing WhatsApp flow,
   check its name/phone/address/quantity/total in the ordinary store orders, then
   cancel it before printing. Check that the cancellation appears in Corvex and
   the order is absent from the unprinted queue. This live check is required
   before treating the integration as verified end to end.

There is no historical backfill, including old test order SE-1032. Orders created
before installation remain outside the integration, even if edited afterward.
The existing WhatsApp confirmation confirms a source order; it is not a Corvex
delivery receipt. The integration page shows actual destination save/review state.

## Behavior

- Each source event has an installation-scoped HMAC-SHA256 signature and monotonic
  event ID. Source order numbers are stored in the mapping, notes, and raw text.
- Import decisions, order writes, and mapping updates execute in one D1 batch
  transaction. Replays do not insert another order or overwrite later updates.
- A cancellation arriving before creation stores a tombstone instead of a
  shippable order. Canceled imports cannot be added to a print batch using a stale
  print selection. The unprinted queue and dashboard exclude canceled orders.
- The source queue is durable even though pg_net's request queue is unlogged.
  A minute-based job processes acknowledgments and retries transport failures,
  with backoff capped at one hour. Lost responses are retried after two minutes.
- Name, contact phone, city, address, quantity (in notes), and total are transferred.
  The source amount already includes delivery; the integration adds no shipping
  charge. Jordanian telephone formatting follows the existing Corvex convention.
- Printing/reservations, settlement, inventory tracking, manual changes, deletion,
  another store, or a phone already entered in this store in the last 48 hours
  require review. These guards never silently overwrite another workflow.
- Reviews appear before successful entries on the integration page. **إعادة فحص
  النقل** rechecks the guards; it does not override them. Handle dispatched
  cancellations and duplicate/manual conflicts in the normal Corvex workflow.
- HTTP 400/401/409/413/422 blocks that source event for investigation. A newer event
  may still be processed. Delivered source audit entries are retained 30 days.
- Pausing in Corvex returns a retryable response. Source orders remain queued.
  Deactivating the configured store or administrator also pauses acceptance.

## Source diagnostics (administrator SQL Editor only)

```sql
SELECT state, count(*) FROM corvex_export.outbox GROUP BY state;
SELECT id, source_id, state, attempts, last_error, created_at
FROM corvex_export.outbox
WHERE state <> 'delivered'
ORDER BY id;
SELECT jobname, schedule, active FROM cron.job
WHERE jobname = 'cepoxy-corvex-export';
```

After resolving one blocked event, explicitly retry **that event ID** by updating
its state to `pending`, setting `next_attempt_at=now()`, then calling
`corvex_export.dispatch(id)`. This also obtains a new acknowledgment if the
destination administrator already saved it via the review page. Replaying a saved
event is idempotent. Do not reset event sequences or delete mapping tombstones.

To disable source exports without deleting audit records:

```sql
UPDATE corvex_export.config SET enabled=false WHERE id=1;
```

The trigger will still retain events for later retry. Remove the trigger only
when intentionally ending capture; otherwise new orders would stop being queued.

## Validation

Receiver and ordinary queue/print regression tests need Node 24:

```sh
node --test tests/cepoxy.test.mjs
```

PostgreSQL trigger/outbox tests use PGlite and its real pgcrypto extension:

```sh
npm install --prefix /tmp/corvex-test-deps --no-audit --no-fund @electric-sql/pglite
NODE_PATH=/tmp/corvex-test-deps/node_modules node --test --test-force-exit tests/cepoxy-source.test.mjs
```

The source tests mock only the pg_net network transport and cron scheduling;
PL/pgSQL, transactions, triggers, RLS permissions, retry decisions and signatures
execute in PostgreSQL. They do not claim to validate live Supabase extension
installation, cron execution, or Cloudflare reachability. Those are checked by
the signed source probe and the new live WhatsApp test order.

Primary platform references:

- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://supabase.com/docs/guides/cron/quickstart
