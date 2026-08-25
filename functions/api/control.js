const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

function normalizePhone(value=''){
  const map={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
  let d=String(value||'').replace(/[٠-٩۰-۹]/g,x=>map[x]||x).replace(/\D/g,'');
  if(d.startsWith('00962'))d=d.slice(2);
  if(d.startsWith('962')&&d.length>=12)d='0'+d.slice(3);
  else if(d.length===9&&d.startsWith('7'))d='0'+d;
  return d;
}
function ntext(v=''){return String(v||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim()}
async function readBody(req){try{return await req.json()}catch{return {}}}
async function auth(request,env){
  const h=request.headers.get('authorization')||'';const token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;
  return await env.DB.prepare(`SELECT s.token,u.id,u.username,u.display_name,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}
async function ensure(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_audit_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER,order_code INTEGER,event_type TEXT NOT NULL,
    before_json TEXT NOT NULL DEFAULT '{}',after_json TEXT NOT NULL DEFAULT '{}',note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_order_audit_order_id ON order_audit_log(order_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_order_audit_created_at ON order_audit_log(created_at)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS return_reconcile_batches(
    id INTEGER PRIMARY KEY AUTOINCREMENT,file_name TEXT NOT NULL DEFAULT '',source_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS return_reconcile_rows(
    id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id INTEGER NOT NULL,source_index INTEGER NOT NULL DEFAULT 0,
    phone TEXT NOT NULL DEFAULT '',customer_name TEXT NOT NULL DEFAULT '',amount REAL NOT NULL DEFAULT 0,raw_text TEXT NOT NULL DEFAULT '',
    match_status TEXT NOT NULL DEFAULT 'missing',matched_order_id INTEGER,matched_order_code INTEGER,matched_at TEXT,
    UNIQUE(batch_id,source_index)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_return_reconcile_rows_batch ON return_reconcile_rows(batch_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_return_reconcile_rows_phone ON return_reconcile_rows(phone)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS return_reconcile_scans(
    id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id INTEGER NOT NULL,order_id INTEGER,order_code INTEGER,phone TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL,matched_row_id INTEGER,created_by INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_return_reconcile_scans_batch ON return_reconcile_scans(batch_id)').run();
}
async function batchData(env,id){
  const batch=await env.DB.prepare('SELECT * FROM return_reconcile_batches WHERE id=?').bind(id).first();
  if(!batch)return null;
  const rows=(await env.DB.prepare('SELECT * FROM return_reconcile_rows WHERE batch_id=? ORDER BY source_index,id').bind(id).all()).results||[];
  const counts={total:rows.length,matched:0,missing:0,review:0};
  for(const r of rows){if(r.match_status==='matched')counts.matched++;else if(r.match_status==='review')counts.review++;else counts.missing++}
  const extra=Number((await env.DB.prepare("SELECT COUNT(*) c FROM return_reconcile_scans WHERE batch_id=? AND result='extra'").bind(id).first())?.c||0);
  const duplicate=Number((await env.DB.prepare("SELECT COUNT(*) c FROM return_reconcile_scans WHERE batch_id=? AND result='duplicate'").bind(id).first())?.c||0);
  return {batch,rows,counts:{...counts,extra,duplicate}};
}
function scoreRow(row,order){
  let score=0;
  if(normalizePhone(row.phone)===normalizePhone(order.phone))score+=100;
  if(Number(row.amount||0)>0&&Math.abs(Number(row.amount||0)-Number(order.amount||0))<0.01)score+=20;
  const rn=ntext(row.customer_name),on=ntext(order.recipient_name);
  if(rn&&on&&(rn.includes(on)||on.includes(rn)))score+=15;
  return score;
}

export async function onRequest(context){
  const {request,env}=context;const user=await auth(request,env);if(!user)return json({error:'غير مصرح'},401);
  await ensure(env);
  const url=new URL(request.url),action=url.searchParams.get('action')||'',method=request.method.toUpperCase();

  if(method==='GET'&&action==='summary'){
    const daily=await env.DB.prepare(`SELECT
      SUM(CASE WHEN date(created_at,'+3 hours')=date('now','+3 hours') THEN 1 ELSE 0 END) today_added,
      SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted','partial') AND date(COALESCE(settled_at,updated_at),'+3 hours')=date('now','+3 hours') THEN 1 ELSE 0 END) delivered_today,
      SUM(CASE WHEN delivery_status IN ('refused_fee_paid','refused_no_fee','canceled_before_arrival') AND date(COALESCE(settled_at,updated_at),'+3 hours')=date('now','+3 hours') THEN 1 ELSE 0 END) cancelled_today,
      SUM(CASE WHEN delivery_status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN delivery_status='pending' AND julianday('now')-julianday(COALESCE(first_printed_at,created_at))>=3 THEN 1 ELSE 0 END) stale_pending,
      SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted','partial') THEN COALESCE(delivered_amount,0) ELSE 0 END) delivered_value,
      SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted','partial') THEN COALESCE(delivered_amount,0)-COALESCE(cost_of_goods,0)-COALESCE(delivery_fee,0) ELSE 0 END) gross_profit,
      SUM(CASE WHEN delivery_company_settled=0 AND delivery_status IN ('delivered','delivered_adjusted','partial','refused_fee_paid','refused_no_fee') THEN COALESCE(delivered_amount,0)-COALESCE(delivery_fee,0) ELSE 0 END) company_due
      FROM orders`).first();
    const returns=await env.DB.prepare(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN date(created_at,'+3 hours')=date('now','+3 hours') THEN 1 ELSE 0 END),0) today FROM return_events`).first();
    const openBatch=await env.DB.prepare('SELECT id FROM return_reconcile_batches ORDER BY id DESC LIMIT 1').first();
    let reconcile={matched:0,missing:0,extra:0,duplicate:0,total:0};if(openBatch){const b=await batchData(env,openBatch.id);if(b)reconcile=b.counts}
    return json({daily,returns,reconcile});
  }

  if(method==='POST'&&action==='audit'){
    const b=await readBody(request);
    await env.DB.prepare(`INSERT INTO order_audit_log(order_id,order_code,event_type,before_json,after_json,note,created_by) VALUES(?,?,?,?,?,?,?)`)
      .bind(b.order_id||null,b.order_code||null,String(b.event_type||'update').slice(0,80),JSON.stringify(b.before||{}),JSON.stringify(b.after||{}),String(b.note||'').slice(0,500),user.id).run();
    return json({ok:true});
  }

  if(method==='GET'&&action==='audit'){
    const orderId=Number(url.searchParams.get('order_id')||0);if(!orderId)return json({error:'order_id مطلوب'},400);
    const rows=(await env.DB.prepare(`SELECT a.*,u.display_name created_by_name FROM order_audit_log a LEFT JOIN users u ON u.id=a.created_by WHERE a.order_id=? ORDER BY a.id DESC LIMIT 200`).bind(orderId).all()).results||[];
    return json({rows});
  }

  if(method==='POST'&&action==='create_return_batch'){
    const b=await readBody(request),rows=Array.isArray(b.rows)?b.rows:[];if(!rows.length)return json({error:'لم يتم استخراج أي صف من الكشف'},400);
    const ins=await env.DB.prepare('INSERT INTO return_reconcile_batches(file_name,source_count,created_by) VALUES(?,?,?)').bind(String(b.file_name||''),rows.length,user.id).run();
    const id=Number(ins.meta.last_row_id);
    for(let i=0;i<rows.length;i++){
      const r=rows[i]||{};await env.DB.prepare(`INSERT INTO return_reconcile_rows(batch_id,source_index,phone,customer_name,amount,raw_text) VALUES(?,?,?,?,?,?)`)
        .bind(id,i+1,normalizePhone(r.phone||''),String(r.customer_name||'').slice(0,120),Number(r.amount||0),String(r.raw_text||'').slice(0,1000)).run();
    }
    return json(await batchData(env,id));
  }

  if(method==='GET'&&action==='batch'){
    const id=Number(url.searchParams.get('id')||0);const d=await batchData(env,id);return d?json(d):json({error:'الكشف غير موجود'},404);
  }

  if(method==='POST'&&action==='scan_return'){
    const b=await readBody(request),batchId=Number(b.batch_id||0),raw=String(b.code||'').trim();if(!batchId||!raw)return json({error:'الكشف والباركود مطلوبان'},400);
    const codeMatch=raw.match(/(\d+)\s*$/),orderCode=codeMatch?Number(codeMatch[1]):0;if(!orderCode)return json({error:'باركود غير صالح'},400);
    const order=await env.DB.prepare('SELECT id,order_code,recipient_name,phone,amount FROM orders WHERE order_code=?').bind(orderCode).first();if(!order)return json({error:'الطلب غير موجود'},404);
    const already=await env.DB.prepare('SELECT id FROM return_reconcile_scans WHERE batch_id=? AND order_id=? AND result IN (\'matched\',\'review\',\'extra\') LIMIT 1').bind(batchId,order.id).first();
    if(already){await env.DB.prepare(`INSERT INTO return_reconcile_scans(batch_id,order_id,order_code,phone,result,created_by) VALUES(?,?,?,?,?,?)`).bind(batchId,order.id,order.order_code,normalizePhone(order.phone),'duplicate',user.id).run();return json({result:'duplicate',order,batch:await batchData(env,batchId)});}
    const candidates=(await env.DB.prepare(`SELECT * FROM return_reconcile_rows WHERE batch_id=? AND phone=? AND match_status!='matched' ORDER BY id`).bind(batchId,normalizePhone(order.phone)).all()).results||[];
    if(!candidates.length){await env.DB.prepare(`INSERT INTO return_reconcile_scans(batch_id,order_id,order_code,phone,result,created_by) VALUES(?,?,?,?,?,?)`).bind(batchId,order.id,order.order_code,normalizePhone(order.phone),'extra',user.id).run();return json({result:'extra',order,batch:await batchData(env,batchId)});}
    const ranked=candidates.map(r=>({r,score:scoreRow(r,order)})).sort((a,b)=>b.score-a.score);const best=ranked[0],ambiguous=ranked.length>1&&ranked[1].score===best.score;
    const status=ambiguous?'review':'matched';
    await env.DB.prepare(`UPDATE return_reconcile_rows SET match_status=?,matched_order_id=?,matched_order_code=?,matched_at=datetime('now') WHERE id=?`).bind(status,order.id,order.order_code,best.r.id).run();
    await env.DB.prepare(`INSERT INTO return_reconcile_scans(batch_id,order_id,order_code,phone,result,matched_row_id,created_by) VALUES(?,?,?,?,?,?,?)`).bind(batchId,order.id,order.order_code,normalizePhone(order.phone),status,best.r.id,user.id).run();
    return json({result:status,order,row:best.r,batch:await batchData(env,batchId)});
  }

  return json({error:'طلب غير معروف'},404);
}
