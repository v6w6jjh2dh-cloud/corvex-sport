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

function duplicateText(value = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[ـ]/g, '')
    .toLowerCase();
}

function sameOrderSpecification(row, input) {
  return duplicateText(row.recipient_name) === duplicateText(input.recipient_name)
    && normalizePhone(row.phone) === normalizePhone(input.phone)
    && duplicateText(row.area) === duplicateText(input.area)
    && duplicateText(row.detailed_address) === duplicateText(input.detailed_address)
    && Math.round(Number(row.amount || 0) * 100) === Math.round(Number(input.amount || 0) * 100)
    && duplicateText(row.order_notes) === duplicateText(input.order_notes);
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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,username TEXT DEFAULT '',phone TEXT DEFAULT '',address TEXT DEFAULT '',
    delivered_commission REAL NOT NULL DEFAULT 0,returned_commission REAL NOT NULL DEFAULT 0,areas TEXT DEFAULT '',notes TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS courier_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,settlement_code TEXT NOT NULL UNIQUE,courier_id INTEGER NOT NULL,orders_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,returned_count INTEGER DEFAULT 0,total_due REAL DEFAULT 0,created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS courier_settlement_orders (
    settlement_id INTEGER NOT NULL,order_id INTEGER NOT NULL,commission REAL DEFAULT 0,PRIMARY KEY(settlement_id,order_id)
  )`).run();
  const ci=await env.DB.prepare("PRAGMA table_info(orders)").all(),cc=new Set((ci.results||[]).map(r=>r.name));
  if(!cc.has('courier_id'))await env.DB.prepare('ALTER TABLE orders ADD COLUMN courier_id INTEGER').run();
  if(!cc.has('courier_settled'))await env.DB.prepare('ALTER TABLE orders ADD COLUMN courier_settled INTEGER NOT NULL DEFAULT 0').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS region_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    governorate TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(group_id,name),
    FOREIGN KEY(group_id) REFERENCES region_groups(id) ON DELETE CASCADE
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS actor_permissions (
    actor_type TEXT NOT NULL,
    actor_id INTEGER NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY(actor_type,actor_id)
  )`).run();

  // V26 performance: verify counts first; seed only if defaults are actually missing.
  const expectedGroups = DEFAULT_REGION_GROUPS.length;
  const expectedRegions = DEFAULT_REGION_GROUPS.reduce((n,g)=>n+g.regions.length,0);
  const rgStats = await env.DB.prepare('SELECT COUNT(*) c FROM region_groups').first();
  const rStats = await env.DB.prepare('SELECT COUNT(*) c FROM regions').first();

  if(Number(rgStats?.c||0) < expectedGroups || Number(rStats?.c||0) < expectedRegions){
    for(let gi=0;gi<DEFAULT_REGION_GROUPS.length;gi++){
      const g=DEFAULT_REGION_GROUPS[gi];
      await env.DB.prepare('INSERT OR IGNORE INTO region_groups(name,governorate,sort_order) VALUES(?,?,?)')
        .bind(g.name,g.governorate,gi).run();
      const gr=await env.DB.prepare('SELECT id FROM region_groups WHERE name=?').bind(g.name).first();
      const gid=gr.id;
      for(let ri=0;ri<g.regions.length;ri++){
        await env.DB.prepare('INSERT OR IGNORE INTO regions(group_id,name,sort_order) VALUES(?,?,?)')
          .bind(gid,g.regions[ri],ri).run();
      }
    }
  }

  // Cheap fallback-courier check only.
  await env.DB.prepare(`INSERT INTO couriers(name,username,phone,address,delivered_commission,returned_commission,areas,notes,is_active)
    SELECT 'مندوب','','','','0','0','','مندوب افتراضي للتوزيع التلقائي',1
    WHERE NOT EXISTS (SELECT 1 FROM couriers WHERE name='مندوب')`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS store_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_code TEXT NOT NULL UNIQUE,
    store_id INTEGER NOT NULL,
    orders_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    refused_count INTEGER NOT NULL DEFAULT 0,
    collected_amount REAL NOT NULL DEFAULT 0,
    delivery_fees REAL NOT NULL DEFAULT 0,
    store_due REAL NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS store_settlement_orders (
    settlement_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    store_due REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(settlement_id,order_id)
  )`).run();

  const osi=await env.DB.prepare("PRAGMA table_info(orders)").all();
  const osc=new Set((osi.results||[]).map(r=>r.name));
  if(!osc.has('store_settled')){
    await env.DB.prepare('ALTER TABLE orders ADD COLUMN store_settled INTEGER NOT NULL DEFAULT 0').run();
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_store_settled ON orders(store_settled)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_company_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_code TEXT NOT NULL UNIQUE,
    store_id INTEGER NOT NULL,
    source_name TEXT NOT NULL DEFAULT '',
    matched_count INTEGER NOT NULL DEFAULT 0,
    unmatched_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    refused_count INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    collected_amount REAL NOT NULL DEFAULT 0,
    delivery_fees REAL NOT NULL DEFAULT 0,
    net_due REAL NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_company_settlement_orders (
    settlement_id INTEGER NOT NULL,
    order_id INTEGER,
    phone TEXT NOT NULL DEFAULT '',
    imported_status TEXT NOT NULL DEFAULT '',
    applied_status TEXT NOT NULL DEFAULT '',
    imported_amount REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    match_type TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(settlement_id,phone,order_id)
  )`).run();

  const dci=await env.DB.prepare("PRAGMA table_info(orders)").all();
  const dcc=new Set((dci.results||[]).map(r=>r.name));
  if(!dcc.has('delivery_company_settled')){
    await env.DB.prepare('ALTER TABLE orders ADD COLUMN delivery_company_settled INTEGER NOT NULL DEFAULT 0').run();
  }
  if(!dcc.has('delivery_company_settlement_id')){
    await env.DB.prepare('ALTER TABLE orders ADD COLUMN delivery_company_settlement_id INTEGER').run();
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_delivery_company_settled ON orders(delivery_company_settled)').run();
}

const DEFAULT_REGION_GROUPS = [{"name":"عمان الغربية","governorate":"عمان","regions":["تلاع العلي","خلدا","المدينة الرياضية","شارع الجامعة","الصويفية","عبدون","الجبيهة","شفا بدران","صويلح","الدوار الثامن","الدوار السابع","الدوار السادس","الدوار الخامس","الدوار الرابع","الدوار الثالث","الدوار الثاني","الدوار الأول","وادي صقرة","الرابية","الشميساني","جبل عمان","مرج الحمام","البيادر","المدينة الصناعية","طريق المطار","مكة مول","تاج مول","ناعور","ضاحية المفرق","ضاحية الرشيد","عرجان","ماحص","الفحيص","عين الباشا","البقعة","شارع الأردن","حي المنصور","أبو نصير","صافوط","شارع المدينة المنورة","عمان","أم السماق","المدينة الطبية","البنيات","الجندويل","شارع مكة","دابوق","أم أذينة","دير غبار","الجاردنز","دوار الداخليه","دوار الواحة","ضاحية الامير راشد","وادي الحداده"]},{"name":"عمان الشرقية","governorate":"عمان","regions":["طبربور","الهاشمي الشمالي","الهاشمي الجنوبي","ماركا الشمالية","ماركا الجنوبية","أم نوارة","المنارة","جبل النصر","أبو علندا","المقابلين","ضاحية الياسمين","اليادودة","خريبة السوق","سحاب","المستنده","الأشرفية","وسط البلد","رأس العين","جبل التاج","حي نزال","الذراع الغربي","جبل اللويبدة","شارع الإذاعة والتلفزيون","جبل الجوفة","القويسمة","منطقة مجهولة","جبل الحديد","الوحدات","النزهة","شارع الإستقلال","رغدان","المحطة","المصدار","جبل الحسين","ضاحية الأقصى","جبل المريخ","جبل القصور","الجبل الأخضر","جاوا","الجويدة","ضاحية الأمير حسن","العبدلي","جبل النظيف","جبل الزهور","وادي الرمم","شارع الحرية","ضاحية الحاج حسن","الموقر","طريق الحزام","صالحية العابد","جبل القلعة","مخيم الحسين","ضاحية الاستقلال","دوار الشرق الاوسط","دوار المشاغل","حي عدن","حي ام تينه","كلية حطين","دوار الجمرك","الرجم الشامي","اللبن","أم الحيران"]},{"name":"الزرقاء","governorate":"الزرقاء","regions":["حي حمزة","حي الأحمد","حي نصار","شومر","التطوير الحضري","القادسية","جريبا","الجبل الشمالي","مخيم شلنر","المشيرفة","البيبسي","إسكان هاشم","حي الحسين","العراتفة","حي الجندي","المنتزهات","عوجان","جبل الأمير حسن","جبل الأميرة رحمة","جبل الأبيض","ضاحية مكة","ضاحية الأميرة هيا","زواهرة","جبل طارق","الجامعة الهاشمية","الزرقاء الجديدة","الزرقاء وسط البلد","الرصيفة","وادي الحجر","جبل الأمير طلال","فندق الجوابرة","ضاحية المدينة المنورة","شارع 16","جبل الأمير فيصل","شارع الكرامة","شارع 36","مستشفى الزرقاء الحكومي","جبل المغير","الغويرية","مدينة الشرق","جناعة","حي رمزي","حي معصوم","جبل الزيتون","حي الرشيد","الزرقاء","العالوك"]},{"name":"إربد","governorate":"إربد","regions":["لواء الكورة","جديتا","الحصن","الحي الشرقي","الحي الجنوبي","كفريوبا","الخيرية","شارع فلسطين","البارحة","جامعة العلوم والتكنلوجيا","جامعة اليرموك","المزار الشمالي","إربد","كفر أسد","الوسطية","زحر","دوقرة","كفر عوان","كفر راكب","أشرفية إربد","كفرالما","دير أبو سعيد","دير السعنة","إربد كفريوبا","بيت يافا","حوفا الوسطية","كفر ابيل","خراج إربد","قم إربد","قميم","البلد إربد","شارع إيدون","شارع الرشيد","مستشفى بديعة","حي التركمان","شارع الهاشمي إربد","مجمع الغور القديم","مجمع الغور الجديد","المركزية","الأحداث","حي الطويل","حي القصيل","ضيضون","النعيمة","حوفا","حبكا","مخيم الحصن","الصريح","ايدون","دوار العيادات","قصر العيادات","قصر العوادين","إربد شارع الجامعة","إربد مول","حي الراهبات","دوار اللوازم","دوار اليوسفي","كلية غرناطة","مستشفى الراهبات","كارفور إربد","ضاحية الحسين إربد","علياء إربد","حي الأطباء","حي المهندسين","أربيلا مول","دوار القبة","مجمع عمان الجديد","دوار الثقافة","شارع البتراء إربد","حدائق الملك عبد الله إربد","المغير إربد","بشرى","حي المطلع","شارع القدس إربد","بيت رأس إربد","حي المطارق","حنينا إربد","بني كنانة","إم قيس","المنصورة إربد","ملكا","ابدر","حاتم إربد","سمر إربد","حب رأس إربد","كفر سوم","يوبلا","حرتا","حميمة إربد","كفر جايز","عالعال","حكما","حوارة","المدينة الصناعية إربد","شارع الثلاثين إربد","السنبلة إربد","بلاط الشهيد","حديقة الزهراء","فوعرا","مخيم إربد","إم الجدايل","حديقة تونس - تونس","بردا - إربد","ميدان الشهداء","دوار الدرة","المجمع الشمالي - إربد","حور - إربد","كتم","زبدة","صما - إربد","سال","دوار سال الصغير","دوار سال الكبير","سيتي سينتر - إربد","دوار البيضة - إربد","دوار الـ M.K - إربد","سحم إربد","مستشفى الأميرة بسمة"]},{"name":"جرش","governorate":"جرش","regions":["نادرة","ساكب","مخيم غزة","تل الرمان","المصطبة","سلحوب","جرش","الكتة","قفقفا","مستشفى الأميرة هيا","برما","بليلا","كفر خل","ريمون","إم بطيمة","جامعة جرش","دبين","سوق","فندق غصن الزيتون","جبة","حلاوة","هاشمية عجلون","خربة الوهدانة","سليخات","عنجرة","رأس منيف","الزراعة","راجب","بيرين"]},{"name":"عجلون","governorate":"عجلون","regions":["عبين","كفرنجة","عجلون"]},{"name":"المفرق","governorate":"المفرق","regions":["الضليل","مخيم الزعتري","إم الجمال","الدفيانة","المفرق","الهاشمية","بلعما","الازرق","الحلابات","المنطقة الحره","البادية الشمالية"]},{"name":"السلط","governorate":"البلقاء","regions":["السلط","الكماليه","السرو","ماحص","زي","العارضه","الفجيص","الرميمين","اليزيديه","علان","عيرا","وادي الحور","يرقا","ام الجوزه","بدر الجديدة"]},{"name":"الرمثا","governorate":"إربد","regions":["البويضه","الطرة","الشجرة","عمراوة","الذنيبه"]},{"name":"وادي رم","governorate":"العقبة","regions":["وادي رم","الديسي"]},{"name":"البترا","governorate":"معان","regions":["البترا"]},{"name":"وادي موسى","governorate":"معان","regions":["وادي موسى"]},{"name":"الأغوار الجنوبية","governorate":"الأغوار الجنوبية","regions":["الغور الصافي","لواء الجيزة","الأغوار الجنوبية","الكرامة","الرامة","ام الرصاص","وادي عربة","الاغوار الجنوبية"]},{"name":"الكرك","governorate":"الكرك","regions":["القصر","الكرك","الحسينية","المزار الجنوبي","الفج","المريغه","وادي ابن حماد","الزغيه","ام رمان","الوسيه","منشية ابو حمور","الصبيحات","زحوم","المامونيه","مدين","مرود","النجاصه","العدنانيه","المحموديه","عزرة","عيتون"]},{"name":"الطفيله","governorate":"الطفيلة","regions":["الطفيلة","القادسيه","الحسا","مخفر الشهداء","البربيطه","عفرا","اللعبان","ابو بنا","شيبظم","العيص","عابدر","الحرير","المعطن","ارحاب","مجادل","عيمه","العين البيضا","السلع"]},{"name":"العقبة","governorate":"العقبة","regions":["القويره","العقبة"]},{"name":"معان","governorate":"معان","regions":["الشوبك","معان"]},{"name":"مأدبا","governorate":"مأدبا","regions":["مأدبا","زيزياء","ذيبان","مليح","ماعين","ام العمد","ام البساتين"]},{"name":"الصحراوي","governorate":"الصحراوي","regions":["القطرانة","الحسينية","سد السلطاني","ارينبة الغربية","ارينبة الشرقية","الحسا","الصحراوي"]},{"name":"الاغوار الشمالية","governorate":"الأغوار الشمالية","regions":["ديرعلا","الشونة الشمالية","الشونة الجنوبية","الاغوار الشمالية","البحر الميت"]}];


const ALL_PERMISSIONS = [
  'dashboard','stores','orders_add','orders_view','orders_edit','orders_status',
  'couriers','couriers_add','couriers_edit','couriers_delete','couriers_accounting',
  'print','batches','reports','regions','regions_edit','users','permissions'
];

async function permissionsFor(env,actorType,actorId){
  const r=await env.DB.prepare('SELECT permissions_json FROM actor_permissions WHERE actor_type=? AND actor_id=?').bind(actorType,actorId).first();
  try{return r?JSON.parse(r.permissions_json||'[]'):[]}catch{return []}
}
async function userPermissions(env,user){
  if(user.role==='admin')return ALL_PERMISSIONS;
  return await permissionsFor(env,'user',user.id);
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
      await ensureBusinessSchema(env);
      return json({ ok: true });
    }

    if (path === '/login' && method === 'POST') {
      const body = await readBody(request);
      const user = await env.DB.prepare('SELECT * FROM users WHERE username=? AND is_active=1').bind(String(body.username || '').trim()).first();
      if (!user || !(await verifyPassword(String(body.password || ''), user.password_hash))) return json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401);
      const token = randomToken();
      await env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(token, user.id).run();
      return json({ token, user: { id:user.id, username:user.username, display_name:user.display_name, role:user.role, permissions:await userPermissions(env,user) } });
    }

    const me = await auth(request, env);
    if (!me) return json({ error: 'غير مصرح' }, 401);
    if (path === '/migrate' && method === 'POST') {
      if (me.role !== 'admin') return json({error:'صلاحية مدير مطلوبة'},403);
      await ensureBusinessSchema(env);
      return json({ok:true});
    }

    if (path === '/me' && method === 'GET') {
      return json({ user: { id:me.id, username:me.username, display_name:me.display_name, role:me.role, permissions:await userPermissions(env,me) } });
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
        SUM(CASE WHEN date(first_printed_at)=date('now') THEN 1 ELSE 0 END) outgoing_today,
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

      const storeRows = await env.DB.prepare(`SELECT
        s.id store_id,
        s.name store_name,
        COUNT(o.id) outgoing_count
        FROM stores s
        LEFT JOIN orders o ON o.store_id=s.id AND date(o.first_printed_at)=date('now')
        WHERE s.is_active=1
        GROUP BY s.id,s.name
        HAVING COUNT(o.id) > 0
        ORDER BY outgoing_count DESC,s.name ASC`).all();

      return json({
        ...stats,
        batches:Number(batchCount?.c || 0),
        outgoing_by_store:storeRows.results||[],
        status_labels: STATUS_LABELS
      });
    }




    if(path==='/outgoing-report'&&method==='GET'){
      const from=(url.searchParams.get('from_date')||'').trim();
      const to=(url.searchParams.get('to_date')||'').trim();
      const storeId=Number(url.searchParams.get('store_id')||0);
      const where=["o.first_printed_at IS NOT NULL"];
      const params=[];
      if(from){where.push("date(o.first_printed_at)>=date(?)");params.push(from)}
      if(to){where.push("date(o.first_printed_at)<=date(?)");params.push(to)}
      if(storeId){where.push("o.store_id=?");params.push(storeId)}

      const rows=await env.DB.prepare(`SELECT
        date(o.first_printed_at) print_date,
        o.store_id,
        s.name store_name,
        COUNT(*) orders_count
        FROM orders o
        LEFT JOIN stores s ON s.id=o.store_id
        WHERE ${where.join(' AND ')}
        GROUP BY date(o.first_printed_at),o.store_id,s.name
        ORDER BY print_date DESC,orders_count DESC`).bind(...params).all();

      const total=await env.DB.prepare(`SELECT COUNT(*) c FROM orders o WHERE ${where.join(' AND ')}`).bind(...params).first();

      return json({rows:rows.results||[],total:Number(total?.c||0)});
    }

    if(path==='/couriers'&&method==='GET'){
      const r=await env.DB.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id=c.id) assigned_count,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id=c.id AND o.delivery_status IN ('delivered','delivered_adjusted')) delivered_count,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id=c.id AND o.delivery_status IN ('refused_fee_paid','refused_no_fee','canceled_before_arrival')) returned_count
      FROM couriers c ORDER BY c.is_active DESC,c.name`).all();
      return json({couriers:(r.results||[]).map(x=>({...x,delivery_rate:Number(x.assigned_count||0)?Math.round(Number(x.delivered_count||0)*100/Number(x.assigned_count||0)):0}))});
    }
    if(path==='/couriers'&&method==='POST'){
      const b=await readBody(request);if(!String(b.name||'').trim())return json({error:'اسم المندوب مطلوب'},400);
      await env.DB.prepare('INSERT INTO couriers(name,username,phone,address,delivered_commission,returned_commission,areas,notes) VALUES(?,?,?,?,?,?,?,?)')
      .bind(String(b.name).trim(),String(b.username||''),String(b.phone||''),String(b.address||''),Number(b.delivered_commission||0),Number(b.returned_commission||0),String(b.areas||''),String(b.notes||'')).run();
      return json({ok:true},201);
    }

    const courierCrud=path.match(/^\/couriers\/(\d+)$/);
    if(courierCrud&&method==='GET'){
      const courier=await env.DB.prepare('SELECT * FROM couriers WHERE id=?').bind(Number(courierCrud[1])).first();
      if(!courier)return json({error:'المندوب غير موجود'},404);
      return json({courier});
    }
    if(courierCrud&&method==='PUT'){
      const id=Number(courierCrud[1]),b=await readBody(request);
      if(!String(b.name||'').trim())return json({error:'اسم المندوب مطلوب'},400);
      await env.DB.prepare(`UPDATE couriers SET name=?,username=?,phone=?,address=?,delivered_commission=?,returned_commission=?,areas=?,notes=?,is_active=? WHERE id=?`)
        .bind(String(b.name).trim(),String(b.username||''),String(b.phone||''),String(b.address||''),Number(b.delivered_commission||0),Number(b.returned_commission||0),String(b.areas||''),String(b.notes||''),b.is_active===0?0:1,id).run();
      return json({courier:await env.DB.prepare('SELECT * FROM couriers WHERE id=?').bind(id).first()});
    }
    if(courierCrud&&method==='DELETE'){
      const id=Number(courierCrud[1]);
      const used=await env.DB.prepare('SELECT COUNT(*) c FROM orders WHERE courier_id=?').bind(id).first();
      if(Number(used?.c||0)>0){
        await env.DB.prepare('UPDATE couriers SET is_active=0 WHERE id=?').bind(id).run();
        return json({ok:true,disabled:true});
      }
      await env.DB.prepare('DELETE FROM actor_permissions WHERE actor_type="courier" AND actor_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM couriers WHERE id=?').bind(id).run();
      return json({ok:true,deleted:true});
    }


    if(path==='/courier-custody'&&method==='GET'){
      const cid=Number(url.searchParams.get('courier_id')||0);
      if(!cid)return json({error:'حدد المندوب'},400);

      const courier=await env.DB.prepare('SELECT * FROM couriers WHERE id=?').bind(cid).first();
      if(!courier)return json({error:'المندوب غير موجود'},404);

      const summary=await env.DB.prepare(`SELECT
        COUNT(*) assigned_count,
        COALESCE(SUM(amount),0) assigned_value,
        SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted') THEN 1 ELSE 0 END) delivered_count,
        SUM(CASE WHEN delivery_status IN ('refused_fee_paid','refused_no_fee','canceled_before_arrival') THEN 1 ELSE 0 END) refused_count,
        SUM(CASE WHEN delivery_status='pending' THEN 1 ELSE 0 END) pending_count,
        COALESCE(SUM(CASE WHEN delivery_status='pending' THEN amount ELSE 0 END),0) pending_value,
        COALESCE(SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted') THEN cash_collected ELSE 0 END),0) cash_collected
        FROM orders
        WHERE courier_id=? AND first_printed_at IS NOT NULL`).bind(cid).first();

      return json({courier,summary});
    }

    if(path==='/courier-settlements'&&method==='GET'){
      const cid=Number(url.searchParams.get('courier_id')||0);
      const sql=`SELECT cs.*,c.name courier_name,u.display_name created_by_name
        FROM courier_settlements cs
        LEFT JOIN couriers c ON c.id=cs.courier_id
        LEFT JOIN users u ON u.id=cs.created_by
        ${cid?'WHERE cs.courier_id=?':''}
        ORDER BY cs.id DESC LIMIT 300`;
      const rows=cid?await env.DB.prepare(sql).bind(cid).all():await env.DB.prepare(sql).all();
      return json({settlements:rows.results||[]});
    }

    const courierSettlementMatch=path.match(/^\/courier-settlements\/(\d+)$/);
    if(courierSettlementMatch&&method==='GET'){
      const settlement=await env.DB.prepare(`SELECT cs.*,c.name courier_name,u.display_name created_by_name
        FROM courier_settlements cs
        LEFT JOIN couriers c ON c.id=cs.courier_id
        LEFT JOIN users u ON u.id=cs.created_by
        WHERE cs.id=?`).bind(Number(courierSettlementMatch[1])).first();
      return json({settlement});
    }

    if(path==='/courier-eligible-orders'&&method==='GET'){
      const cid=Number(url.searchParams.get('courier_id')||0);
      const r=await env.DB.prepare(`${orderSelectSql("WHERE o.courier_id=? AND o.courier_settled=0 AND o.delivery_status!='pending'")} ORDER BY o.id DESC`).bind(cid).all();
      return json({orders:r.results||[]});
    }
    if(path==='/courier-settlements'&&method==='POST'){
      const b=await readBody(request),cid=Number(b.courier_id||0),ids=(b.order_ids||[]).map(Number).filter(Boolean);
      if(!cid||!ids.length)return json({error:'اختر الطلبات'},400);
      const c=await env.DB.prepare('SELECT * FROM couriers WHERE id=?').bind(cid).first(),ph=ids.map(()=>'?').join(',');
      const r=await env.DB.prepare(`${orderSelectSql(`WHERE o.id IN (${ph}) AND o.courier_id=? AND o.courier_settled=0`)} ORDER BY o.id`).bind(...ids,cid).all();
      let dc=0,rc=0,total=0,vals=[];
      for(const o of (r.results||[])){let v=0;if(['delivered','delivered_adjusted'].includes(o.delivery_status)){dc++;v=Number(c.delivered_commission||0)}else{rc++;v=Number(c.returned_commission||0)}vals.push([o.id,v]);total+=v}
      const code='CS-'+Date.now(),s=await env.DB.prepare('INSERT INTO courier_settlements(settlement_code,courier_id,orders_count,delivered_count,returned_count,total_due,created_by) VALUES(?,?,?,?,?,?,?)').bind(code,cid,vals.length,dc,rc,total,me.id).run();
      for(const [oid,v] of vals){await env.DB.prepare('INSERT INTO courier_settlement_orders(settlement_id,order_id,commission) VALUES(?,?,?)').bind(s.meta.last_row_id,oid,v).run();await env.DB.prepare('UPDATE orders SET courier_settled=1 WHERE id=?').bind(oid).run()}
      return json({settlement:{settlement_code:code,total_due:total}});
    }

    if(path==='/regions'&&method==='GET'){
      const gs=await env.DB.prepare('SELECT * FROM region_groups ORDER BY sort_order,id').all();
      const rs=await env.DB.prepare('SELECT * FROM regions ORDER BY group_id,sort_order,id').all();
      const groups=(gs.results||[]).map(g=>({...g,regions:(rs.results||[]).filter(r=>r.group_id===g.id)}));
      return json({groups});
    }
    if(path==='/region-groups'&&method==='POST'){
      const b=await readBody(request),name=String(b.name||'').trim(),gov=String(b.governorate||'').trim();
      if(!name)return json({error:'اسم المجموعة مطلوب'},400);
      const r=await env.DB.prepare('INSERT INTO region_groups(name,governorate,sort_order) VALUES(?,?,999)').bind(name,gov||name).run();
      return json({id:r.meta.last_row_id},201);
    }
    const rgm=path.match(/^\/region-groups\/(\d+)$/);
    if(rgm&&method==='PUT'){
      const b=await readBody(request);
      await env.DB.prepare('UPDATE region_groups SET name=?,governorate=? WHERE id=?').bind(String(b.name||'').trim(),String(b.governorate||'').trim(),Number(rgm[1])).run();
      return json({ok:true});
    }
    if(rgm&&method==='DELETE'){
      await env.DB.prepare('DELETE FROM regions WHERE group_id=?').bind(Number(rgm[1])).run();
      await env.DB.prepare('DELETE FROM region_groups WHERE id=?').bind(Number(rgm[1])).run();
      return json({ok:true});
    }
    if(path==='/regions'&&method==='POST'){
      const b=await readBody(request),name=String(b.name||'').trim(),gid=Number(b.group_id||0);
      if(!gid||!name)return json({error:'المجموعة واسم المنطقة مطلوبان'},400);
      await env.DB.prepare('INSERT OR IGNORE INTO regions(group_id,name,sort_order) VALUES(?,?,999)').bind(gid,name).run();
      return json({ok:true},201);
    }
    const rm=path.match(/^\/regions\/(\d+)$/);
    if(rm&&method==='PUT'){
      const b=await readBody(request);
      await env.DB.prepare('UPDATE regions SET name=? WHERE id=?').bind(String(b.name||'').trim(),Number(rm[1])).run();
      return json({ok:true});
    }
    if(rm&&method==='DELETE'){
      await env.DB.prepare('DELETE FROM regions WHERE id=?').bind(Number(rm[1])).run();
      return json({ok:true});
    }

    if(path==='/permissions'&&method==='GET'){
      if(me.role!=='admin')return json({error:'صلاحية مدير مطلوبة'},403);
      const users=await env.DB.prepare('SELECT id,display_name name,username,is_active FROM users ORDER BY id').all();
      const couriers=await env.DB.prepare('SELECT id,name,username,is_active FROM couriers ORDER BY id').all();
      const rows=await env.DB.prepare('SELECT * FROM actor_permissions').all();
      return json({all_permissions:ALL_PERMISSIONS,users:users.results||[],couriers:couriers.results||[],permissions:rows.results||[]});
    }
    if(path==='/permissions'&&method==='PUT'){
      if(me.role!=='admin')return json({error:'صلاحية مدير مطلوبة'},403);
      const b=await readBody(request),type=b.actor_type==='courier'?'courier':'user',id=Number(b.actor_id||0);
      const perms=Array.isArray(b.permissions)?b.permissions.filter(p=>ALL_PERMISSIONS.includes(p)):[];
      if(!id)return json({error:'حدد الحساب'},400);
      await env.DB.prepare(`INSERT INTO actor_permissions(actor_type,actor_id,permissions_json) VALUES(?,?,?)
        ON CONFLICT(actor_type,actor_id) DO UPDATE SET permissions_json=excluded.permissions_json`).bind(type,id,JSON.stringify(perms)).run();
      return json({ok:true});
    }



    if(path==='/delivery-reconcile/preview'&&method==='POST'){
      const b=await readBody(request);
      const storeId=Number(b.store_id||0);
      const rows=Array.isArray(b.rows)?b.rows.slice(0,3000):[];
      if(!storeId)return json({error:'اختر المتجر أولاً'},400);
      if(!rows.length)return json({error:'الكشف فارغ'},400);

      const ordersRes=await env.DB.prepare(`${orderSelectSql('WHERE o.store_id=? AND o.delivery_company_settled=0')} ORDER BY o.id DESC`)
        .bind(storeId).all();
      const orders=ordersRes.results||[];
      const byPhone=new Map();

      for(const o of orders){
        const p=normalizePhone(o.phone);
        if(!p)continue;
        if(!byPhone.has(p))byPhone.set(p,[]);
        byPhone.get(p).push(o);
      }

      const result=[];
      let matched=0,duplicate=0,unmatched=0;

      for(let i=0;i<rows.length;i++){
        const row=rows[i]||{};
        const phone=normalizePhone(row.phone);
        const candidates=phone?(byPhone.get(phone)||[]):[];

        if(!phone||candidates.length===0){
          unmatched++;
          result.push({row_index:i+1,phone,status:String(row.status||''),amount:Number(row.amount||0),note:String(row.note||''),match_type:'unmatched',candidates:[]});
        }else if(candidates.length===1){
          matched++;
          result.push({row_index:i+1,phone,status:String(row.status||''),amount:Number(row.amount||0),note:String(row.note||''),match_type:'matched',order:candidates[0],candidates:candidates});
        }else{
          duplicate++;
          result.push({row_index:i+1,phone,status:String(row.status||''),amount:Number(row.amount||0),note:String(row.note||''),match_type:'duplicate',candidates:candidates});
        }
      }

      return json({rows:result,summary:{total:rows.length,matched,duplicate,unmatched}});
    }

    if(path==='/delivery-reconcile/commit'&&method==='POST'){
      const b=await readBody(request);
      const storeId=Number(b.store_id||0);
      const sourceName=String(b.source_name||'').trim();
      const rows=Array.isArray(b.rows)?b.rows.slice(0,3000):[];
      if(!storeId)return json({error:'اختر المتجر'},400);
      if(!rows.length)return json({error:'لا توجد نتائج للاعتماد'},400);

      const accepted=[];
      let unmatched=0,duplicate=0;

      const storeOrdersRes=await env.DB.prepare(`${orderSelectSql('WHERE o.store_id=? AND o.delivery_company_settled=0')}`)
        .bind(storeId).all();
      const orderById=new Map((storeOrdersRes.results||[]).map(o=>[Number(o.id),o]));

      for(const row of rows){
        const orderId=Number(row.order_id||0);
        if(!orderId){
          if(row.match_type==='duplicate')duplicate++;
          else unmatched++;
          continue;
        }
        const order=orderById.get(orderId);
        if(!order)continue;

        let status=String(row.status||'pending');
        if(!Object.prototype.hasOwnProperty.call(STATUS_LABELS,status))status='pending';

        const importedAmount=Math.max(0,Number(row.amount||0));
        if(status==='delivered' && importedAmount>0 && Math.abs(importedAmount-Number(order.amount||0))>0.001){
          status='delivered_adjusted';
        }

        const delivered=['delivered','delivered_adjusted'].includes(status);
        const partial=status==='partial';
        const feePaid=status==='refused_fee_paid';
        const deliveryFee=(delivered||partial||feePaid)?Number(order.delivery_fee||2):0;
        const cashCollected=(delivered||partial)?importedAmount:0;

        accepted.push({
          order,
          status,
          importedAmount,
          cashCollected,
          deliveryFee,
          note:String(row.note||'').trim(),
          phone:normalizePhone(row.phone||order.phone),
          match_type:String(row.match_type||'matched')
        });
      }

      if(!accepted.length)return json({error:'لا توجد طلبات مطابقة لاعتمادها'},400);

      let deliveredCount=0,refusedCount=0,pendingCount=0,collected=0,fees=0;
      for(const x of accepted){
        if(['delivered','delivered_adjusted','partial'].includes(x.status))deliveredCount++;
        else if(['refused_fee_paid','refused_no_fee','canceled_before_arrival'].includes(x.status))refusedCount++;
        else pendingCount++;
        collected+=x.cashCollected;
        fees+=x.deliveryFee;
      }

      const code='DC-'+Date.now();
      const settlementRes=await env.DB.prepare(`INSERT INTO delivery_company_settlements(
        settlement_code,store_id,source_name,matched_count,unmatched_count,duplicate_count,
        delivered_count,refused_count,pending_count,collected_amount,delivery_fees,net_due,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(code,storeId,sourceName,accepted.length,unmatched,duplicate,deliveredCount,refusedCount,pendingCount,collected,fees,collected-fees,me.id).run();
      const settlementId=settlementRes.meta.last_row_id;

      const statements=[];
      for(const x of accepted){
        const finalSettled=x.status==='pending'?0:1;
        statements.push(
          env.DB.prepare(`UPDATE orders SET
            delivery_status=?,
            delivered_amount=?,
            cash_collected=?,
            delivery_fee=?,
            settlement_note=CASE WHEN ?='' THEN settlement_note ELSE ? END,
            settled_at=CASE WHEN ?='pending' THEN NULL ELSE datetime('now') END,
            delivery_company_settled=?,
            delivery_company_settlement_id=?,
            updated_at=datetime('now')
            WHERE id=?`)
            .bind(x.status,x.importedAmount,x.cashCollected,x.deliveryFee,x.note,x.note,x.status,finalSettled,settlementId,x.order.id)
        );
        statements.push(
          env.DB.prepare(`INSERT INTO delivery_company_settlement_orders(
            settlement_id,order_id,phone,imported_status,applied_status,imported_amount,note,match_type
          ) VALUES(?,?,?,?,?,?,?,?)`)
            .bind(settlementId,x.order.id,x.phone,String(x.status),x.status,x.importedAmount,x.note,x.match_type)
        );
      }

      for(let i=0;i<statements.length;i+=40){
        await env.DB.batch(statements.slice(i,i+40));
      }

      return json({settlement:{
        id:settlementId,settlement_code:code,matched_count:accepted.length,
        unmatched_count:unmatched,duplicate_count:duplicate,
        delivered_count:deliveredCount,refused_count:refusedCount,pending_count:pendingCount,
        collected_amount:collected,delivery_fees:fees,net_due:collected-fees
      }});
    }

    if(path==='/delivery-reconcile/history'&&method==='GET'){
      const storeId=Number(url.searchParams.get('store_id')||0);
      const sql=`SELECT d.*,s.name store_name,u.display_name created_by_name
        FROM delivery_company_settlements d
        LEFT JOIN stores s ON s.id=d.store_id
        LEFT JOIN users u ON u.id=d.created_by
        ${storeId?'WHERE d.store_id=?':''}
        ORDER BY d.id DESC LIMIT 200`;
      const rows=storeId?await env.DB.prepare(sql).bind(storeId).all():await env.DB.prepare(sql).all();
      return json({settlements:rows.results||[]});
    }

    if(path==='/store-account'&&method==='GET'){
      const sid=Number(url.searchParams.get('store_id')||0);
      if(!sid)return json({error:'حدد المتجر'},400);

      const store=await env.DB.prepare('SELECT * FROM stores WHERE id=?').bind(sid).first();
      if(!store)return json({error:'المتجر غير موجود'},404);

      const summary=await env.DB.prepare(`SELECT
        COUNT(*) total_count,
        SUM(CASE WHEN first_printed_at IS NOT NULL THEN 1 ELSE 0 END) outgoing_count,
        SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted') THEN 1 ELSE 0 END) delivered_count,
        SUM(CASE WHEN delivery_status IN ('refused_fee_paid','refused_no_fee','canceled_before_arrival') THEN 1 ELSE 0 END) refused_count,
        SUM(CASE WHEN delivery_status='pending' THEN 1 ELSE 0 END) pending_count,
        COALESCE(SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted') THEN cash_collected ELSE 0 END),0) collected_amount,
        COALESCE(SUM(CASE WHEN delivery_status IN ('delivered','delivered_adjusted','refused_fee_paid') THEN delivery_fee ELSE 0 END),0) delivery_fees
        FROM orders
        WHERE store_id=?`).bind(sid).first();

      return json({store,summary});
    }

    if(path==='/store-settlement-eligible'&&method==='GET'){
      const sid=Number(url.searchParams.get('store_id')||0);
      if(!sid)return json({orders:[]});

      const rows=await env.DB.prepare(
        `${orderSelectSql("WHERE o.store_id=? AND o.store_settled=0 AND o.delivery_status!='pending'")} ORDER BY o.id DESC`
      ).bind(sid).all();

      return json({orders:rows.results||[]});
    }

    if(path==='/store-settlements'&&method==='GET'){
      const sid=Number(url.searchParams.get('store_id')||0);
      const sql=`SELECT ss.*,s.name store_name,u.display_name created_by_name
        FROM store_settlements ss
        LEFT JOIN stores s ON s.id=ss.store_id
        LEFT JOIN users u ON u.id=ss.created_by
        ${sid?'WHERE ss.store_id=?':''}
        ORDER BY ss.id DESC LIMIT 300`;
      const rows=sid?await env.DB.prepare(sql).bind(sid).all():await env.DB.prepare(sql).all();
      return json({settlements:rows.results||[]});
    }

    if(path==='/store-settlements'&&method==='POST'){
      const b=await readBody(request);
      const sid=Number(b.store_id||0);
      const ids=Array.isArray(b.order_ids)?[...new Set(b.order_ids.map(Number).filter(Boolean))]:[];
      if(!sid||!ids.length)return json({error:'اختر الطلبات'},400);

      const ph=ids.map(()=>'?').join(',');
      const rows=await env.DB.prepare(
        `${orderSelectSql(`WHERE o.id IN (${ph}) AND o.store_id=? AND o.store_settled=0 AND o.delivery_status!='pending'`)} ORDER BY o.id`
      ).bind(...ids,sid).all();

      const orders=rows.results||[];
      if(!orders.length)return json({error:'لا توجد طلبات قابلة للمحاسبة'},400);

      let delivered=0,refused=0,collected=0,fees=0,due=0;
      const vals=[];

      for(const o of orders){
        const isDelivered=['delivered','delivered_adjusted'].includes(o.delivery_status);
        const isFeeRefused=o.delivery_status==='refused_fee_paid';

        if(isDelivered)delivered++;
        else refused++;

        const cash=isDelivered?Number(o.cash_collected||0):0;
        const fee=(isDelivered||isFeeRefused)?Number(o.delivery_fee||0):0;
        const orderDue=Math.max(0,cash-fee);

        collected+=cash;
        fees+=fee;
        due+=orderDue;
        vals.push([o.id,orderDue]);
      }

      const code='SS-'+Date.now();
      const result=await env.DB.prepare(`INSERT INTO store_settlements(
        settlement_code,store_id,orders_count,delivered_count,refused_count,
        collected_amount,delivery_fees,store_due,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(code,sid,orders.length,delivered,refused,collected,fees,due,me.id).run();

      for(const [oid,orderDue] of vals){
        await env.DB.prepare('INSERT INTO store_settlement_orders(settlement_id,order_id,store_due) VALUES(?,?,?)')
          .bind(result.meta.last_row_id,oid,orderDue).run();
        await env.DB.prepare('UPDATE orders SET store_settled=1 WHERE id=?').bind(oid).run();
      }

      return json({
        settlement:{
          id:result.meta.last_row_id,
          settlement_code:code,
          orders_count:orders.length,
          delivered_count:delivered,
          refused_count:refused,
          collected_amount:collected,
          delivery_fees:fees,
          store_due:due
        }
      });
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
      const name = String(b.recipient_name || '').trim() || 'لا يوجد';
      const phone = normalizePhone(b.phone);
      const storeId = Number(b.store_id || 0);
      let courierId = Number(b.courier_id || 0);

      if (!phone) return json({ error:'رقم الهاتف مطلوب' }, 400);
      if (!storeId) return json({ error:'اختر المتجر صاحب الطلب' }, 400);

      const store = await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();
      if (!store) return json({error:'المتجر غير موجود أو موقوف'},400);

      // Prevent an identical order from being entered twice during the same Jordan calendar day.
      // The courier and employee are intentionally ignored: matching the customer's full order
      // specification is enough to treat the second submission as a duplicate.
      const incomingSpec = {
        recipient_name: name,
        phone,
        area: String(b.area||'').trim(),
        detailed_address: String(b.detailed_address||'').trim(),
        amount: Number(b.amount||0),
        order_notes: String(b.order_notes||'').trim()
      };
      const todayCandidates = await env.DB.prepare(`
        SELECT id,order_code,recipient_name,phone,area,detailed_address,amount,order_notes
        FROM orders
        WHERE store_id=? AND phone=?
          AND date(created_at,'+3 hours')=date('now','+3 hours')
        ORDER BY id DESC
        LIMIT 50
      `).bind(storeId,phone).all();
      const duplicate = (todayCandidates.results||[]).find(row=>sameOrderSpecification(row,incomingSpec));
      if (duplicate) {
        return json({
          error:`هذا الطلب مكرر اليوم وموجود مسبقًا بالكود #${duplicate.order_code}`,
          duplicate:true,
          duplicate_order_id:duplicate.id,
          duplicate_order_code:duplicate.order_code
        },409);
      }

      if (!courierId) {
        const fallback = await env.DB.prepare("SELECT id FROM couriers WHERE name='مندوب' AND is_active=1 ORDER BY id LIMIT 1").first();
        courierId = Number(fallback?.id || 0);
      }

      const max = await env.DB.prepare('SELECT COALESCE(MAX(order_code), 4400) AS m FROM orders').first();
      const code = Number(max?.m || 4400) + 1;

      const result = await env.DB.prepare(`INSERT INTO orders(order_code,recipient_name,phone,area,detailed_address,amount,order_notes,raw_text,created_by,store_id,courier_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(code, name, phone, String(b.area||'').trim(), String(b.detailed_address||'').trim(), Number(b.amount||0), String(b.order_notes||'').trim(), String(b.raw_text||''), me.id, storeId, courierId||null).run();

      const order = await env.DB.prepare(orderSelectSql('WHERE o.id=?')).bind(result.meta.last_row_id).first();
      return json({ order }, 201);
    }

    const orderMatch = path.match(/^\/orders\/(\d+)$/);
    if (orderMatch && method === 'GET') {
      const order = await env.DB.prepare(orderSelectSql('WHERE o.id=?')).bind(Number(orderMatch[1])).first();
      if (!order) return json({error:'الطلب غير موجود'},404);
      return json({order});
    }
    if (orderMatch && method === 'DELETE') {
      if (me.role !== 'admin') return json({error:'صلاحية مدير مطلوبة لحذف الطلب'},403);

      const id = Number(orderMatch[1]);
      const order = await env.DB.prepare('SELECT id,order_code FROM orders WHERE id=?').bind(id).first();
      if (!order) return json({error:'الطلب غير موجود'},404);

      // Remove relation rows first so a hard delete does not leave orphan references.
      const tableRows = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('print_batch_orders','courier_settlement_orders','store_settlement_orders','delivery_company_settlement_orders')"
      ).all();
      const tables = new Set((tableRows.results||[]).map(r=>r.name));

      let batchIds = [];
      if (tables.has('print_batch_orders')) {
        const br = await env.DB.prepare('SELECT DISTINCT batch_id FROM print_batch_orders WHERE order_id=?').bind(id).all();
        batchIds = (br.results||[]).map(r=>Number(r.batch_id)).filter(Boolean);
        await env.DB.prepare('DELETE FROM print_batch_orders WHERE order_id=?').bind(id).run();
      }
      if (tables.has('courier_settlement_orders')) {
        await env.DB.prepare('DELETE FROM courier_settlement_orders WHERE order_id=?').bind(id).run();
      }
      if (tables.has('store_settlement_orders')) {
        await env.DB.prepare('DELETE FROM store_settlement_orders WHERE order_id=?').bind(id).run();
      }
      if (tables.has('delivery_company_settlement_orders')) {
        await env.DB.prepare('DELETE FROM delivery_company_settlement_orders WHERE order_id=?').bind(id).run();
      }

      await env.DB.prepare('DELETE FROM orders WHERE id=?').bind(id).run();

      // Keep print-batch counters accurate after deleting an order.
      for (const bid of batchIds) {
        const count = await env.DB.prepare('SELECT COUNT(*) c FROM print_batch_orders WHERE batch_id=?').bind(bid).first();
        const c = Number(count?.c||0);
        if (c === 0) {
          await env.DB.prepare('DELETE FROM print_batches WHERE id=?').bind(bid).run();
        } else {
          await env.DB.prepare('UPDATE print_batches SET order_count=? WHERE id=?').bind(c,bid).run();
        }
      }

      return json({ok:true,id,order_code:order.order_code});
    }

    if (orderMatch && method === 'PUT') {
      const b = await readBody(request);
      const id = Number(orderMatch[1]);
      const storeId = Number(b.store_id || 0);
      if (!storeId) return json({error:'اختر المتجر صاحب الطلب'},400);
      const store = await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();
      if (!store) return json({error:'المتجر غير موجود أو موقوف'},400);

      await env.DB.prepare(`UPDATE orders SET recipient_name=?,phone=?,area=?,detailed_address=?,amount=?,order_notes=?,store_id=?,courier_id=?,courier_settled=CASE WHEN courier_id IS NOT ? THEN 0 ELSE courier_settled END,updated_at=datetime('now') WHERE id=?`)
        .bind(String(b.recipient_name||'').trim(), normalizePhone(b.phone), String(b.area||'').trim(), String(b.detailed_address||'').trim(), Number(b.amount||0), String(b.order_notes||'').trim(), storeId, Number(b.courier_id||0)||null, Number(b.courier_id||0)||null, id).run();
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
      const printed = Number(b.printed) === 1 ? 1 : 0;

      await env.DB.prepare(`UPDATE orders SET
        delivery_status=?,
        printed=?,
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
        .bind(status, printed, deliveryFee, deliveredAmount, cashCollected, costOfGoods,
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

    const userMatch = path.match(/^\/users\/(\d+)$/);
    if (userMatch && method === 'PUT') {
      if (me.role !== 'admin') return json({error:'صلاحية مدير مطلوبة'},403);

      const id = Number(userMatch[1]);
      const b = await readBody(request);
      const existing = await env.DB.prepare('SELECT id,username,display_name,role,is_active FROM users WHERE id=?').bind(id).first();
      if (!existing) return json({error:'المستخدم غير موجود'},404);

      const username = String(b.username||'').trim();
      const displayName = String(b.display_name||'').trim();
      const role = b.role === 'admin' ? 'admin' : 'staff';
      const isActive = Number(b.is_active) === 0 ? 0 : 1;
      const password = String(b.password||'');

      if (!username || !displayName) return json({error:'الاسم واسم المستخدم مطلوبان'},400);
      if (password && password.length < 6) return json({error:'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'},400);

      const duplicate = await env.DB.prepare('SELECT id FROM users WHERE username=? AND id<>?').bind(username,id).first();
      if (duplicate) return json({error:'اسم المستخدم مستخدم لحساب آخر'},400);

      // Do not allow the currently logged-in admin to accidentally disable or demote their own account.
      if (Number(me.id) === id && (isActive === 0 || role !== 'admin')) {
        return json({error:'لا يمكنك إيقاف أو إزالة صلاحية المدير من حسابك الحالي'},400);
      }

      if (password) {
        const hash = await hashPassword(password);
        await env.DB.prepare('UPDATE users SET username=?,display_name=?,password_hash=?,role=?,is_active=? WHERE id=?')
          .bind(username,displayName,hash,role,isActive,id).run();
      } else {
        await env.DB.prepare('UPDATE users SET username=?,display_name=?,role=?,is_active=? WHERE id=?')
          .bind(username,displayName,role,isActive,id).run();
      }

      const user = await env.DB.prepare('SELECT id,username,display_name,role,is_active,created_at FROM users WHERE id=?').bind(id).first();
      return json({user});
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
