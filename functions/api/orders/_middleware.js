const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});

async function auth(request,env){
  const h=request.headers.get('authorization')||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token)return null;
  return await env.DB.prepare(`SELECT u.id,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

function normalizePhone(value=''){
  const map={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
  let d=String(value||'').replace(/[٠-٩۰-۹]/g,x=>map[x]||x).replace(/\D/g,'');
  if(d.startsWith('00962'))d=d.slice(2);
  if(d.startsWith('962')&&d.length>=12)d='0'+d.slice(3);
  else if(d.length===9&&d.startsWith('7'))d='0'+d;
  return d;
}

export async function onRequest(context){
  const {request,env,next}=context;
  const method=request.method.toUpperCase();
  const url=new URL(request.url);

  // Explicitly approved duplicate as a normal NEW order.
  // Handle it here so the main API duplicate guard is bypassed without marking the order as an exchange.
  if(method==='POST' && /^\/api\/orders\/?$/.test(url.pathname)){
    const clone=request.clone();
    let b={};
    try{b=await clone.json()}catch{}
    if(String(b.duplicate_override_reason||'')==='new_order'){
      const user=await auth(request,env);
      if(!user)return json({error:'غير مصرح'},401);

      const name=String(b.recipient_name||'').trim()||'لا يوجد';
      const phone=normalizePhone(b.phone);
      const storeId=Number(b.store_id||0);
      let courierId=Number(b.courier_id||0);
      if(!phone)return json({error:'رقم الهاتف مطلوب'},400);
      if(!storeId)return json({error:'اختر المتجر صاحب الطلب'},400);

      const store=await env.DB.prepare('SELECT id FROM stores WHERE id=? AND is_active=1').bind(storeId).first();
      if(!store)return json({error:'المتجر غير موجود أو موقوف'},400);

      if(!courierId){
        const fallback=await env.DB.prepare("SELECT id FROM couriers WHERE name='مندوب' AND is_active=1 ORDER BY id LIMIT 1").first();
        courierId=Number(fallback?.id||0);
      }

      const max=await env.DB.prepare('SELECT COALESCE(MAX(order_code),4400) AS m FROM orders').first();
      const code=Number(max?.m||4400)+1;
      const orderNotes=String(b.order_notes||'').trim();
      const rawText=String(b.raw_text||'');
      let amount=Number(b.amount||0);
      if(!Number.isFinite(amount))amount=0;

      const result=await env.DB.prepare(`INSERT INTO orders(order_code,recipient_name,phone,area,detailed_address,amount,order_notes,raw_text,cost_of_goods,created_by,store_id,courier_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(code,name,phone,String(b.area||'').trim(),String(b.detailed_address||'').trim(),amount,orderNotes,rawText,Math.max(0,Number(b.cost_of_goods||0)),user.id,storeId,courierId||null).run();

      const order=await env.DB.prepare(`SELECT o.*,u.display_name AS created_by_name,s.name AS store_name,s.phone AS store_phone
        FROM orders o LEFT JOIN users u ON u.id=o.created_by LEFT JOIN stores s ON s.id=o.store_id WHERE o.id=?`)
        .bind(result.meta.last_row_id).first();
      return json({order},201);
    }
  }

  if(!['PUT','PATCH','DELETE'].includes(method))return next();

  const m=url.pathname.match(/^\/api\/orders\/(\d+)(?:\/outcome)?\/?$/);
  if(!m)return next();

  const user=await auth(request,env);
  if(!user)return json({error:'غير مصرح'},401);

  const order=await env.DB.prepare('SELECT id,order_code,delivery_company_settled FROM orders WHERE id=?').bind(Number(m[1])).first();
  if(order&&Number(order.delivery_company_settled||0)===1&&user.role!=='admin'){
    return json({error:'هذا الطلب مقفل ماليًا بعد اعتماد تسوية شركة التوصيل. التعديل يحتاج صلاحية مدير.'},423);
  }

  return next();
}
