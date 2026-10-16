// Store-scoped, signed C-Epoxy import. No customer-facing or browser session secrets.
export const STORE_NAME = 'سي ايبوكسي';
export const SOURCE_PROJECT = 'pvskozqwjiqtlmybckad';
export const RECEIVER_URL = 'https://corvex-sport.pages.dev/api/cepoxy-hook';
export const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
export const dbSession = db => db.withSession ? db.withSession('first-primary') : db;
export async function admin(request, db) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return null;
  return db.prepare(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'`).bind(token).first();
}
export async function ensureSchema(db) {
  // Only called after an administrator authenticates. Additive, idempotent migration.
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS cepoxy_config (
      id INTEGER PRIMARY KEY CHECK(id=1), store_id INTEGER NOT NULL, actor_id INTEGER NOT NULL,
      installation_id TEXT NOT NULL, signing_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen_at TEXT, probe_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cepoxy_links (
      source_id TEXT PRIMARY KEY, order_id INTEGER UNIQUE, last_event_id INTEGER NOT NULL DEFAULT 0,
      source_status TEXT NOT NULL DEFAULT '', snapshot TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cepoxy_inbox (
      event_id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
      payload TEXT NOT NULL, decision TEXT NOT NULL DEFAULT 'queued', attempt_id TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cepoxy_inbox_source ON cepoxy_inbox(source_id,event_id)'),
    // A stale print selection must not ship an order canceled by this integration.
    // Once a print-batch reservation exists, imports require manual review instead.
    db.prepare(`CREATE TRIGGER IF NOT EXISTS cepoxy_guard_print BEFORE INSERT ON print_batch_orders
      WHEN EXISTS(SELECT 1 FROM cepoxy_links l JOIN orders o ON o.id=l.order_id
        WHERE o.id=NEW.order_id AND o.delivery_status='canceled_before_arrival')
      BEGIN SELECT RAISE(ABORT,'الطلب ملغي من الواتساب؛ حدّث قائمة الطباعة'); END`)
  ]);
}
export async function config(db) {
  return db.prepare(`SELECT c.*,s.name AS store_name,s.is_active AS store_active,
    u.is_active AS actor_active,u.role AS actor_role FROM cepoxy_config c
    JOIN stores s ON s.id=c.store_id JOIN users u ON u.id=c.actor_id WHERE c.id=1`).first();
}
export function hex(bytes) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join(''); }
export function normalizePhone(value) {
  const raw=String(value||'').trim().replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  let d=raw.replace(/\D/g,'');
  if(d.startsWith('00962'))d=d.slice(2);
  if(d.startsWith('962')&&d.length>=12)d='0'+d.slice(3);
  else if(d.length===9&&d.startsWith('7'))d='0'+d;
  else if(raw.startsWith('+'))d='+'+d;
  else if(raw.startsWith('00'))d='+'+d.slice(2);
  return d;
}
function normalizedPhoneSql(expr) {
  let sql=expr;
  for(const ch of [' ','+','-','(',')','.','/']) sql=`replace(${sql},'${ch}','')`;
  for(const alphabet of ['٠١٢٣٤٥٦٧٨٩','۰۱۲۳۴۵۶۷۸۹']) for(let i=0;i<10;i++) sql=`replace(${sql},'${alphabet[i]}','${i}')`;
  return sql;
}
function invalid() { throw new Error('invalid_payload'); }
export function validatePayload(p, cfg) {
  if(!p || p.version!==1 || p.installation_id!==cfg.installation_id || p.project_ref!==SOURCE_PROJECT) invalid();
  if(typeof p.event_id!=='string' || !/^[1-9]\d{0,14}$/.test(p.event_id)) invalid();
  if(p.kind==='probe') return p;
  const o=p.order;
  if(p.kind!=='order' || !o || !/^SE-[1-9]\d{0,14}$/.test(o.order_id||'')) invalid();
  if(!['confirmed','cancelled'].includes(o.status) || o.currency!=='JOD') invalid();
  if(!Number.isInteger(o.packs) || o.packs<1 || o.packs>60 || !Number.isFinite(o.total_jod) || o.total_jod<=0 || o.total_jod>10000) invalid();
  for(const [k,max] of [['name',100],['contact_phone',30],['city',80],['address',400]]) {
    if(typeof o[k]!=='string' || o[k].trim().length<2 || o[k].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(o[k])) invalid();
  }
  if(!/^\+?\d{7,15}$/.test(normalizePhone(o.contact_phone))) invalid();
  if(!Number.isFinite(Date.parse(o.created_at)) || !Number.isFinite(Date.parse(o.updated_at))) invalid();
  return p;
}
export async function verifyEnvelope(body, cfg) {
  if(!body || typeof body.payload!=='string' || body.payload.length>16000 || !/^[a-f0-9]{64}$/.test(body.signature||'')) return null;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(cfg.signing_key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(body.signature.match(/../g),b=>parseInt(b,16));
  if(!await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(body.payload)))return null;
  return body.payload;
}
const SNAPSHOT = `json_object('name',o.recipient_name,'phone',o.phone,'area',o.area,
  'address',o.detailed_address,'amount',o.amount,'notes',o.order_notes,'status',o.delivery_status)`;
export async function applyEvent(db, cfg, p, payloadText) {
  const eventId=Number(p.event_id);
  if(p.kind==='probe') {
    await db.prepare("UPDATE cepoxy_config SET last_seen_at=datetime('now'),probe_at=datetime('now') WHERE id=1").run();
    return {ok:true,terminal:true,verified:true,event_id:p.event_id,outcome:'probe'};
  }
  const o=p.order, sourceId=o.order_id, attempt=crypto.randomUUID();
  const hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payloadText)));
  const phone=normalizePhone(o.contact_phone);
  const notes=`سي ايبوكسي - ${o.packs} عبوات | واتساب ${sourceId}`;
  const raw=`طلب واتساب ${sourceId}\n${o.name}\n${phone}\n${o.city} - ${o.address}\n${o.packs} عبوات / ${o.total_jod} دنانير شامل التوصيل`;
  const active=`EXISTS(SELECT 1 FROM cepoxy_inbox WHERE event_id=? AND attempt_id=? AND decision='apply')`;
  const q=(sql,...values)=>db.prepare(sql).bind(...values);
  const rows=await db.batch([
    q(`INSERT INTO cepoxy_inbox(event_id,source_id,payload_hash,payload) VALUES(?,?,?,?) ON CONFLICT(event_id) DO NOTHING`,eventId,sourceId,hash,payloadText),
    q(`UPDATE cepoxy_inbox SET attempt_id=? WHERE event_id=? AND payload_hash=? AND decision='queued'`,attempt,eventId,hash),
    q(`INSERT INTO cepoxy_links(source_id) SELECT ? WHERE EXISTS(SELECT 1 FROM cepoxy_inbox WHERE event_id=? AND attempt_id=?) ON CONFLICT(source_id) DO NOTHING`,sourceId,eventId,attempt),
    q(`UPDATE cepoxy_inbox SET decision=(SELECT CASE
      WHEN ?<l.last_event_id THEN 'superseded'
      WHEN l.order_id IS NOT NULL AND o.id IS NULL THEN 'local_deleted'
      WHEN l.source_status='cancelled' AND ?='confirmed' THEN 'closed'
      WHEN o.id IS NOT NULL AND o.store_id<>? THEN 'store_changed'
      WHEN o.id IS NOT NULL AND (o.printed<>0 OR o.first_printed_at IS NOT NULL OR o.print_count>0
        OR o.settled_at IS NOT NULL OR o.store_settled<>0 OR o.courier_settled<>0 OR o.delivery_company_settled<>0
        OR EXISTS(SELECT 1 FROM print_batch_orders b WHERE b.order_id=o.id)) THEN 'dispatched'
      WHEN o.id IS NOT NULL AND EXISTS(SELECT 1 FROM inventory_order_tracking t WHERE t.order_id=o.id) THEN 'inventory_review'
      WHEN o.id IS NOT NULL AND (l.snapshot IS NULL OR ${SNAPSHOT}<>l.snapshot) THEN 'manual_change'
      WHEN o.id IS NULL AND ?='confirmed' AND EXISTS(
        SELECT 1 FROM (SELECT ${normalizedPhoneSql('phone')} AS digits FROM orders
          WHERE store_id=? AND created_at>=datetime('now','-48 hours')) recent
        WHERE CASE WHEN digits LIKE '00962%' AND length(digits)>=14 THEN '0'||substr(digits,6)
          WHEN digits LIKE '962%' AND length(digits)>=12 THEN '0'||substr(digits,4)
          WHEN length(digits)=9 AND digits LIKE '7%' THEN '0'||digits
          WHEN digits LIKE '00%' THEN substr(digits,3) ELSE digits END=?
      ) THEN 'duplicate_phone'
      ELSE 'apply' END FROM cepoxy_links l LEFT JOIN orders o ON o.id=l.order_id WHERE l.source_id=?)
      WHERE event_id=? AND attempt_id=? AND decision='queued'`,
      eventId,o.status,cfg.store_id,o.status,cfg.store_id,phone.replace(/^\+/,''),sourceId,eventId,attempt),
    q(`UPDATE cepoxy_links SET order_id=(SELECT COALESCE(MAX(id),0)+1 FROM orders)
      WHERE source_id=? AND order_id IS NULL AND ?='confirmed' AND ${active}`,sourceId,o.status,eventId,attempt),
    q(`INSERT INTO orders(id,order_code,recipient_name,phone,area,detailed_address,amount,order_notes,raw_text,created_by,store_id,courier_id)
      SELECT l.order_id,(SELECT COALESCE(MAX(order_code),4400)+1 FROM orders),?,?,?,?,?,?,?,?,?,
        (SELECT id FROM couriers WHERE name='مندوب' AND is_active=1 ORDER BY id LIMIT 1)
      FROM cepoxy_links l WHERE l.source_id=? AND ?='confirmed' AND ${active}
      AND NOT EXISTS(SELECT 1 FROM orders WHERE id=l.order_id)`,
      o.name.trim(),phone,o.city.trim(),o.address.trim(),o.total_jod,notes,raw,cfg.actor_id,cfg.store_id,sourceId,o.status,eventId,attempt),
    q(`UPDATE orders SET
      recipient_name=CASE WHEN ?='confirmed' THEN ? ELSE recipient_name END,
      phone=CASE WHEN ?='confirmed' THEN ? ELSE phone END,
      area=CASE WHEN ?='confirmed' THEN ? ELSE area END,
      detailed_address=CASE WHEN ?='confirmed' THEN ? ELSE detailed_address END,
      amount=CASE WHEN ?='confirmed' THEN ? ELSE amount END,
      order_notes=CASE WHEN ?='confirmed' THEN ? ELSE order_notes END,
      raw_text=CASE WHEN ?='confirmed' THEN ? ELSE raw_text END,
      delivery_status=CASE WHEN ?='cancelled' THEN 'canceled_before_arrival' ELSE delivery_status END,
      updated_at=datetime('now') WHERE id=(SELECT order_id FROM cepoxy_links WHERE source_id=?) AND ${active}`,
      o.status,o.name.trim(),o.status,phone,o.status,o.city.trim(),o.status,o.address.trim(),o.status,o.total_jod,
      o.status,notes,o.status,raw,o.status,sourceId,eventId,attempt),
    q(`UPDATE cepoxy_links SET snapshot=(SELECT ${SNAPSHOT} FROM orders o WHERE o.id=cepoxy_links.order_id)
      WHERE source_id=? AND ${active}`,sourceId,eventId,attempt),
    q(`UPDATE cepoxy_links SET last_event_id=?,source_status=?,updated_at=datetime('now') WHERE source_id=?
      AND EXISTS(SELECT 1 FROM cepoxy_inbox WHERE event_id=? AND attempt_id=? AND decision<>'superseded')`,eventId,o.status,sourceId,eventId,attempt),
    q(`UPDATE cepoxy_inbox SET decided_at=datetime('now') WHERE event_id=? AND attempt_id=?`,eventId,attempt),
    q("UPDATE cepoxy_config SET last_seen_at=datetime('now') WHERE id=1"),
    q(`SELECT i.decision,i.payload_hash,l.order_id,o.order_code FROM cepoxy_inbox i
      LEFT JOIN cepoxy_links l ON l.source_id=i.source_id LEFT JOIN orders o ON o.id=l.order_id WHERE i.event_id=?`,eventId)
  ]);
  const result=rows.at(-1).results[0];
  if(result.payload_hash!==hash) return {ok:false,terminal:false,event_id:p.event_id,error:'event_conflict'};
  const terminal=['apply','superseded'].includes(result.decision);
  return {ok:terminal,terminal,saved:result.decision==='apply',event_id:p.event_id,
    outcome:result.decision,source_order_id:sourceId,order_id:result.order_id,order_code:result.order_code,
    ...(terminal?{}:{error:'review_required'})};
}
