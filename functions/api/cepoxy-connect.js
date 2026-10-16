import {STORE_NAME,SOURCE_PROJECT,json,dbSession,admin,ensureSchema,config,hex,validatePayload,applyEvent} from './_cepoxy.js';
import {sourceSql} from './_cepoxy-source-sql.js';
import {ensureInventorySchema} from './_inventory.js';
export async function onRequest({request,env}) {
  try {
    const db=dbSession(env.DB),actor=await admin(request,db);
    if(!actor)return json({error:'سجّل الدخول بحساب المدير في كورفكس أولًا.'},401);
    if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
    await ensureSchema(db);
    if(request.method==='POST') {
      if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)
        return json({error:'invalid_origin'},403);
      const body=await request.json();
      if(body.action==='setup') {
        await ensureInventorySchema({DB:db});
        const store=await db.prepare('SELECT id FROM stores WHERE name=? AND is_active=1').bind(STORE_NAME).first();
        if(!store)return json({error:'لم أجد متجرًا نشطًا بالاسم «سي ايبوكسي». تأكد من كتابته بهذا الشكل.'},400);
        await db.prepare(`INSERT INTO cepoxy_config(id,store_id,actor_id,installation_id,signing_key)
          VALUES(1,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(store.id,actor.id,crypto.randomUUID(),hex(crypto.getRandomValues(new Uint8Array(32)))).run();
        const cfg=await config(db);
        if(cfg.store_id!==store.id)return json({error:'يوجد ربط بمتجر آخر؛ لم يتم استبداله.'},409);
        return json({ok:true,sql:sourceSql(cfg),project_ref:SOURCE_PROJECT});
      }
      if(body.action==='enabled' && typeof body.enabled==='boolean') {
        await db.prepare('UPDATE cepoxy_config SET enabled=? WHERE id=1').bind(body.enabled?1:0).run();
        return json({ok:true});
      }
      if(body.action==='retry' && Number.isSafeInteger(body.event_id)) {
        const cfg=await config(db);
        if(!cfg?.enabled || !cfg.store_active || !cfg.actor_active || cfg.actor_role!=='admin')return json({error:'الربط متوقف.'},409);
        const row=await db.prepare(`SELECT i.* FROM cepoxy_inbox i JOIN cepoxy_links l ON l.source_id=i.source_id
          WHERE i.event_id=? AND i.event_id=l.last_event_id AND i.decision NOT IN ('apply','superseded','queued')`).bind(body.event_id).first();
        if(!row)return json({error:'هذا الحدث محفوظ أو استُبدل بتحديث أحدث. حدّث الصفحة.'},409);
        const payload=validatePayload(JSON.parse(row.payload),cfg);
        await db.prepare("UPDATE cepoxy_inbox SET decision='queued' WHERE event_id=? AND decision NOT IN ('apply','superseded')").bind(body.event_id).run();
        const result=await applyEvent(db,cfg,payload,row.payload);
        return json(result,result.ok?200:409);
      }
      return json({error:'invalid_action'},400);
    }
    const cfg=await config(db);
    if(!cfg)return json({configured:false,store_name:STORE_NAME});
    const recent=await db.prepare(`SELECT i.event_id,i.source_id,i.decision,i.received_at,i.decided_at,
      i.payload,l.order_id,o.order_code FROM cepoxy_inbox i
      JOIN cepoxy_links l ON l.source_id=i.source_id AND l.last_event_id=i.event_id
      LEFT JOIN orders o ON o.id=l.order_id
      ORDER BY (i.decision NOT IN ('apply','superseded')) DESC,i.event_id DESC LIMIT 100`).all();
    const counts=await db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN i.decision='apply' THEN 1 ELSE 0 END) saved,
      SUM(CASE WHEN i.decision NOT IN ('apply','superseded') THEN 1 ELSE 0 END) review
      FROM cepoxy_links l JOIN cepoxy_inbox i ON i.event_id=l.last_event_id`).first();
    return json({configured:true,store_name:cfg.store_name,enabled:!!cfg.enabled,
      available:!!cfg.store_active&&!!cfg.actor_active&&cfg.actor_role==='admin',
      verified:!!cfg.probe_at,last_seen_at:cfg.last_seen_at,probe_at:cfg.probe_at,counts,
      events:(recent.results||[]).map(r=>{const order=JSON.parse(r.payload).order;delete r.payload;return {...r,order}})});
  }catch{return json({error:'تعذر إكمال العملية. حدّث صفحة كورفكس الرئيسية ثم حاول مجددًا.'},503)}
}
