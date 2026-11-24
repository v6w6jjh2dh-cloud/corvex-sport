// Historical check: returns closed through returns statements before the automatic
// restock existed. GET lists, per closed shipment, what was deducted at print, what was
// already added back, and what is missing. POST {action:'apply',order_ids} adds only the
// missing pieces (recomputed on the server, so running it twice adds nothing).
import {loadInventoryModels,returnRestockPlan,restockStatements,ensureInventorySchema} from './_inventory.js';

const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

async function audit(env){
 await ensureInventorySchema(env);
 const models=await loadInventoryModels(env).catch(()=>[]);
 const name=id=>(models.find(m=>m.id===Number(id))||{}).name||('موديل '+id);
 let reports=[];
 try{reports=(await env.DB.prepare("SELECT id,date(created_at,'+3 hours') closed_on,source_name,details_json FROM cargo_return_close_reports ORDER BY id").all()).results||[]}catch{reports=[]}
 const seen=new Set(),rows=[];
 for(const r of reports){
  let d={};try{d=JSON.parse(r.details_json||'{}')}catch{}
  for(const c of d.closed||[]){
   const id=Number(c.order_id);if(!id||seen.has(id))continue;seen.add(id);
   const o=await env.DB.prepare('SELECT id,order_code,delivery_status,partial_received_items FROM orders WHERE id=?').bind(id).first();
   if(!o)continue;
   const plan=await returnRestockPlan(env,o,models);
   const missing=plan.ok?plan.items:[];
   rows.push({report_id:r.id,closed_on:r.closed_on,source_name:r.source_name||'',shipment_code:c.shipment_code||'',order_id:id,order_code:o.order_code,status:o.delivery_status,
    deducted:plan.allocated.map(a=>({model_name:name(a.model_id),quantity:a.quantity})),
    already_added:plan.already.map(a=>({model_name:name(a.model_id),quantity:a.quantity})),
    missing:missing.map(m=>({model_id:m.model_id,model_name:name(m.model_id),quantity:m.quantity,limit:m.limit})),
    state:!plan.allocated.length?'no_deduction':!plan.ok?'review':missing.length?'missing':'ok',note:plan.ok?(missing.length?'':'مُضاف للمخزون'):plan.reason});
  }
 }
 const byModel=new Map();
 for(const r of rows)for(const m of r.missing)byModel.set(m.model_name,(byModel.get(m.model_name)||0)+m.quantity);
 return {rows,summary:{closed_shipments:rows.length,missing_orders:rows.filter(r=>r.state==='missing').length,missing_pieces:[...byModel.values()].reduce((a,b)=>a+b,0),
  ok_orders:rows.filter(r=>r.state==='ok').length,no_deduction:rows.filter(r=>r.state==='no_deduction').length,review:rows.filter(r=>r.state==='review').length,
  by_model:[...byModel].map(([model_name,quantity])=>({model_name,quantity}))}};
}

export async function onRequest({request,env}){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'صلاحية المدير مطلوبة'},403);
 if(request.method==='GET')return json(await audit(env));
 if(request.method!=='POST')return json({error:'طريقة غير مدعومة'},405);
 const b=await request.json().catch(()=>({}));
 if(b.action!=='apply'||b.confirm!=='تطبيق التصحيح')return json({error:'يلزم تأكيد التطبيق'},400);
 const wanted=new Set((Array.isArray(b.order_ids)?b.order_ids:[]).map(Number).filter(Boolean));
 const current=await audit(env);
 const targets=current.rows.filter(r=>r.state==='missing'&&(!wanted.size||wanted.has(r.order_id)));
 if(!targets.length)return json({ok:true,applied_orders:0,applied_pieces:0,message:'لا توجد فروقات للتطبيق'});
 // One atomic batch per order: balance and movement are always written together, so a
 // re-run (which recomputes from movements) can never add the same pieces twice.
 for(const r of targets)await env.DB.batch(restockStatements(env,r.order_id,r.missing,user.id,'تصحيح تاريخي — مرتجع كشف المرتجعات #'+r.report_id+' شحنة '+r.shipment_code,{sourceRef:'historical_fix:cargo_report:'+r.report_id}));
 return json({ok:true,applied_orders:targets.length,applied_pieces:targets.reduce((n,r)=>n+r.missing.reduce((m,x)=>m+x.quantity,0),0)});
}
