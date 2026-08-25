import { onRequest as legacyOnRequest } from './[[path]].js';

function normalizePhone(v=''){
  let d=String(v||'').replace(/\D/g,'');
  if(d.startsWith('00962'))d='0'+d.slice(5);
  else if(d.startsWith('962'))d='0'+d.slice(3);
  if(d.length===9&&d.startsWith('7'))d='0'+d;
  return d;
}

async function ensureLockTable(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_phone_locks(
    store_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    locked_at TEXT NOT NULL DEFAULT (datetime('now')),
    lock_token TEXT NOT NULL,
    order_id INTEGER,
    PRIMARY KEY(store_id,phone)
  )`).run();
}

export async function onRequest(context){
  const {request,env}=context;
  if(request.method.toUpperCase()!=='POST')return legacyOnRequest(context);

  let body={};
  try{body=await request.clone().json()}catch{return legacyOnRequest(context)}

  const storeId=Number(body.store_id||0);
  const phone=normalizePhone(body.phone||'');
  const override=String(body.duplicate_override_reason||'')==='exchange';
  if(!storeId||!phone||override)return legacyOnRequest(context);

  await ensureLockTable(env);
  const token=crypto.randomUUID();
  const lock=await env.DB.prepare(`
    INSERT INTO order_phone_locks(store_id,phone,locked_at,lock_token,order_id)
    VALUES(?,?,datetime('now'),?,NULL)
    ON CONFLICT(store_id,phone) DO UPDATE SET
      locked_at=excluded.locked_at,
      lock_token=excluded.lock_token,
      order_id=NULL
    WHERE datetime(order_phone_locks.locked_at) < datetime('now','-48 hours')
  `).bind(storeId,phone,token).run();

  if(Number(lock?.meta?.changes||0)===0){
    const held=await env.DB.prepare(`SELECT l.order_id,o.order_code
      FROM order_phone_locks l
      LEFT JOIN orders o ON o.id=l.order_id
      WHERE l.store_id=? AND l.phone=?`).bind(storeId,phone).first();
    return new Response(JSON.stringify({
      error:held?.order_code
        ?`رقم الهاتف موجود في طلب سابق لهذا المتجر خلال آخر 48 ساعة، بالكود #${held.order_code}`
        :'تم استلام نفس الطلب للحفظ بالفعل — لم يتم إنشاء نسخة ثانية',
      duplicate:true,
      duplicate_order_id:held?.order_id||null,
      duplicate_order_code:held?.order_code||null
    }),{status:409,headers:{'content-type':'application/json; charset=utf-8'}});
  }

  try{
    const response=await legacyOnRequest(context);
    if(response.ok){
      try{
        const data=await response.clone().json();
        const order=data?.order;
        if(order?.id){
          await env.DB.prepare(`UPDATE order_phone_locks SET order_id=? WHERE store_id=? AND phone=? AND lock_token=?`)
            .bind(Number(order.id),storeId,phone,token).run();
        }
      }catch{}
      return response;
    }
    await env.DB.prepare(`DELETE FROM order_phone_locks WHERE store_id=? AND phone=? AND lock_token=?`)
      .bind(storeId,phone,token).run();
    return response;
  }catch(e){
    await env.DB.prepare(`DELETE FROM order_phone_locks WHERE store_id=? AND phone=? AND lock_token=?`)
      .bind(storeId,phone,token).run().catch(()=>{});
    throw e;
  }
}
