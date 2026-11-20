// Explicit admin-triggered LiteSale preview only. No D1 writes, imports, cron or background polling.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function onRequest({request,env}) {
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return reply({error:'invalid_origin'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!token)return reply({error:'login_required'},401);
 const actor=await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!actor)return reply({error:'admin_required'},403);
 const key=env.LITESALE_MCP_KEY;
 if(!key||!/^lsk_[A-Za-z0-9_-]+$/.test(key))return reply({error:'missing_or_invalid_secret'},503);
 const endpoint='https://api.litesale.store/mcp/k/'+encodeURIComponent(key);
 async function rpc(method,id,params,session){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),15000);
  try {
   const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
   if(session)headers['Mcp-Session-Id']=session;
   const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:ctrl.signal});
   const raw=await response.text();if(!response.ok)throw Error('upstream_http_'+response.status);
   let data;
   if((response.headers.get('content-type')||'').includes('text/event-stream')){
    const lines=raw.split(/\r?\n/).filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trim()).filter(s=>s.startsWith('{'));
    if(!lines.length)throw Error('invalid_mcp_response');
    data=JSON.parse(lines[lines.length-1]);
   }else data=JSON.parse(raw);
   if(data.error)throw Error('mcp_error_'+(data.error.code||'unknown'));
   return {result:data.result,session:response.headers.get('mcp-session-id')||session};
  }finally{clearTimeout(timeout)}
 }
 try {
  const init=await rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'corvex-preview',version:'1.0'}});
  const listing=await rpc('tools/list',2,{},init.session);
  const tool=(listing.result?.tools||[]).find(t=>t.name==='list_orders');
  if(!tool)return reply({error:'list_orders_not_available'},502);
  const props=tool.inputSchema?.properties||{};
  let body={};try{body=await request.json()}catch{}const page=Math.max(1,Math.min(100,Number(body.page)||1));const batchSize=50;const args={};
  if('page'in props)args.page=page;
  if('limit'in props)args.limit=batchSize;
  if('page_size'in props)args.page_size=batchSize;
  if('per_page'in props)args.per_page=batchSize;
  const required=tool.inputSchema?.required||[];
  const missing=required.filter(k=>!(k in args));
  if(missing.length)return reply({error:'tool_requires_parameters',required:missing},422);
  const result=await rpc('tools/call',3,{name:'list_orders',arguments:args},listing.session);
  if(result.result?.isError)return reply({error:'litesale_tool_error',detail:String(result.result.content?.[0]?.text||'').slice(0,350)},502);
  let value=result.result?.structuredContent;
  if(value==null){
   const txt=(result.result?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
   if(!txt)return reply({error:'empty_tool_result'},502);
   try{value=JSON.parse(txt)}catch{return reply({error:'unexpected_tool_format',preview:txt.slice(0,300)},502)}
  }
  const arr=Array.isArray(value)?value:[value?.orders,value?.data?.orders,value?.data,value?.results,value?.items].find(Array.isArray);
  if(!arr)return reply({error:'unrecognized_orders_shape',keys:Object.keys(value||{}).slice(0,20)},502);
  // Only the first ten entries are sent to the authenticated administrator.
  const orders=arr.slice(0,batchSize).map(o=>({
   id:o.id??o.order_id??o.order_number??o.number??null,
   name:o.customer_name??o.customer?.name??o.name??o.full_name??null,
   phone:o.customer_phone??o.customer?.phone??o.phone??null,
   product:o.product_name??o.product?.name??o.product??o.items?.map(x=>x.name??x.product_name).filter(Boolean).join(', ')??null,
   amount:o.total??o.total_amount??o.price??o.amount??null,
   status:o.status??o.order_status??null,
   created_at:o.created_at??o.createdAt??o.date??null
  }));
  return reply({ok:true,orders,shown:orders.length,read_only:true,imported:0,has_more:arr.length>=batchSize,page,pagination_supported:'page'in props,returned:arr.length});
 }catch(e){return reply({error:String(e?.message||'connection_failed').slice(0,160)},502)}
}
