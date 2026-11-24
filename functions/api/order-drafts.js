// Incomplete manual orders (no product name) saved as drafts — NOT orders: never printed, counted, deducted
// from stock or included in profits. Corvex only. (owner request 2026-11-24)
//  POST {action:'save', payload:{store_id,recipient_name,phone,area,detailed_address,amount,order_notes,raw_text}, reason}
//       any signed-in user; the same draft twice is stored once.
//  GET  → pending drafts (admin)            POST {action:'close', id} → closed (admin; kept, never deleted)
import {json,auth} from './_partial-delivery.js';
import {corvexStore} from './_corvex-store.js';
import {textHash} from './_product-engine.js';

async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_drafts(id INTEGER PRIMARY KEY AUTOINCREMENT,store_id INTEGER NOT NULL,created_by INTEGER,
  payload_json TEXT NOT NULL,payload_hash TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',closed_by INTEGER,closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,payload_hash,status))`).run();
}
const FIELDS=['store_id','recipient_name','phone','area','detailed_address','amount','order_notes','raw_text'];

export async function onRequest({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const store=await corvexStore(env);if(!store)return json({error:'لم يتم العثور على متجر كورفكس'},404);
 await ensure(env);
 if(request.method==='GET'){
  if(me.role!=='admin')return json({error:'للمدير فقط'},403);
  const rows=(await env.DB.prepare(`SELECT d.*,u.display_name creator FROM order_drafts d LEFT JOIN users u ON u.id=d.created_by WHERE d.store_id=? AND d.status='pending' ORDER BY d.id DESC LIMIT 200`).bind(store.id).all()).results||[];
  return json({drafts:rows.map(r=>({id:r.id,reason:r.reason,created_at:r.created_at,creator:r.creator||'',payload:JSON.parse(r.payload_json||'{}')}))});
 }
 if(request.method!=='POST')return json({error:'طريقة غير مدعومة'},405);
 const b=await request.json().catch(()=>({}));
 if(b.action==='save'){
  const p=Object.fromEntries(FIELDS.map(k=>[k,String(b.payload?.[k]??'').slice(0,k==='raw_text'?8000:4000)]));
  if(Number(p.store_id)!==Number(store.id))return json({error:'المسودات لمتجر كورفكس فقط'},400);
  if(!(p.order_notes+p.raw_text+p.phone).trim())return json({error:'المسودة فارغة'},400);
  const payload=JSON.stringify(p),hash=textHash(payload);
  await env.DB.prepare("INSERT OR IGNORE INTO order_drafts(store_id,created_by,payload_json,payload_hash,reason) VALUES(?,?,?,?,?)").bind(store.id,me.id,payload,hash,String(b.reason||'missing_product').slice(0,60)).run();
  const row=await env.DB.prepare("SELECT id FROM order_drafts WHERE store_id=? AND payload_hash=? AND status='pending'").bind(store.id,hash).first();
  return json({ok:true,id:row?.id,status:'pending'});
 }
 if(b.action==='close'){
  if(me.role!=='admin')return json({error:'للمدير فقط'},403);
  const r=await env.DB.prepare("UPDATE order_drafts SET status='closed',closed_by=?,closed_at=datetime('now') WHERE id=? AND store_id=? AND status='pending'").bind(me.id,Number(b.id||0),store.id).run().catch(()=>null);
  return json({ok:!!(r&&r.meta.changes===1)});
 }
 return json({error:'إجراء غير معروف'},400);
}
