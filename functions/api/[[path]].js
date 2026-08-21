const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function hashPassword(password, saltText = null) {
  const enc = new TextEncoder();
  const salt = saltText ? Uint8Array.from(atob(saltText), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltOut = btoa(String.fromCharCode(...salt));
  return `${saltOut}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt] = String(stored || '').split(':');
  if (!salt) return false;
  return (await hashPassword(password, salt)) === stored;
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function auth(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.display_name, u.role, u.is_active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).bind(token).first();
  return row || null;
}

function normalizePhone(value = '') {
  return String(value).replace(/[^0-9+]/g, '').trim();
}

function orderSelectSql(where = '') {
  return `SELECT o.*, u.display_name AS created_by_name, s.name AS store_name, s.phone AS store_phone FROM orders o LEFT JOIN users u ON u.id=o.created_by LEFT JOIN stores s ON s.id=o.store_id ${where}`;
}

async function ensureBusinessSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  const info = await env.DB.prepare("PRAGMA table_info(orders)").all();
  const cols = new Set((info.results || []).map(r => r.name));

  const wanted = [
    ['delivery_status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['delivery_fee', "REAL NOT NULL DEFAULT 0"],
    ['cash_collected', "REAL NOT NULL DEFAULT 0"],
    ['delivered_amount', "REAL NOT NULL DEFAULT 0"],
    ['cost_of_goods', "REAL NOT NULL DEFAULT 0"],
    ['delivered_pieces', "INTEGER NOT NULL DEFAULT 0"],
    ['returned_pieces', "INTEGER NOT NULL DEFAULT 0"],
    ['settlement_note', "TEXT NOT NULL DEFAULT ''"],
    ['settled_at', "TEXT"],
    ['store_id', "INTEGER"]
  ];

  for (const [name, type] of wanted) {
    if (!cols.has(name)) {
      await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${type}`).run();
    }
  }

  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id)').run();

  const batchInfo = await env.DB.prepare("PRAGMA table_info(print_batches)").all();
  const batchCols = new Set((batchInfo.results || []).map(r => r.name));
  if (!batchCols.has('store_id')) {
    await env.DB.prepare(`ALTER TABLE print_batches ADD COLUMN store_id INTEGER`).run();
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_print_batches_store_id ON print_batches(store_id)').run();
}

const STATUS_LABELS = {
  pending: 'قيد التوصيل',
  delivered: 'تم الاستلام',
  delivered_adjusted: 'تم الاستلام وتعديل قيمة',
  refused_fee_paid: 'رفض ودفع أجور',
  refused_no_fee: 'رفض وعدم دفع أجور',
  canceled_before_arrival: 'ملغي قبل الوصول',
  partial: 'استلام جزئي'
};

async function listOrders(url, env) {
  const q = (url.searchParams.get('q') || '').trim();
  const printed = url.searchParams.get('printed');
  const status = (url.searchParams.get('status') || '').trim();
  const storeId = url.searchParams.get('store_id');
  const fromCode = url.searchParams.get('from_code');
  const toCode = url.searchParams.get('to_code');
  const fromDate = url.searchParams.get('from_date');
  const toDate = url.searchParams.get('to_date');
  const params = [];
  const where = [];

  if (q) {
    where.push('(CAST(o.order_code AS TEXT) LIKE ? OR o.phone LIKE ? OR o.recipient_name LIKE ? OR o.detailed_address LIKE ?)');
    params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
  }
  if (printed === '0' || printed === '1') { where.push('o.printed = ?'); params.push(Number(printed)); }
  if (storeId) { where.push('o.store_id = ?'); params.push(Number(storeId)); }

  if (status) {
    if (status === 'delivered') {
      where.push("o.delivery_status IN ('delivered','delivered_adjusted')");
    } else {
      where.push('o.delivery_status = ?');
      params.push(status);
    }
  }

  if (fromCode) { where.push('o.order_code >= ?'); params.push(Number(fromCode)); }
  if (toCode) { where.push('o.order_code <= ?'); params.push(Number(toCode)); }
  if (fromDate) { where.push("date(o.created_at) >= date(?)"); params.push(fromDate); }
  if (toDate) { where.push("date(o.created_at) <= date(?)"); params.push(toDate); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const stmt = env.DB.prepare(`${orderSelectSql(clause)} ORDER BY o.id DESC LIMIT 1000`).bind(...params);
  return await stmt.all();
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = '/' + ((params.path && Array.isArray(params.path)) ? params.path.join('/') : (params.path || ''));
  const method = request.method.toUpperCase();

  try {
    if (path === '/setup' && method === 'GET') {
      const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
      return json({ needs_setup: Number(row?.c || 0) === 0 });
    }

    if (path === '/setup' && method === 'POST') {
      const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
      if (Number(row?.c || 0) > 0) return json({ error: 'تم إعداد النظام مسبقاً' }, 409);
      const body = await readBody(request);
      const username = String(body.username || '').trim();
      const displayName = String(body.display_name || '').trim();
      const password = String(body.password || '');
      if (!username || !displayName || password.length < 6) return json({ error: 'البيانات غير مكتملة، وكلمة المرور 6 أحرف على الأقل' }, 400);
      const passwordHash = await hashPassword(password);
      await env.DB.prepare('INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)')
        .bind(username, displayName, passwordHash, 'admin').run();
      return json({ ok: true });
    }

    if (path === '/login' && method === 'POST') {
      const body = await readBody(request);
      const user = await env.DB.prepare('SELECT * FROM users WHERE username=? AND is_active=1').bind(String(body.username || '').trim()).first();
      if (!user || !(await verifyPassword(String(body.password || ''), user.password_hash))) return json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401);
      const token = randomToken();
      await env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(token, user.id).run();
      return json({ token, user: { id:user.id, username:user.username, display_name:user.display_name, role:user.role } });
    }

    const me = await auth(request, env);
    if (!me) return json({ error: 'غير مصرح' }, 401);
    await ensureBusinessSchema(env);

    if (path === '/me' && method === 'GET') {
      return json({ user: { id:me.id, username:me.username, display_name:me.display_name, role:me.role } });
    }

    if (path === '/logout' && method === 'POST') {
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/,'');
      await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
      return json({ ok:true });
    }

    if (path === '/dashboard' && method === 'GET') {
      const stats = await env.DB.prepare(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN printed=0 THEN 1 ELSE 0 END) unprinted,
        SUM(CASE WHEN printed=1 THEN 1 ELSE 0 END) printed,
        SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) today,
        SUM(CASE WHEN delivery_status='delivered' THEN 1 ELSE 0 END) delivered,
        SUM(CASE WHEN delivery_status='delivered_adjusted' THEN 1 ELSE 0 END) delivered_adjusted,
        SUM(CASE WHEN delivery_status='partial' THEN 1 ELSE 0 END) partial,
        SUM(CASE WHEN delivery_status='refused_fee_paid' THEN 1 ELSE 0 END) refused_fee_paid,
        SUM(CASE WHEN delivery_status='refused_no_fee' THEN 1 ELSE 0 END) refused_no_fee,
        COALESCE(SUM(cash_collected),0) cash_collected,
        COALESCE(SUM(delivery_fee),0) delivery_fees,
        COALESCE(SUM(cost_of_goods),0) cost_of_goods,
        COALESCE(SUM(cash_collected - cost_of_goods),0) net_profit,
        COALESCE(SUM(delivered_pieces),0) delivered_pieces,
        COALESCE(SUM(returned_pieces),0) returned_pieces
        FROM orders`).first();
      const batchCount = await env.DB.prepare('SELECT COUNT(*) c FROM print_batches').first();
      return json({ ...stats, batches:Number(batchCount?.c || 0), status_labels: STATUS_LABELS });
    }


    if (path === '/stores' && method === 'GET') {
      const rows = await env.DB.prepare(`SELECT s.*,
        (SELECT COUNT(*) FROM orders o WHERE o.store_id=s.id) AS orders_count
        FROM stores s ORDER BY s.is_active DESC, s.name COLLATE NOCASE ASC`).all();
      return json({ stores: rows.results || [] });
    }

    if (path === '/stores' && method === 'POST') {
      const b = await readBody(request);
      const name = String(b.name || '').trim();
      if (!name) return json({ error:'اسم المتجر مطلوب' },400);
      try {
        const r = await env.DB.prepare(`INSERT INTO stores(name,contact_name,phone,notes) VALUES(?,?,?,?)`)
          .bind(name, String(b.contact_name||'').trim(), normalizePhone(b.phone)||String(b.phone||'').trim(), String(b.notes||'').trim()).run();
        const store = await env.DB.prepare('SELECT * FROM stores WHERE id=?').bind(r.meta.last_row_id).first();
        return json({ store },201);
      } catch (e) {
        if (String(e.message||'').toLowerCase().includes('unique')) return json({error:'اسم المتجر موجود مسبقاً'},409);
        throw e;
      }
    }

    const storeMatch = path.match(/^\/stores\/(\d+)$/);
    if (storeMatch && method === 'PUT') {
      const id = Number(storeMatch[1]);
      const b = await readBody(request);
      const name = String(b.name || '').trim();
      if (!name) return json({error:'اسم المتجر مطلوب'},400);
      await env.DB.prepare(`UPDATE stores SET name=?,contact_name=?,phone=?,notes=?,is_active=? WHERE id=?`)
        .bind(name,String(b.contact_name||'').trim(),normalizePhone(b.phone)||String(b.phone||'').trim(),String(b.notes||'').trim(),b.is_active===0?0:1,id).run();
      const store = await env.DB.prepare('SELECT * FROM stores WHERE id=?').bind(id).first();
      return json({store});
    }

    if (path === '/orders' && method === 'GET') {
      const result = await listOrders(url, env);
      return json({ orders: result.results || [] });
    }

    if (path === '/orders' && method === 'POST') {
      const b = await readBody(request);
      const name = String(b.recipient_name || '').trim();
      const phone = normalizePhone(b.phone);
      const storeId = Number(b.store_id || 0);
      if (!name || !phone) return json({ error:'الاسم ورقم الهاتف مطلوبان' }, 400);
      if (!storeId) return json({ error:'اختر المتجر صاحب الطلب' }, 400);
      const store = await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();
      if (!store) return json({error:'المتجر غير موجود أو موقوف'},400);

      const max = await env.DB.prepare('SELECT COALESCE(MAX(order_code), 4400) AS m FROM orders').first();
      const code = Number(max?.m || 4400) + 1;
      const result = await env.DB.prepare(`INSERT INTO orders(order_code,recipient_name,phone,area,detailed_address,amount,order_notes,raw_text,created_by,store_id)
        VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(code, name, phone, String(b.area||'').trim(), String(b.detailed_address||'').trim(), Number(b.amount||0), String(b.order_notes||'').trim(), String(b.raw_text||''), me.id, storeId).run();
      const order = await env.DB.prepare(orderSelectSql('WHERE o.id=?')).bind(result.meta.last_row_id).first();
      return json({ order }, 201);
    }

    const orderMatch = path.match(/^\/orders\/(\d+)$/);
    if (orderMatch && method === 'GET') {
      const order = await env.DB.prepare(orderSelectSql('WHERE o.id=?')).bind(Number(orderMatch[1])).first();
      if (!order) return json({error:'الطلب غير موجود'},404);
      return json({order});
    }
    if (orderMatch && method === 'PUT') {
      const b = await readBody(request);
      const id = Number(orderMatch[1]);
      const storeId = Number(b.store_id || 0);
      if (!storeId) return json({error:'اختر المتجر صاحب الطلب'},400);
      const store = await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();
      if (!store) return json({error:'المتجر غير موجود أو موقوف'},400);

      await env.DB.prepare(`UPDATE orders SET recipient_name=?,phone=?,area=?,detailed_address=?,amount=?,order_notes=?,store_id=?,updated_at=datetime('now') WHERE id=?`)
        .bind(String(b.recipient_name||'').trim(), normalizePhone(b.phone), String(b.area||'').trim(), String(b.detailed_address||'').trim(), Number(b.amount||0), String(b.order_notes||'').trim(), storeId, id).run();
      const order = await env.DB.prepare(orderSelectSql('WHERE o.id=?')).bind(id).first();
      return json({order});
    }


    const outcomeMatch = path.match(/^\/orders\/(\d+)\/outcome$/);
    if (outcomeMatch && method === 'PUT') {
      const id = Number(outcomeMatch[1]);
      const b = await readBody(request);
      const allowed = new Set(Object.keys(STATUS_LABELS));
      const status = allowed.has(String(b.delivery_status || '')) ? String(b.delivery_status) : 'pending';
      const deliveryFee = Number(b.delivery_fee || 0);
      const deliveredAmount = Number(b.delivered_amount || 0);
      const cashCollected = Number(b.cash_collected || 0);
      const costOfGoods = Number(b.cost_of_goods || 0);
      const deliveredPieces = Math.max(0, Number(b.delivered_pieces || 0));
      const returnedPieces = Math.max(0, Number(b.returned_pieces || 0));
      const note = String(b.settlement_note || '').trim();

      await env.DB.prepare(`UPDATE orders SET
        delivery_status=?,
        delivery_fee=?,
        delivered_amount=?,
        cash_collected=?,
        cost_of_goods=?,
        delivered_pieces=?,
        returned_pieces=?,
        settlement_note=?,
        settled_at=CASE WHEN ?='pending' THEN NULL ELSE datetime('now') END,
        updated_at=datetime('now')
        WHERE id=?`)
        .bind(status, deliveryFee, deliveredAmount, cashCollected, costOfGoods,
          deliveredPieces, returnedPieces, note, status, id).run();

      const order = await env.DB.prepare(orderSelectSql('WHERE o.id=?')).bind(id).first();
      return json({ order, status_label: STATUS_LABELS[status] || status });
    }

    if (path === '/users' && method === 'GET') {
      if (me.role !== 'admin') return json({error:'صلاحية مدير مطلوبة'},403);
      const rows = await env.DB.prepare('SELECT id,username,display_name,role,is_active,created_at FROM users ORDER BY id DESC').all();
      return json({users:rows.results||[]});
    }
    if (path === '/users' && method === 'POST') {
      if (me.role !== 'admin') return json({error:'صلاحية مدير مطلوبة'},403);
      const b = await readBody(request);
      if (!b.username || !b.display_name || String(b.password||'').length < 6) return json({error:'بيانات المستخدم غير مكتملة'},400);
      const hash = await hashPassword(String(b.password));
      await env.DB.prepare('INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)')
        .bind(String(b.username).trim(),String(b.display_name).trim(),hash,b.role==='admin'?'admin':'staff').run();
      return json({ok:true},201);
    }

    if (path === '/print-batches' && method === 'POST') {
      const b = await readBody(request);
      const ids = Array.isArray(b.order_ids) ? [...new Set(b.order_ids.map(Number).filter(Boolean))] : [];
      if (!ids.length) return json({error:'حدد طلبات للطباعة'},400);
      const placeholders = ids.map(()=>'?').join(',');
      const rows = await env.DB.prepare(`${orderSelectSql(`WHERE o.id IN (${placeholders})`)} ORDER BY o.order_code ASC`).bind(...ids).all();
      const orders = rows.results || [];
      if (!orders.length) return json({error:'لا توجد طلبات صالحة'},400);

      const storeIds=[...new Set(orders.map(o=>Number(o.store_id||0)))];
      if(storeIds.length!==1 || !storeIds[0]) return json({error:'دفعة الطباعة يجب أن تكون لمتجر واحد فقط'},400);
      const storeId=storeIds[0];

      const batchCode = `PB-${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${Math.floor(Math.random()*900+100)}`;
      const batchRes = await env.DB.prepare('INSERT INTO print_batches(batch_code,created_by,order_count,store_id) VALUES(?,?,?,?)')
        .bind(batchCode,me.id,orders.length,storeId).run();
      const batchId = batchRes.meta.last_row_id;

      for (let i=0;i<orders.length;i++) {
        await env.DB.prepare('INSERT INTO print_batch_orders(batch_id,order_id,position) VALUES(?,?,?)').bind(batchId,orders[i].id,i+1).run();
        await env.DB.prepare(`UPDATE orders SET printed=1, print_count=print_count+1,
          first_printed_at=COALESCE(first_printed_at,datetime('now')), last_printed_at=datetime('now') WHERE id=?`).bind(orders[i].id).run();
      }

      const batch=await env.DB.prepare(`SELECT b.*,u.display_name created_by_name,s.name store_name
        FROM print_batches b
        LEFT JOIN users u ON u.id=b.created_by
        LEFT JOIN stores s ON s.id=b.store_id
        WHERE b.id=?`).bind(batchId).first();

      return json({batch,orders},201);
    }

        if (path === '/print-batches' && method === 'GET') {
      const storeId=Number(url.searchParams.get('store_id')||0);
      const where=storeId?'WHERE b.store_id=?':'';
      const sql=`SELECT b.*,u.display_name created_by_name,s.name store_name
        FROM print_batches b
        LEFT JOIN users u ON u.id=b.created_by
        LEFT JOIN stores s ON s.id=b.store_id
        ${where}
        ORDER BY b.id DESC LIMIT 100`;
      const rows=storeId?await env.DB.prepare(sql).bind(storeId).all():await env.DB.prepare(sql).all();
      return json({batches:rows.results||[]});
    }

        const batchMatch = path.match(/^\/print-batches\/(\d+)$/);
    if (batchMatch && method === 'GET') {
      const batch = await env.DB.prepare(`SELECT b.*,u.display_name created_by_name,s.name store_name FROM print_batches b LEFT JOIN users u ON u.id=b.created_by LEFT JOIN stores s ON s.id=b.store_id WHERE b.id=?`).bind(Number(batchMatch[1])).first();
      if (!batch) return json({error:'دفعة الطباعة غير موجودة'},404);
      const rows = await env.DB.prepare(`${orderSelectSql('JOIN print_batch_orders pbo ON pbo.order_id=o.id WHERE pbo.batch_id=?')} ORDER BY pbo.position ASC`).bind(Number(batchMatch[1])).all();
      return json({batch,orders:rows.results||[]});
    }

    if (path === '/unprinted' && method === 'GET') {
      const storeId=Number(url.searchParams.get('store_id')||0);
      if(!storeId) return json({orders:[]});
      const rows = await env.DB.prepare(`${orderSelectSql('WHERE o.printed=0 AND o.store_id=?')} ORDER BY o.order_code ASC`).bind(storeId).all();
      return json({orders:rows.results||[]});
    }

        return json({ error:'المسار غير موجود' }, 404);
  } catch (e) {
    return json({ error: e?.message || 'حدث خطأ غير متوقع' }, 500);
  }
}
