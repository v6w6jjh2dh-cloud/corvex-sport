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
//  GET  ?view=lexicon                       → the store's order language: generic defaults + learned + approved entries
//  GET  ?view=unknown&from=&to=             → product-like phrases in recent orders that match no product (new products /
//       new aliases to teach), grouped with counts — generic, no product word list
//  POST {action:'lexicon_propose', kind, value, quantity?, fix?, product?} → pending language rule (no effect)
//  POST {action:'lexicon_test', id}         → dry run on recent orders (which readings would change)
//  POST {action:'lexicon_approve', id, confirm:'اعتماد القاعدة'} | {action:'lexicon_reject'|'lexicon_disable', id}
//  GET  ?view=versions                      → rule decision log; current_version = latest decision id
//  POST {action:'rules_rollback', to_version, confirm:'تراجع عن القواعد'} → disable rules approved after that version
//  Readings use the rules in force when the order was created (no automatic re-interpretation of history).
//  GET  ?view=knowledge                     → the accumulated knowledge registry + catalogue aliases, and a self-check
//       that every alias still resolves to its product (run it on production after each change)
//  GET  ?view=interpretations&order_id=     → interpretation memory (text → system reading → correction → rule)
//  POST {action:'interpret', order_id}      → record the central engine's reading of one Corvex order (no order change)
//  POST {action:'correct', order_id, items:[{product_ref,quantity}], note, alias_id?} → record a manager correction
//                                             (memory only: orders, stock and profits are not changed)
// Designed for later use by CORVEX AI through the same validated actions (propose → test → admin approval).
import {json,round2,normalizeArabic} from './_partial-delivery.js';
import {classifyInventoryItems,loadInventoryModels} from './_inventory.js';
import {loadCatalogue,describeCatalogue,resolveOrderItems,ensureProductAliasTable,ensureInterpretationTable,ensureLexiconTable,LEXICON_KINDS,textHash,ensureRuleEventsTable,logRuleEvent,catalogueAsOf,productRef,ENGINE_VERSION} from './_product-engine.js';
import {unknownPhrases,DEFAULT_LEXICON,LEARNED_DEFAULTS,LANGUAGE_VERSION} from './_order-language.js';
import {PRODUCT_KNOWLEDGE,QUANTITY_RULES,GUARD_RULES,NAME_SYNONYMS,KNOWLEDGE_VERSION} from './_product-knowledge.js';
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
 return (await env.DB.prepare(`SELECT o.id,o.order_code,o.raw_text,o.order_notes,o.delivery_status,o.created_at,date(o.first_printed_at,'+3 hours') ship_day
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
   const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit')||150)));
   if(!DAY.test(from)||!DAY.test(to)||from>to)return json({error:'تاريخ غير صالح'},400);
   const orders=await corvexOrders(env,store.id,from,to,limit);
   const cat=await loadCatalogue(env,{storeId:store.id});
   const baseCat=await loadCatalogue(env,{storeId:store.id,knowledge:false}),asOfCat=await catalogueAsOf(env,store.id);
   const invModels=await loadInventoryModels(env);
   const alloc=await allocations(env,orders.map(o=>Number(o.id)));
   // shipment-day engine (unchanged, active) per day, for proof of equivalence on real data
   const cohort=new Map(),auth=request.headers.get('authorization')||'';
   for(const d of [...new Set(orders.map(o=>o.ship_day))]){
    try{const r=await cohortEngine({request:new Request(`${url.origin}/api/profit-shipping-cohorts?date=${d}&store_id=${store.id}`,{headers:{authorization:auth}}),env});
     if(r.ok)for(const o of (await r.json()).orders||[])cohort.set(Number(o.id),o)}catch{}
   }
   const rows=[];const counts={orders:orders.length,central_vs_profit_engine:0,baseline_vs_profit_engine:0,knowledge_changes:0,central_vs_print_engine:0,central_vs_print_allocation:0,central_unrecognised:0,central_cost_unknown:0,central_needs_review:0,cost_differences:0};
   for(const o of orders){
    // read with the rules in force when the order was created (no automatic re-interpretation of history)
    const central=await resolveOrderItems(env,o,await asOfCat(o.created_at),alloc.get(Number(o.id))||null);
    // baseline = central engine without the knowledge registry; must equal the active profit engine.
    const baseline=await resolveOrderItems(env,o,baseCat,alloc.get(Number(o.id))||null);
    const knowledgeDiff=diffKinds(shape(central.items),shape(baseline.items));if(knowledgeDiff.length)counts.knowledge_changes++;
    const print=(await classifyInventoryItems(env,o.raw_text||o.order_notes||'',invModels)).map(x=>({name:(invModels.find(m=>m.id===x.model_id)||{}).name||String(x.model_id),quantity:x.quantity}));
    const c=shape(central.items),p=shape(print),a=shape(alloc.get(Number(o.id))),h=cohort.has(Number(o.id))?shape(cohort.get(Number(o.id)).items):null;
    const d={vs_profit_engine:h?diffKinds(c,h):['not_in_profit_report'],vs_print_engine:diffKinds(c,p),vs_print_allocation:alloc.has(Number(o.id))?diffKinds(c,a):['no_allocation']};
    if(h&&d.vs_profit_engine.length)counts.central_vs_profit_engine++;
    if(h&&diffKinds(shape(baseline.items),h).length)counts.baseline_vs_profit_engine++;
    d.knowledge_vs_baseline=knowledgeDiff;
    if(d.vs_print_engine.length)counts.central_vs_print_engine++;
    if(alloc.has(Number(o.id))&&d.vs_print_allocation.length)counts.central_vs_print_allocation++;
    // cost per order: active profit engine (items × approved unit cost) vs central engine
    const ho=cohort.get(Number(o.id))||null;
    const hCost=ho&&(ho.items||[]).length&&(ho.items||[]).every(i=>i.total_cost!=null)?round2(ho.items.reduce((n,i)=>n+Number(i.total_cost||0),0)):null;
    const costDiff=ho?(hCost===null)!==(central.cost===null)||(hCost!==null&&central.cost!==null&&Math.abs(hCost-central.cost)>0.001):false;
    if(costDiff){counts.cost_differences++;d.cost=['cost']}
    if(central.needs_review)counts.central_needs_review++;
    if(!central.items.length)counts.central_unrecognised++;
    if(central.items.length&&central.cost===null)counts.central_cost_unknown++;
    const differs=costDiff||central.needs_review||knowledgeDiff.length||d.vs_print_engine.length||(h&&d.vs_profit_engine.length)||(alloc.has(Number(o.id))&&d.vs_print_allocation.length)||!central.items.length;
    if(differs||url.searchParams.get('all')==='1')rows.push({id:o.id,order_code:o.order_code,ship_day:o.ship_day,text:String(o.order_notes||o.raw_text||'').slice(0,400),
     central:{items:central.items.map(i=>({ref:i.ref,name:i.name,quantity:i.quantity,unit_cost:i.unit_cost})),source:central.source,cost:central.cost,knowledge:central.trace.filter(t=>t.source==='knowledge')},
     baseline:{items:baseline.items.map(i=>({name:i.name,quantity:i.quantity})),source:baseline.source},
     profit_engine:h,profit_engine_detail:ho?{items:(ho.items||[]).map(i=>({name:i.name,quantity:i.quantity,unit_cost:i.unit_cost})),cost:hCost,source:ho.item_source}:null,
     needs_review:central.needs_review,uncertain:(central.uncertain||[]).map(u=>({alias:u.alias,reason:u.reason})),
     print_engine:p,print_allocation:a,differences:d});
   }
   return json({engine:ENGINE_VERSION,read_only:true,store,from,to,counts,rows});
  }
  if(view==='lexicon'){
   await ensureLexiconTable(env);
   const cat=await loadCatalogue(env,{storeId:store.id});
   const rows=(await env.DB.prepare('SELECT * FROM store_lexicon WHERE store_id=? ORDER BY id DESC LIMIT 300').bind(store.id).all()).results||[];
   return json({store,language_version:LANGUAGE_VERSION,kinds:LEXICON_KINDS,defaults:DEFAULT_LEXICON,learned_defaults:LEARNED_DEFAULTS,
    effective:{lexicon:cat.lexicon,learned:cat.learned},entries:rows.map(r=>({...r,data:JSON.parse(r.data_json||'{}'),test:r.test_json?JSON.parse(r.test_json):null,data_json:undefined,test_json:undefined}))});
  }
  if(view==='unknown'){
   const to=url.searchParams.get('to')||todayAmman(),from=url.searchParams.get('from')||shift(to,-29);
   if(!DAY.test(from)||!DAY.test(to)||from>to)return json({error:'تاريخ غير صالح'},400);
   const orders=await corvexOrders(env,store.id,from,to,1000),cat=await loadCatalogue(env,{storeId:store.id}),groups=new Map();
   for(const o of orders)for(const p of unknownPhrases(String(o.order_notes||'')+'\n'+String(o.raw_text||''),cat.models,cat.lexicon)){
    const g=groups.get(p)||{phrase:p,orders:0,examples:[]};g.orders++;if(g.examples.length<5)g.examples.push({id:o.id,order_code:o.order_code});groups.set(p,g);
   }
   return json({store,from,to,read_only:true,orders:orders.length,candidates:[...groups.values()].sort((a,b)=>b.orders-a.orders).slice(0,200)});
  }
  if(view==='versions'){
   await ensureRuleEventsTable(env);
   const rows=(await env.DB.prepare('SELECT * FROM knowledge_rule_events WHERE store_id=? ORDER BY id DESC LIMIT 500').bind(store.id).all()).results||[];
   const decided=rows.find(r=>['approved','rejected','disabled','rolled_back'].includes(r.action));
   return json({store,current_version:decided?decided.id:0,events:rows});
  }
  if(view==='knowledge'){
   const cat=await loadCatalogue(env,{storeId:store.id}),failures=[],check=url.searchParams.get('check')==='1';
   // T-11: a single general word needs product evidence, so each name is checked with a quantity («… عدد 2»).
   const probe=a=>/\s/.test(key(a).trim())?a:a+' عدد 2';
   // the self-check reads every alias (heavy): only on request (?check=1)
   if(check)for(const k of PRODUCT_KNOWLEDGE.filter(x=>x.status!=='superseded'&&x.status!=='disabled'))for(const a of [...k.aliases,...(k.review||[])]){
    const r=await resolveOrderItems(env,{order_notes:'',raw_text:probe(a)},cat);
    if(r.items.length!==1)failures.push({id:k.id,alias:a,got:r.items.map(i=>i.name)});
   }
   if(check)for(const m of cat.models)for(const a of m.aliases||[]){
    const r=await resolveOrderItems(env,{order_notes:'',raw_text:probe(a)},cat);
    if(!r.items.some(i=>Number(i.model_id)===Number(m.id)))failures.push({product:m.name,alias:a,got:r.items.map(i=>i.name)});
   }
   return json({engine:ENGINE_VERSION,knowledge_version:KNOWLEDGE_VERSION,store,read_only:true,
    self_check:check?{ok:!failures.length,failures:failures.slice(0,200)}:null,
    products:PRODUCT_KNOWLEDGE,quantity_rules:QUANTITY_RULES,guards:GUARD_RULES,name_synonyms:NAME_SYNONYMS,
    catalogue:describeCatalogue(cat).map(p=>({ref:p.ref,name:p.name,aliases:p.aliases,in_database:p.in_database}))});
  }
  if(view==='interpretations'){
   await ensureInterpretationTable(env);
   const oid=Number(url.searchParams.get('order_id')||0);
   const rows=(await env.DB.prepare(`SELECT * FROM order_interpretations WHERE store_id=? ${oid?'AND order_id=?':''} ORDER BY id DESC LIMIT 200`).bind(...(oid?[store.id,oid]:[store.id])).all()).results||[];
   return json({store,interpretations:rows.map(r=>({...r,system:JSON.parse(r.system_json||'[]'),corrected:r.corrected_json?JSON.parse(r.corrected_json):null}))});
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
   await logRuleEvent(env,{storeId:store.id,table:'product_aliases',ruleId:r.meta.last_row_id,action:'proposed',to:'pending',actor:me.id,note:String(b.via||'admin')});
   return json({ok:true,id:r.meta.last_row_id,status:'pending'});
  }
  if(action==='rules_rollback'){
   // Undo learning: every rule approved after `to_version` is disabled (kept, never deleted) and logged.
   if(String(b.confirm||'').trim()!=='تراجع عن القواعد')return json({error:'اكتب «تراجع عن القواعد» للتأكيد'},400);
   const to=Number(b.to_version);if(!Number.isInteger(to)||to<0)return json({error:'رقم إصدار غير صالح'},400);
   await ensureRuleEventsTable(env);await ensureLexiconTable(env);await ensureProductAliasTable(env);
   const later=(await env.DB.prepare("SELECT rule_table,rule_id FROM knowledge_rule_events WHERE store_id=? AND action='approved' AND id>? ORDER BY id DESC").bind(store.id,to).all()).results||[];
   const done=[],skipped=[];
   for(const e of later){
    if(!['product_aliases','store_lexicon'].includes(e.rule_table))continue;
    const r=await env.DB.prepare(`UPDATE ${e.rule_table} SET status='disabled',decided_by=?,decided_at=datetime('now') WHERE id=? AND store_id=? AND status='approved'`).bind(me.id,e.rule_id,store.id).run().catch(()=>null);
    if(r&&r.meta.changes===1){await logRuleEvent(env,{storeId:store.id,table:e.rule_table,ruleId:e.rule_id,action:'rolled_back',from:'approved',to:'disabled',actor:me.id,note:'to_version '+to});done.push(e)}
    else skipped.push(e);
   }
   return json({ok:true,to_version:to,disabled:done,skipped,note:'القواعد المعطلة محفوظة ويمكن اقتراحها من جديد؛ لم يتغير أي طلب'});
  }
  if(action.startsWith('lexicon_')){
   await ensureLexiconTable(env);
   if(action==='lexicon_propose'){
    const kind=String(b.kind||''),k=LEXICON_KINDS[kind];if(!k)return json({error:'نوع قاعدة غير معروف',kinds:Object.keys(LEXICON_KINDS)},400);
    const raw=String(b.value||'').trim().slice(0,60),value=key(raw);if(value.length<2)return json({error:'الكلمة قصيرة جدًا'},400);
    const data={};
    if(/quantity/.test(k.needs||'')){const q=Number(b.quantity);if(!Number.isInteger(q)||q<1||q>50)return json({error:'الكمية يجب أن تكون 1–50'},400);data.quantity=q}
    if(k.needs==='fix'){data.fix=String(b.fix||'').trim().slice(0,60);if(key(data.fix).length<2)return json({error:'اكتب التصحيح'},400)}
    if(/product/.test(k.needs||'')){data.product=String(b.product||'').trim().slice(0,60);if(key(data.product).length<2)return json({error:'اكتب كلمة من اسم المنتج'},400)}
    const cat=await loadCatalogue(env,{storeId:store.id});
    if(cat.models.some(m=>(m.aliases||[]).includes(value)))return json({error:'الكلمة اسم منتج في الكتالوج'},409);
    const cur=k.field?cat.lexicon[k.field]:cat.learned[k.learned];
    if(k.field&&(Array.isArray(cur)?cur.includes(value):value in cur))return json({error:'الكلمة معروفة مسبقًا'},409);
    const r=await env.DB.prepare("INSERT INTO store_lexicon(store_id,kind,value,value_raw,data_json,status,proposed_by,proposed_via,note) VALUES(?,?,?,?,?,'pending',?,?,?)")
     .bind(store.id,kind,value,raw,JSON.stringify(data),me.id,String(b.via||'admin').slice(0,20),String(b.note||'').slice(0,300)).run().catch(()=>null);
    if(!r)return json({error:'يوجد اقتراح مفتوح بنفس الكلمة'},409);
    await logRuleEvent(env,{storeId:store.id,table:'store_lexicon',ruleId:r.meta.last_row_id,action:'proposed',to:'pending',actor:me.id,note:String(b.via||'admin')});
    return json({ok:true,id:r.meta.last_row_id,status:'pending'});
   }
   const row=await env.DB.prepare('SELECT * FROM store_lexicon WHERE id=? AND store_id=?').bind(Number(b.id||0),store.id).first();
   if(!row)return json({error:'القاعدة غير موجودة'},404);
   if(action==='lexicon_test'){
    const to=todayAmman(),from=shift(to,-60),orders=await corvexOrders(env,store.id,from,to,1000);
    const before=await loadCatalogue(env,{storeId:store.id}),after=await loadCatalogue(env,{storeId:store.id,extraLexicon:row.status==='approved'?[]:[row]});
    const changed=[];
    for(const o of orders){const a=shape((await resolveOrderItems(env,o,before)).items),c=shape((await resolveOrderItems(env,o,after)).items);
     if(!same(a,c))changed.push({id:o.id,order_code:o.order_code,before:a,after:c,text:String(o.order_notes||o.raw_text||'').slice(0,200)})}
    const summary={tested_at:new Date().toISOString(),orders:orders.length,changed:changed.length,examples:changed.slice(0,30)};
    await env.DB.prepare('UPDATE store_lexicon SET test_json=? WHERE id=?').bind(JSON.stringify(summary),row.id).run();
    return json({ok:true,read_only_for_orders:true,...summary});
   }
   if(action==='lexicon_approve'){
    if(row.status!=='pending')return json({error:'القاعدة ليست بانتظار الاعتماد'},409);
    if(!row.test_json)return json({error:'شغّل الاختبار التجريبي قبل الاعتماد'},409);
    if(String(b.confirm||'').trim()!=='اعتماد القاعدة')return json({error:'اكتب «اعتماد القاعدة» للتأكيد'},400);
    const r=await env.DB.prepare("UPDATE store_lexicon SET status='approved',decided_by=?,decided_at=datetime('now') WHERE id=? AND status='pending'").bind(me.id,row.id).run();
    if(r.meta.changes===1)await logRuleEvent(env,{storeId:store.id,table:'store_lexicon',ruleId:row.id,action:'approved',from:'pending',to:'approved',actor:me.id});
    return json({ok:r.meta.changes===1,status:'approved',note:'تُستخدم في المحرك المركزي (وضع المقارنة) فقط حتى تفعيله'});
   }
   if(action==='lexicon_reject'||action==='lexicon_disable'){
    const next=action==='lexicon_reject'?'rejected':'disabled';
    await env.DB.prepare("UPDATE store_lexicon SET status=?,decided_by=?,decided_at=datetime('now') WHERE id=?").bind(next,me.id,row.id).run();
    await logRuleEvent(env,{storeId:store.id,table:'store_lexicon',ruleId:row.id,action:next,from:row.status,to:next,actor:me.id});
    return json({ok:true,status:next});
   }
   return json({error:'إجراء غير معروف'},400);
  }
  if(action==='interpret'||action==='correct'){
   await ensureInterpretationTable(env);
   const o=await env.DB.prepare('SELECT id,store_id,order_notes,raw_text,created_at FROM orders WHERE id=? AND store_id=?').bind(Number(b.order_id||0),store.id).first();
   if(!o)return json({error:'الطلب غير موجود في كورفكس'},404);
   const cat=await (await catalogueAsOf(env,store.id))(o.created_at);
   const r=await resolveOrderItems(env,o,cat);
   const field=r.source==='order_notes'||r.source==='raw_text'?r.source:(o.order_notes?'order_notes':'raw_text');
   const text=String(o[field]||''),hash=textHash(text),version=cat.version;
   const system=r.items.map(i=>({product_ref:i.ref,name:i.name,quantity:i.quantity}));
   await env.DB.prepare('INSERT OR IGNORE INTO order_interpretations(store_id,order_id,source_field,source_text,source_hash,engine_version,system_json,created_by) VALUES(?,?,?,?,?,?,?,?)')
    .bind(store.id,o.id,field,text,hash,version,JSON.stringify(system),me.id).run();
   const rec=await env.DB.prepare('SELECT * FROM order_interpretations WHERE store_id=? AND order_id=? AND engine_version=? AND source_hash=?').bind(store.id,o.id,version,hash).first();
   if(action==='interpret')return json({ok:true,read_only_for_orders:true,interpretation:{...rec,system}});
   const refs=new Set(cat.models.map(productRef));
   const items=Array.isArray(b.items)?b.items.map(x=>({product_ref:String(x.product_ref||''),quantity:Number(x.quantity)})):[];
   if(!items.length||items.some(x=>!refs.has(x.product_ref)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>50))return json({error:'تصحيح غير صالح: منتج من الكتالوج وكمية صحيحة 1–50'},400);
   let alias=null;
   if(b.alias_id){alias=await env.DB.prepare('SELECT id,status,decided_by,decided_at FROM product_aliases WHERE id=? AND store_id=?').bind(Number(b.alias_id),store.id).first();if(!alias)return json({error:'القاعدة غير موجودة'},404)}
   await env.DB.prepare(`UPDATE order_interpretations SET status='corrected',corrected_json=?,correction_note=?,corrected_by=?,corrected_at=datetime('now'),
     rule_kind=?,rule_ref=?,rule_status=?,rule_approved_by=?,rule_approved_at=? WHERE id=?`)
    .bind(JSON.stringify(items),String(b.note||'').slice(0,300),me.id,alias?'alias':null,alias?'alias:'+alias.id:null,alias?alias.status:null,alias?.status==='approved'?alias.decided_by:null,alias?.status==='approved'?alias.decided_at:null,rec.id).run();
   // Learning suggestion (never applied automatically): one corrected product + one unknown phrase in the text
   // → propose that phrase as an alias of that product (manager runs propose → test → approve).
   const unknown=unknownPhrases(text,cat.models,cat.lexicon);
   const suggestions=items.length===1&&unknown.length===1?[{action:'propose',product_ref:items[0].product_ref,alias:unknown[0]}]:[];
   return json({ok:true,read_only_for_orders:true,id:rec.id,status:'corrected',unknown_phrases:unknown,suggestions,note:'سُجّل التصحيح في ذاكرة التفسير فقط؛ لم يتغير الطلب أو المخزون أو الأرباح'});
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
   if(r.meta.changes===1)await logRuleEvent(env,{storeId:store.id,table:'product_aliases',ruleId:row.id,action:'approved',from:'pending',to:'approved',actor:me.id});
   if(r.meta.changes===1){await ensureInterpretationTable(env);await env.DB.prepare("UPDATE order_interpretations SET rule_status='approved',rule_approved_by=?,rule_approved_at=datetime('now') WHERE store_id=? AND rule_ref=?").bind(me.id,store.id,'alias:'+row.id).run()}
   return json({ok:r.meta.changes===1,status:'approved',note:'يُستخدم في المحرك المركزي (وضع المقارنة) فقط حتى تفعيله'});
  }
  if(action==='reject'||action==='disable'){
   const next=action==='reject'?'rejected':'disabled';
   await env.DB.prepare("UPDATE product_aliases SET status=?,decided_by=?,decided_at=datetime('now') WHERE id=?").bind(next,me.id,row.id).run();
   await logRuleEvent(env,{storeId:store.id,table:'product_aliases',ruleId:row.id,action:next,from:row.status,to:next,actor:me.id});
   await ensureInterpretationTable(env);await env.DB.prepare('UPDATE order_interpretations SET rule_status=? WHERE store_id=? AND rule_ref=?').bind(next,store.id,'alias:'+row.id).run();
   return json({ok:true,status:next});
  }
  return json({error:'إجراء غير معروف'},400);
 }
 return json({error:'طريقة غير مدعومة'},405);
}
