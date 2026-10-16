import {json,dbSession,config,verifyEnvelope,validatePayload,applyEvent} from './_cepoxy.js';
export async function onRequest({request,env}) {
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  try {
    const db=dbSession(env.DB),cfg=await config(db);
    if(!cfg || !cfg.enabled || !cfg.store_active || !cfg.actor_active || cfg.actor_role!=='admin')
      return json({ok:false,error:'integration_unavailable'},503);
    if(Number(request.headers.get('content-length')||0)>24000)return json({ok:false,error:'payload_too_large'},413);
    const text=await request.text();
    if(new TextEncoder().encode(text).length>24000)return json({ok:false,error:'payload_too_large'},413);
    let envelope;
    try{envelope=JSON.parse(text)}catch{return json({ok:false,error:'invalid_json'},400)}
    const payloadText=await verifyEnvelope(envelope,cfg);
    if(!payloadText)return json({ok:false,error:'invalid_signature'},401);
    let payload;
    try{payload=validatePayload(JSON.parse(payloadText),cfg)}catch{return json({ok:false,error:'invalid_payload'},422)}
    const result=await applyEvent(db,cfg,payload,payloadText);
    return json(result,result.ok?200:409);
  }catch{
    // Do not leak customer data, signing material, SQL, or stack traces.
    return json({ok:false,error:'retry_later'},503);
  }
}
