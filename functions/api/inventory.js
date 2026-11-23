import {ensureInventorySchema} from './_inventory.js';
import {ensureApprovedCatalogue,ensureStatiMerged} from './_partial-delivery.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
async function auth(request,env){
 const header=request.headers.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';if(!token)return null;
 return env.DB.prepare(`SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

const NEW_MODELS=[
 ['jokh_casual','جاكيت جوخ كاجوال',5.2,['جاكيت جوخ كاجوال','جكيت جوخ كاجوال','جاكيت جوخ كاجول']],
 ['jokh_scarfo','جاكيت جوخ سكايفو',7.55,['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت جوخ سكارفو','جاكيت سكارفو','جاكيت سكايفو','جاكيت نسائي','جاكيت نساءي','جكيت نسائي','جكيت نساءي','جوخ شتائي','جاكيت جوخ ستاتي','جكيت جوخ ستاتي','جاكيت جوخ ستأتي','جاكيت جوخ ستائتي','جوخ ستاتي','جوخ ستأتي','جاكيت ستاتي','جكيت ستاتي','جاكيت ستأتي']],
 ['gap_filler','مالئ الفراغات',1,['مالئ الفراغات','مالئ فراغات','مليء الفراغات','مالاء فراغات','ملاء فراغات','مالى فراغات','سي ايبوكسي']]
];
async function ensureNewModels(env){
 for(const [key,name,cost,aliases] of NEW_MODELS){
  await env.DB.prepare("INSERT OR IGNORE INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES(?,?,?,?, '{}',0,1)").bind(key,name,cost,JSON.stringify(aliases)).run();
 }
 await ensureApprovedCatalogue(env);await ensureStatiMerged(env);
}
async function inventoryData(env){
 const models=(await env.DB.prepare(`SELECT p.id,p.model_key,p.name,p.active,COALESCE(b.quantity,0) quantity,b.updated_at
  FROM profit_models p LEFT JOIN inventory_balances b ON b.model_id=p.id
  WHERE p.active=1 ORDER BY p.name`).all()).results||[];
 const movements=(await env.DB.prepare(`SELECT m.id,m.model_id,p.name model_name,m.order_id,o.order_code,m.quantity_delta,m.movement_type,m.note,m.created_at
  FROM inventory_movements m JOIN profit_models p ON p.id=m.model_id
  LEFT JOIN orders o ON o.id=m.order_id ORDER BY m.id DESC LIMIT 80`).all()).results||[];
 return{models:models.map(x=>({...x,id:Number(x.id),quantity:Number(x.quantity||0),active:Boolean(x.active)})),movements};
}

export async function onRequest({request,env}){
 const user=await auth(request,env);if(!user)return json({error:'غير مصرح'},401);
 await ensureInventorySchema(env);
 await ensureNewModels(env);
 if(request.method==='GET')return json(await inventoryData(env));
 if(request.method!=='POST')return json({error:'طلب غير معروف'},405);
 if(user.role!=='admin')return json({error:'تعديل رصيد المستودع يحتاج صلاحية مدير'},403);
 const body=await request.json().catch(()=>({}));
 if(body.action==='reset_all'){
  if(body.confirm!=='RESET_ALL_INVENTORY')return json({error:'تأكيد التصفير مطلوب'},400);
  const rows=(await env.DB.prepare('SELECT model_id,quantity FROM inventory_balances WHERE quantity<>0').all()).results||[];
  if(rows.length){
   const statements=[];
   for(const row of rows){
    statements.push(env.DB.prepare("UPDATE inventory_balances SET quantity=0,updated_by=?,updated_at=datetime('now') WHERE model_id=?").bind(user.id,row.model_id));
    statements.push(env.DB.prepare("INSERT INTO inventory_movements(model_id,quantity_delta,movement_type,note,created_by) VALUES(?,?,'manual',?,?)").bind(row.model_id,-Number(row.quantity),'تصفير شامل للجرد — بداية دورة مخزون جديدة',user.id));
   }
   await env.DB.batch(statements);
  }
  return json({ok:true,reset_models:rows.length,...(await inventoryData(env))});
 }
 const modelId=Number(body.model_id||0),action=String(body.action||''),value=Number(body.quantity);
 if(!modelId||!['set','add','subtract'].includes(action)||!Number.isInteger(value)||value<0)return json({error:'أدخل عدداً صحيحاً للقطع'},400);
 const model=await env.DB.prepare('SELECT id,name FROM profit_models WHERE id=? AND active=1').bind(modelId).first();if(!model)return json({error:'الموديل غير موجود أو موقوف'},404);
 const current=await env.DB.prepare('SELECT quantity FROM inventory_balances WHERE model_id=?').bind(modelId).first(),oldQty=Number(current?.quantity||0);
 const next=action==='set'?value:action==='add'?oldQty+value:oldQty-value,delta=next-oldQty;
 await env.DB.batch([
  env.DB.prepare("INSERT INTO inventory_balances(model_id,quantity,updated_by) VALUES(?,?,?) ON CONFLICT(model_id) DO UPDATE SET quantity=excluded.quantity,updated_by=excluded.updated_by,updated_at=datetime('now')").bind(modelId,next,user.id),
  env.DB.prepare("INSERT INTO inventory_movements(model_id,quantity_delta,movement_type,note,created_by) VALUES(?,?,'manual',?,?)").bind(modelId,delta,action==='set'?'تعيين الرصيد':action==='add'?'إضافة يدوية':'إنقاص يدوي',user.id)
 ]);
 return json({ok:true,model_id:modelId,quantity:next,quantity_delta:delta,...(await inventoryData(env))});
}
