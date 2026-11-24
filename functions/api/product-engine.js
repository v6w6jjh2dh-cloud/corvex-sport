// Central product engine — shadow / comparison API (admin only). See docs/PRODUCT_ENGINE.md.
//  GET  ?view=catalogue                     → products: stable ref, name, aliases, approved cost and its source
//  GET  ?view=compare&from=&to=&limit=      → Corvex orders (by first print day): central engine vs the
//       print-time inventory engine vs the stored print allocation vs the shipment-day profit engine,
//       with every difference in products / quantities / cost. READ-ONLY.
//  GET  ?view=aliases                       → alias proposals for Corvex
//  POST {action:'propose', product_ref, alias, note}      → pending proposal (no effect)
//  POST {action:'test', id}                 → dry run on recent Corvex orders: which orders would change (no write
//                                             except storing the test summary on the proposal)
//  POST {action:'approve', id, confirm:'اعتماد الاسم'}   → approved for Corvex; used by the central engine only
//                                             (the active engines are unchanged until the engine is activated)
//  POST {action:'reject'|'disable', id}
// Designed for later use by CORVEX AI through the same validated actions (propose → test → admin approval).
import {json,round2,normalizeArabic} from './_partial-delivery.js';
import {classifyInventoryItems,loadInventoryModels} from './_inventory.js';
import {loadCatalogue,describeCatalogue,resolveOrderItems,ensureProductAliasTable,productRef,ENGINE_VERSION} from './_product-engine.js';
import {onRequest as cohortEngine} from './profit-shipping-cohorts.js';

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const todayAmman=()=>new Date(Date.now()+3*3600e3).toISOString().slice(0,10);
const shift=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const key=x=>normalizeArabic(x);

async function admin(request,env){
 const h=request.headers.get('authorization')||'',t=h.startsWith('Bearer ')?h.slice(7):'';
 if(!t)return null;
 return env.DB.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1").bind(t).first();
}
async function corvexStore(env){
 const rows=(await env.DB.prepare('SELECT id,name FROM stores ORDER BY id').all()).results||[];
 return rows.find(s=>/corvex|كورفكس/i.test(String(s.name||'')))||null;
}
async function corvexOrders(env,storeId,from,to,limit){
 return (await env.DB.prepare(`SELECT o.id,o.order_code,o.raw_text,o.order_notes,o.delivery_status,date(o.first_printed_at,'+3 hours') ship_day
   FROM orders o WHERE o.store_id=? AND o.first_printed_at IS NOT NULL AND date(o.first_printed_at,'+3 hours') BETWEEN ? AND ?
   ORDER BY o.id DESC LIMIT ?`).bind(storeId,from,to,limit).all()).results||[];
}
async function allocations(env,ids){
 const map=new Map();if(!ids.length)return map;
 for(let i=0;i<ids.length;i+=80){
  const chunk=ids.slice(i,i+80);
  try{
   const rows=(await env.DB.prepare(`SELECT i.order_id,i.model_id,i.quantity,m.name model_name FROM inventory_order_items i LEFT JOIN profit_models m ON m.id=i.model_id WHERE i.order_id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all()).results||[];
   for(const r of rows){const k=Number(r.order_id);if(!map.has(k))map.set(k,[]);map.get(k).push({model_id:Number(r.model_id),name:r.model_name||'',quantity:Number(r.quantity||0)})}
  }catch{}
 }
 return map;
}
// {canonical name → quantity}
const shape=list=>Object.fromEntries((list||[]).map(i=>[key(i.name),Number(i.quantity||0)]).sort());
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function diffKinds(a,b){
 const ka=Object.keys(a),kb=Object.keys(b);
 if(!ka.length&&!kb.length)return [];
 if(!same(ka,kb))return ['products'];
 return ka.some(k=>a[k]!==b[k])?['quantity']:[];
}

export async function onRequest({request,env}){
 const me=await admin(request,env);if(!me)return json({error:'غير مصرح'},401);
 if(me.role!=='admin')return json({error:'للمدير فقط'},403);
 const store=await corvexStore(env);if(!store)return json({error:'لم يتم العثور على متجر كورفكس'},404);
 const url=new URL(request.url);

 if(request.method==='GET'){
  const view=url.searchParams.get('view')||'catalogue';
  if(view==='catalogue'){
   const cat=await loadCatalogue(env,{storeId:store.id});
   return json({engine:ENGINE_VERSION,store,catalogue_error:cat.catalogueError||null,products:describeCatalogue(cat)});
  }
  if(view==='aliases'){
   await ensureProductAliasTable(env);
   const rows=(await env.DB.prepare('SELECT * FROM product_aliases WHERE store_id=? ORDER BY id DESC LIMIT 300').bind(store.id).all()).results||[];
   return json({store,aliases:rows.map(r=>({...r,test:r.test_json?JSON.parse(r.test_json):null,test_json:undefined}))});
  }
  if(view==='compare'){
   const to=url.searchParams.get('to')||todayAmman(),from=url.searchParams.get('from')||shift(to,-13);
   const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit')||300)));
   if(!DAY.test(from)||!DAY.test(to)||from>to)return json({error:'تاريخ غير صالح'},400);
   const orders=await corvexOrders(env,store.id,from,to,limit);
   const cat=await loadCatalogue(env,{storeId:store.id});
   const invModels=await loadInventoryModels(env);
   const alloc=await allocations(env,orders.map(o=>Number(o.id)));
   // shipment-day engine (unchanged, active) per day, for proof of equivalence on real data
   const cohort=new Map(),auth=request.headers.get('authorization')||'';
   for(const d of [...new Set(orders.map(o=>o.ship_day))]){
    try{const r=await cohortEngine({request:new Request(`${url.origin}/api/profit-shipping-cohorts?date=${d}&store_id=${store.id}`,{headers:{authorization:auth}}),env});
     if(r.ok)for(const o of (await r.json()).orders||[])cohort.set(Number(o.id),o)}catch{}
   }
   const rows=[];const counts={orders:orders.length,central_vs_profit_engine:0,central_vs_print_engine:0,central_vs_print_allocation:0,central_unrecognised:0,central_cost_unknown:0};
   for(const o of orders){
    const central=await resolveOrderItems(env,o,cat,alloc.get(Number(o.id))||null);
    const print=(await classifyInventoryItems(env,o.raw_text||o.order_notes||'',invModels)).map(x=>({name:(invModels.find(m=>m.id===x.model_id)||{}).name||String(x.model_id),quantity:x.quantity}));
    const c=shape(central.items),p=shape(print),a=shape(alloc.get(Number(o.id))),h=cohort.has(Number(o.id))?shape(cohort.get(Number(o.id)).items):null;
    const d={vs_profit_engine:h?diffKinds(c,h):['not_in_profit_report'],vs_print_engine:diffKinds(c,p),vs_print_allocation:alloc.has(Number(o.id))?diffKinds(c,a):['no_allocation']};
    if(h&&d.vs_profit_engine.length)counts.central_vs_profit_engine++;
    if(d.vs_print_engine.length)counts.central_vs_print_engine++;
    if(alloc.has(Number(o.id))&&d.vs_print_allocation.length)counts.central_vs_print_allocation++;
    if(!central.items.length)counts.central_unrecognised++;
    if(central.items.length&&central.cost===null)counts.central_cost_unknown++;
    const differs=d.vs_print_engine.length||(h&&d.vs_profit_engine.length)||(alloc.has(Number(o.id))&&d.vs_print_allocation.length)||!central.items.length;
    if(differs||url.searchParams.get('all')==='1')rows.push({id:o.id,order_code:o.order_code,ship_day:o.ship_day,text:String(o.order_notes||o.raw_text||'').slice(0,400),
     central:{items:central.items.map(i=>({ref:i.ref,name:i.name,quantity:i.quantity,unit_cost:i.unit_cost})),source:central.source,cost:central.cost},
     profit_engine:h,print_engine:p,print_allocation:a,differences:d});
   }
   return json({engine:ENGINE_VERSION,read_only:true,store,from,to,counts,rows});
  }
  return json({error:'عرض غير معروف'},400);
 }

 if(request.method==='POST'){
  await ensureProductAliasTable(env);
  const b=await request.json().catch(()=>({}));
  const action=String(b.action||'');
  if(action==='propose'){
   const alias=String(b.alias||'').trim().slice(0,80),ref=String(b.product_ref||'');
   if(key(alias).length<2)return json({error:'الاسم البديل قصير جدًا'},400);
   const cat=await loadCatalogue(env,{storeId:store.id});
   const product=cat.models.find(m=>productRef(m)===ref);
   if(!product)return json({error:'المنتج غير موجود في الكتالوج'},404);
   const owner=cat.models.find(m=>(m.aliases||[]).includes(key(alias)));
   if(owner)return json({error:`الاسم مستخدم مسبقًا للمنتج «${owner.name}»`},409);
   const r=await env.DB.prepare("INSERT INTO product_aliases(store_id,product_ref,alias,alias_raw,status,proposed_by,proposed_via,note) VALUES(?,?,?,?,'pending',?,?,?)")
    .bind(store.id,ref,key(alias),alias,me.id,String(b.via||'admin').slice(0,20),String(b.note||'').slice(0,300)).run().catch(()=>null);
   if(!r)return json({error:'يوجد اقتراح مفتوح بنفس الاسم'},409);
   return json({ok:true,id:r.meta.last_row_id,status:'pending'});
  }
  const row=await env.DB.prepare('SELECT * FROM product_aliases WHERE id=? AND store_id=?').bind(Number(b.id||0),store.id).first();
  if(!row)return json({error:'الاقتراح غير موجود'},404);
  if(action==='test'){
   const to=todayAmman(),from=shift(to,-60);
   const orders=await corvexOrders(env,store.id,from,to,1000);
   const before=await loadCatalogue(env,{storeId:store.id});
   const after=await loadCatalogue(env,{storeId:store.id,extraAliases:row.status==='approved'?[]:[{product_ref:row.product_ref,alias:row.alias}]});
   const changed=[];
   for(const o of orders){
    const a=shape((await resolveOrderItems(env,o,before)).items),c=shape((await resolveOrderItems(env,o,after)).items);
    if(!same(a,c))changed.push({id:o.id,order_code:o.order_code,before:a,after:c,text:String(o.order_notes||o.raw_text||'').slice(0,200)});
   }
   const summary={tested_at:new Date().toISOString(),orders:orders.length,changed:changed.length,examples:changed.slice(0,30)};
   await env.DB.prepare('UPDATE product_aliases SET test_json=? WHERE id=?').bind(JSON.stringify(summary),row.id).run();
   return json({ok:true,read_only_for_orders:true,...summary});
  }
  if(action==='approve'){
   if(row.status!=='pending')return json({error:'الاقتراح ليس بانتظار الاعتماد'},409);
   if(!row.test_json)return json({error:'شغّل الاختبار التجريبي قبل الاعتماد'},409);
   if(String(b.confirm||'').trim()!=='اعتماد الاسم')return json({error:'اكتب «اعتماد الاسم» للتأكيد'},400);
   const r=await env.DB.prepare("UPDATE product_aliases SET status='approved',decided_by=?,decided_at=datetime('now') WHERE id=? AND status='pending'").bind(me.id,row.id).run();
   return json({ok:r.meta.changes===1,status:'approved',note:'يُستخدم في المحرك المركزي (وضع المقارنة) فقط حتى تفعيله'});
  }
  if(action==='reject'||action==='disable'){
   const next=action==='reject'?'rejected':'disabled';
   await env.DB.prepare("UPDATE product_aliases SET status=?,decided_by=?,decided_at=datetime('now') WHERE id=?").bind(next,me.id,row.id).run();
   return json({ok:true,status:next});
  }
  return json({error:'إجراء غير معروف'},400);
 }
 return json({error:'طريقة غير مدعومة'},405);
}
