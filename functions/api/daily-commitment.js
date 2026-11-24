// «الالتزام اليومي» — fixed monthly expenses of the Corvex store only (salaries, rent,
// electricity, internet, custom items). Every change is a new version with an effective date,
// so the commitment of past days never changes; a past effective date needs an explicit
// retroactive confirmation. Daily commitment = monthly total ÷ 30, once per calendar day.
// Other stores: nothing is stored, read or deducted for them.
import {json,round2} from './_partial-delivery.js';

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ITEMS=[['salaries','المرتبات الشهرية'],['rent','الإيجار الشهري'],['electricity','الكهرباء الشهرية'],['internet','الإنترنت الشهري']];
const todayAmman=()=>new Date(Date.now()+3*3600e3).toISOString().slice(0,10);

async function me(request,env){
 const h=request.headers.get('authorization')||'',t=h.startsWith('Bearer ')?h.slice(7):'';
 if(!t)return null;
 return env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(t).first();
}
async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_commitment_items(id INTEGER PRIMARY KEY AUTOINCREMENT,store_id INTEGER NOT NULL,kind TEXT NOT NULL DEFAULT 'custom',
  name TEXT NOT NULL,sort INTEGER NOT NULL DEFAULT 0,created_by INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(store_id,kind,name))`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_commitment_versions(id INTEGER PRIMARY KEY AUTOINCREMENT,item_id INTEGER NOT NULL,monthly_amount REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,effective_from TEXT NOT NULL,retroactive INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',created_by INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_dcv_item_date ON daily_commitment_versions(item_id,effective_from,id)').run();
}
// The Corvex store (by name). Commitments exist for this store only.
async function corvexStore(env){
 const rows=(await env.DB.prepare('SELECT id,name FROM stores ORDER BY id').all()).results||[];
 return rows.find(s=>/corvex|كورفكس/i.test(String(s.name||'')))||null;
}
async function seed(env,store,userId){
 const n=Number((await env.DB.prepare('SELECT COUNT(*) n FROM daily_commitment_items WHERE store_id=?').bind(store.id).first())?.n||0);
 if(n)return;
 await env.DB.batch(DEFAULT_ITEMS.map(([kind,name],i)=>env.DB.prepare('INSERT OR IGNORE INTO daily_commitment_items(store_id,kind,name,sort,created_by) VALUES(?,?,?,?,?)').bind(store.id,kind,name,i+1,userId||null)));
}
// Commitment in force on a given day (latest version with effective_from <= day).
async function commitmentFor(env,storeId,date){
 const items=(await env.DB.prepare(`SELECT i.id,i.kind,i.name,i.sort,
   (SELECT v.monthly_amount FROM daily_commitment_versions v WHERE v.item_id=i.id AND v.effective_from<=? ORDER BY v.effective_from DESC,v.id DESC LIMIT 1) monthly,
   (SELECT v.active FROM daily_commitment_versions v WHERE v.item_id=i.id AND v.effective_from<=? ORDER BY v.effective_from DESC,v.id DESC LIMIT 1) active,
   (SELECT v.effective_from FROM daily_commitment_versions v WHERE v.item_id=i.id AND v.effective_from<=? ORDER BY v.effective_from DESC,v.id DESC LIMIT 1) effective_from
   FROM daily_commitment_items i WHERE i.store_id=? ORDER BY i.sort,i.id`).bind(date,date,date,storeId).all()).results||[];
 const list=items.map(i=>({id:i.id,kind:i.kind,name:i.name,monthly:i.monthly==null?0:round2(i.monthly),active:i.monthly==null?false:Number(i.active)===1,effective_from:i.effective_from||null}));
 const monthly=round2(list.filter(i=>i.active).reduce((s,i)=>s+i.monthly,0));
 return {items:list,monthly_total:monthly,daily:round2(monthly/30)};
}

export async function onRequestGet({request,env}){
 const user=await me(request,env);if(!user)return json({error:'غير مصرح'},401);
 await ensure(env);
 const store=await corvexStore(env);
 if(!store)return json({error:'لم يتم العثور على متجر كورفكس'},404);
 await seed(env,store,user.id);
 const url=new URL(request.url),date=String(url.searchParams.get('date')||todayAmman()),filter=Number(url.searchParams.get('store_id')||0);
 if(!DAY.test(date))return json({error:'تاريخ غير صالح'},400);
 // the commitment belongs to Corvex: it applies to the Corvex view and the all-stores view only
 const applies=!filter||filter===Number(store.id);
 const c=await commitmentFor(env,store.id,date);
 const out={store:{id:store.id,name:store.name},date,applies,...c,daily:applies?c.daily:0};
 if(url.searchParams.get('manage')==='1'){
  if(user.role!=='admin')return json({error:'للمدير فقط'},403);
  out.today=todayAmman();
  out.versions=(await env.DB.prepare(`SELECT v.id,v.item_id,i.name,v.monthly_amount,v.active,v.effective_from,v.retroactive,v.note,datetime(v.created_at,'+3 hours') at,u.display_name by_name
   FROM daily_commitment_versions v JOIN daily_commitment_items i ON i.id=v.item_id LEFT JOIN users u ON u.id=v.created_by WHERE i.store_id=? ORDER BY v.id DESC LIMIT 200`).bind(store.id).all()).results||[];
  // upcoming (future-dated) values too, so the page shows what is scheduled
  out.scheduled=(await env.DB.prepare(`SELECT v.item_id,v.monthly_amount,v.active,v.effective_from FROM daily_commitment_versions v JOIN daily_commitment_items i ON i.id=v.item_id WHERE i.store_id=? AND v.effective_from>? ORDER BY v.effective_from`).bind(store.id,date).all()).results||[];
 }
 return json(out);
}

export async function onRequestPost({request,env}){
 const user=await me(request,env);if(!user)return json({error:'غير مصرح'},401);
 if(user.role!=='admin')return json({error:'تعديل الالتزامات للمدير فقط'},403);
 await ensure(env);
 const store=await corvexStore(env);if(!store)return json({error:'لم يتم العثور على متجر كورفكس'},404);
 await seed(env,store,user.id);
 const b=await request.json().catch(()=>({}));
 const action=String(b.action||''),eff=String(b.effective_from||''),today=todayAmman();
 if(!DAY.test(eff))return json({error:'حدد تاريخ السريان'},400);
 const retro=eff<today;
 if(retro&&b.confirm_retroactive!==true)return json({error:`تاريخ السريان ${eff} قبل اليوم — يغيّر أرباح أيام سابقة ويحتاج موافقة صريحة على الأثر الرجعي`,needs_retroactive_confirmation:true},409);
 const amount=Number(b.monthly_amount);
 const note=String(b.note||'').trim().slice(0,300);
 if(action==='add'){
  const name=String(b.name||'').trim().slice(0,80);
  if(name.length<2)return json({error:'اكتب اسم البند'},400);
  if(!Number.isFinite(amount)||amount<0||amount>1e7)return json({error:'المبلغ الشهري غير صالح'},400);
  const sort=Number((await env.DB.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM daily_commitment_items WHERE store_id=?').bind(store.id).first())?.n||1);
  const ins=await env.DB.prepare("INSERT INTO daily_commitment_items(store_id,kind,name,sort,created_by) VALUES(?,'custom',?,?,?)").bind(store.id,name,sort,user.id).run().catch(()=>null);
  if(!ins)return json({error:'يوجد بند بنفس الاسم'},409);
  await env.DB.prepare('INSERT INTO daily_commitment_versions(item_id,monthly_amount,active,effective_from,retroactive,note,created_by) VALUES(?,?,1,?,?,?,?)').bind(ins.meta.last_row_id,round2(amount),eff,retro?1:0,note,user.id).run();
  return json({ok:true,item_id:ins.meta.last_row_id,effective_from:eff,retroactive:retro});
 }
 if(action==='set'){
  const item=await env.DB.prepare('SELECT * FROM daily_commitment_items WHERE id=? AND store_id=?').bind(Number(b.item_id||0),store.id).first();
  if(!item)return json({error:'البند غير موجود'},404);
  const current=await commitmentFor(env,store.id,eff),cur=current.items.find(i=>i.id===item.id);
  const next=Number.isFinite(amount)?amount:(cur?.monthly||0);
  if(!Number.isFinite(next)||next<0||next>1e7)return json({error:'المبلغ الشهري غير صالح'},400);
  const active=b.active===undefined?1:(b.active?1:0);
  const statements=[];
  const name=String(b.name||'').trim().slice(0,80);
  if(name&&name!==item.name)statements.push(env.DB.prepare('UPDATE daily_commitment_items SET name=? WHERE id=?').bind(name,item.id));
  statements.push(env.DB.prepare('INSERT INTO daily_commitment_versions(item_id,monthly_amount,active,effective_from,retroactive,note,created_by) VALUES(?,?,?,?,?,?,?)').bind(item.id,round2(next),active,eff,retro?1:0,note,user.id));
  await env.DB.batch(statements);
  return json({ok:true,effective_from:eff,retroactive:retro});
 }
 return json({error:'إجراء غير معروف'},400);
}
