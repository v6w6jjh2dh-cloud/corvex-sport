// Every change of orders.delivery_status is recorded in order_status_history by a database
// trigger, so no code path can change a status silently. Code paths that know who changed it
// and why set orders.status_source / orders.status_by in the same UPDATE (statusSource());
// any other change is still recorded, with source "other".
const ready=new WeakMap();

export const statusSource=(source,ref='')=>`${source}${ref?':'+ref:''}|${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
export const sourceLabel=s=>String(s||'').split('|')[0];

export function ensureStatusHistory(env){
 const key=env.DB;
 if(!ready.has(key))ready.set(key,(async()=>{
  const info=await env.DB.prepare('PRAGMA table_info(orders)').all();
  const cols=new Set((info.results||[]).map(r=>r.name));
  if(!cols.size)return false;
  for(const [name,type] of [['status_source','TEXT'],['status_by','INTEGER']]){
   if(cols.has(name))continue;
   try{await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${type}`).run();cols.add(name)}
   catch(e){if(!/duplicate column/i.test(String(e?.message||e)))throw e;cols.add(name)}
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_status_history(
   id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,order_code INTEGER,
   from_status TEXT,to_status TEXT,source TEXT NOT NULL DEFAULT 'other',changed_by INTEGER,
   cash_before REAL,cash_after REAL,settlement_before INTEGER,settlement_after INTEGER,note TEXT NOT NULL DEFAULT '',
   created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id,id)').run();
  const has=c=>cols.has(c);
  const v=(c,side)=>has(c)?`${side}.${c}`:'NULL';
  const changed="NEW.status_source IS NOT NULL AND NEW.status_source IS NOT OLD.status_source";
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_order_status_history AFTER UPDATE OF delivery_status ON orders
   WHEN COALESCE(OLD.delivery_status,'')<>COALESCE(NEW.delivery_status,'')
   BEGIN
    INSERT INTO order_status_history(order_id,order_code,from_status,to_status,source,changed_by,cash_before,cash_after,settlement_before,settlement_after)
    VALUES(NEW.id,NEW.order_code,OLD.delivery_status,NEW.delivery_status,
     CASE WHEN ${changed} THEN NEW.status_source ELSE 'other' END,
     CASE WHEN ${changed} THEN NEW.status_by ELSE NULL END,
     ${v('cash_collected','OLD')},${v('cash_collected','NEW')},${v('delivery_company_settlement_id','OLD')},${v('delivery_company_settlement_id','NEW')});
   END`).run();
  return true;
 })().catch(e=>{ready.delete(key);throw e}));
 return ready.get(key);
}

// Explicit entry for a change that does not alter the status itself (e.g. a corrected cash
// result with the same status) — the trigger only fires when the status changes.
export const historyEntry=(env,{order,from,to,source,by,cashBefore,cashAfter,settlementBefore,settlementAfter,note=''})=>env.DB.prepare(
 `INSERT INTO order_status_history(order_id,order_code,from_status,to_status,source,changed_by,cash_before,cash_after,settlement_before,settlement_after,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
 .bind(Number(order.id),order.order_code??null,from??null,to??null,source,by??null,cashBefore??null,cashAfter??null,settlementBefore??null,settlementAfter??null,note);
