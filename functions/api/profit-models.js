const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

const SEED_MODELS=[
 ['jakar','جاكار',4.25,['جاكار','ترينغ','تريننغ'],{1:[8],2:[15],3:[20]},0],
 ['paris','باريس',2.5,['باريس'],{3:[15]},1],
 ['reebok','ريبوك',2.5,['ريبوك','reebok','ري bok'],{3:[15]},1],
 ['m','M',3,['بلوزه m','بلوزة m','بلوزه ام','بلوزة ام','تيشيرت ام','تيشرت ام','حرف m','حرف ام','وحرف ام','m6','ام6'],{1:[7],2:[12],3:[15]},0],
 ['trico_plain','تريكو سادة',2.5,['تريكو سادة','سادة تريكو'],{1:[7],2:[12],3:[15]},0],
 ['button','زرار',2.2,['جيوب زرار','بنطلون زرار','بنطلون بزرار','بنطلون الزرار','بنطلون الازرار','بنطلون الأزرار','بزار','زرار','الزرار','الازرار','الأزرار'],{1:[7],2:[12],3:[15]},0],
 ['zip_pockets','جيوب سحاب',2.3,['جيوب سحاب','جيب سحاب','سحاب جيوب','سحاب جيب','بنطلون جيوب سحاب','بنطلون جيب سحاب'],{1:[7],2:[12],3:[15]},0],
 ['regular_pockets','جيوب عادي',2.2,['جيوب عادي','بنطلون جيوب عادي','بنطلون جيوب'],{1:[5],2:[9],3:[12]},0],
 ['sport_zip','رياضة سحاب',2.7,['رياضه سحاب','رياضة سحاب','سحاب رياضه','سحاب رياضة','بنطلون سحاب'],{1:[5],2:[9]},0],
 ['polo_plain','بولو سادة',2.8,['بولو سادة','سادة بولو'],{1:[5],2:[10]},0],
 ['polo_knit','بولو تريكو',3.5,['بولو تريكو','تريكو بولو','بولو ترند'],{1:[5],2:[9],3:[15]},0],
 ['turkish','تركي',2.7,['بنطلون تركي','تركي'],{1:[5],2:[9],3:[15,16]},0],
 ['takyeef','بنطلون تكيف',3.5,['بنطلون تكيف','تكيف','تكييف','يكتف','تكف'],{},0],
 ['cardigan','كاردونيه',3.5,['كاردونيه','بجامه كاردونيه','بجامة كاردونيه'],{1:[8],2:[14],3:[18]},0],
 ['cotton_tee','تيشيرت قطن',3.3,['تيشيرت قطن','تيشرت قطن','قطن سبور'],{1:[7],2:[12],3:[15]},0],
 ['old_money','Old Money',3.5,['اولد ماني','أولد ماني','اولد موني','أولد موني','اولد مني','أولد مني','بلوزه اولد ماني','بلوزه اولد موني','بلوزة أولد ماني','بلوزة أولد موني','old money'],{1:[7],2:[12],3:[15]},0]
];

async function auth(request,env){
 const h=request.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';
 if(!token)return null;
 return env.DB.prepare(`SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

async function allowed(env,user){
 if(!user)return false;if(user.role==='admin')return true;
 const row=await env.DB.prepare("SELECT permissions_json FROM actor_permissions WHERE actor_type='user' AND actor_id=?").bind(user.id).first();
 try{return JSON.parse(row?.permissions_json||'[]').includes('profits')}catch{return false}
}

async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS profit_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  offers_json TEXT NOT NULL DEFAULT '{}',
  delivery_included INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS profit_model_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '',
  after_json TEXT NOT NULL DEFAULT '',
  changed_by INTEGER,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS profit_ignored_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 const count=await env.DB.prepare('SELECT COUNT(*) c FROM profit_models').first();
 if(Number(count?.c||0)===0){
  for(const [key,name,cost,aliases,offers,deliveryIncluded] of SEED_MODELS){
   await env.DB.prepare(`INSERT OR IGNORE INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(?,?,?,?,?,?,1)`)
    .bind(key,name,cost,JSON.stringify(aliases),JSON.stringify(offers),deliveryIncluded).run();
  }
 }
 const zip=await env.DB.prepare("SELECT id,aliases_json FROM profit_models WHERE model_key='zip_pockets'").first();
 if(zip){
  let aliases=[];try{aliases=JSON.parse(zip.aliases_json||'[]')}catch{}
  const required=['جيب سحاب','سحاب جيب','بنطلون جيب سحاب'],missing=required.filter(alias=>!aliases.includes(alias));
  if(missing.length)await env.DB.prepare("UPDATE profit_models SET aliases_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify([...new Set([...aliases,...missing])]),zip.id).run();
 }
 const button=await env.DB.prepare("SELECT id,aliases_json FROM profit_models WHERE model_key='button'").first();
 if(button){
  let aliases=[];try{aliases=JSON.parse(button.aliases_json||'[]')}catch{}
  const required=['الزرار','الازرار','الأزرار','بنطلون الزرار','بنطلون الازرار','بنطلون الأزرار'],missing=required.filter(alias=>!aliases.includes(alias));
  if(missing.length)await env.DB.prepare("UPDATE profit_models SET aliases_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify([...new Set([...aliases,...missing])]),button.id).run();
 }
 const polo=await env.DB.prepare("SELECT id,aliases_json FROM profit_models WHERE model_key='polo_knit'").first();
 if(polo){
  let aliases=[];try{aliases=JSON.parse(polo.aliases_json||'[]')}catch{}
  const required=['بلوزة بولو','بلوزه بولو','تيشيرت بولو','تيشرت بولو','بولو'],missing=required.filter(alias=>!aliases.includes(alias));
  if(missing.length)await env.DB.prepare("UPDATE profit_models SET aliases_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify([...new Set([...aliases,...missing])]),polo.id).run();
 }
 const mModel=await env.DB.prepare("SELECT id,aliases_json FROM profit_models WHERE model_key='m'").first();
 if(mModel){
  let aliases=[];try{aliases=JSON.parse(mModel.aliases_json||'[]')}catch{}
  const unsafe=new Set(['ام','أم','إم','م']),cleaned=aliases.filter(alias=>!unsafe.has(String(alias||'').trim()));
  const required=['بلوزه m','بلوزة m','بلوزه ام','بلوزة ام','تيشيرت ام','تيشرت ام','حرف m','حرف ام','وحرف ام','m6','ام6'];
  const next=[...new Set([...cleaned,...required])];
  if(JSON.stringify(next)!==JSON.stringify(aliases))await env.DB.prepare("UPDATE profit_models SET aliases_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(next),mModel.id).run();
 }
}

const cleanAliases=(value,name)=>{
 const source=Array.isArray(value)?value:String(value||'').split(/[،,\n]+/);
 return [...new Set([name,...source].map(x=>String(x||'').trim()).filter(Boolean))].slice(0,80);
};
const safeAliases=(key,aliases)=>key==='m'?aliases.filter(alias=>!new Set(['ام','أم','إم','م']).has(String(alias||'').trim())):aliases;
const rowOut=row=>{let aliases=[],offers={};try{aliases=JSON.parse(row.aliases_json||'[]')}catch{}try{offers=JSON.parse(row.offers_json||'{}')}catch{}return{id:Number(row.id),key:row.model_key,name:row.name,cost:Number(row.cost||0),aliases,offers,deliveryIncluded:Boolean(row.delivery_included),active:Boolean(row.active),updated_at:row.updated_at}};
async function list(env){const rows=(await env.DB.prepare('SELECT * FROM profit_models ORDER BY active DESC,name ASC').all()).results||[],ignored=(await env.DB.prepare('SELECT phrase FROM profit_ignored_phrases ORDER BY phrase ASC').all()).results||[];const phrases=ignored.map(x=>String(x.phrase||'')).filter(Boolean),stamp=rows.map(x=>`${x.id}:${x.updated_at}:${x.cost}:${x.active}`).join('|')+'#'+phrases.join('|');return{models:rows.map(rowOut),ignored_phrases:phrases,version:stamp||'empty'}}

export async function onRequest({request,env}){
 const user=await auth(request,env);if(!await allowed(env,user))return json({error:'لا تملك صلاحية إدارة موديلات الأرباح'},403);
 await ensure(env);const method=request.method.toUpperCase();
 if(method==='GET')return json(await list(env));
 let body={};try{body=await request.json()}catch{return json({error:'بيانات غير صالحة'},400)}
 if(method==='POST'&&body.action==='ignore'){
  const phrase=String(body.phrase||'').trim().slice(0,120);if(phrase.length<2)return json({error:'العبارة غير صالحة'},400);
  await env.DB.prepare('INSERT OR IGNORE INTO profit_ignored_phrases(phrase,created_by) VALUES(?,?)').bind(phrase,user.id).run();return json({ok:true,...(await list(env))});
 }
 if(method==='PUT'&&body.action==='unignore'){
  const phrase=String(body.phrase||'').trim();await env.DB.prepare('DELETE FROM profit_ignored_phrases WHERE phrase=?').bind(phrase).run();return json({ok:true,...(await list(env))});
 }
 const name=String(body.name||'').trim(),cost=Number(body.cost),aliases=cleanAliases(body.aliases,name);
 if(method==='POST'){
  if(!name)return json({error:'اسم الموديل مطلوب'},400);if(!Number.isFinite(cost)||cost<0)return json({error:'الكوست غير صحيح'},400);
  const key=`custom_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const result=await env.DB.prepare(`INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active,created_by) VALUES(?,?,?,?, '{}',0,1,?)`).bind(key,name,cost,JSON.stringify(aliases),user.id).run();
  const id=Number(result.meta.last_row_id),after=await env.DB.prepare('SELECT * FROM profit_models WHERE id=?').bind(id).first();
  await env.DB.prepare("INSERT INTO profit_model_audit(model_id,action,after_json,changed_by) VALUES(?,'create',?,?)").bind(id,JSON.stringify(rowOut(after)),user.id).run();
  return json({ok:true,model:rowOut(after),...(await list(env))},201);
 }
 if(method==='PUT'){
  const id=Number(body.id||0),before=await env.DB.prepare('SELECT * FROM profit_models WHERE id=?').bind(id).first();if(!before)return json({error:'الموديل غير موجود'},404);
  if(!name)return json({error:'اسم الموديل مطلوب'},400);if(!Number.isFinite(cost)||cost<0)return json({error:'الكوست غير صحيح'},400);
  await env.DB.prepare(`UPDATE profit_models SET name=?,cost=?,aliases_json=?,active=?,updated_at=datetime('now') WHERE id=?`).bind(name,cost,JSON.stringify(safeAliases(String(before.model_key),aliases)),body.active===false||body.active===0?0:1,id).run();
  const after=await env.DB.prepare('SELECT * FROM profit_models WHERE id=?').bind(id).first();
  await env.DB.prepare("INSERT INTO profit_model_audit(model_id,action,before_json,after_json,changed_by) VALUES(?,'update',?,?,?)").bind(id,JSON.stringify(rowOut(before)),JSON.stringify(rowOut(after)),user.id).run();
  return json({ok:true,model:rowOut(after),...(await list(env))});
 }
 return json({error:'طلب غير معروف'},405);
}
