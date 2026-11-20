// Admin-only, on-demand LiteSale MCP discovery. No order reads/writes or background jobs.
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function onRequest({request,env}) {
  if(request.method!=='POST')return respond({error:'method_not_allowed'},405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return respond({error:'invalid_origin'},403);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!token)return respond({error:'login_required'},401);
  const actor=await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
  if(!actor)return respond({error:'admin_required'},403);
  const key=env.LITESALE_MCP_KEY;
  if(!key)return respond({error:'missing_secret'},503);
  if(!/^lsk_[A-Za-z0-9_-]+$/.test(key))return respond({error:'invalid_secret_format'},503);
  const endpoint='https://api.litesale.store/mcp/k/'+encodeURIComponent(key);
  const rpc=async(method,id,params,session)=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
      if(session)headers['Mcp-Session-Id']=session;
      const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:controller.signal});
      const raw=await response.text();
      if(!response.ok)throw new Error('upstream_http_'+response.status);
      let result;
      if((response.headers.get('content-type')||'').includes('text/event-stream')){
        const data=raw.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).find(x=>x.startsWith('{'));
        if(!data)throw new Error('invalid_mcp_response');
        result=JSON.parse(data);
      } else result=JSON.parse(raw);
      if(result.error)throw new Error('mcp_error_'+(result.error.code||'unknown'));
      return {result:result.result,session:response.headers.get('mcp-session-id')||session};
    } finally {clearTimeout(timeout)}
  };
  try {
    const init=await rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'corvex-readonly-check',version:'1.0'}});
    const tools=await rpc('tools/list',2,{},init.session);
    const names=(tools.result?.tools||[]).map(t=>({name:String(t.name||'').slice(0,120),description:String(t.description||'').slice(0,300)}));
    return respond({ok:true,server: String(init.result?.serverInfo?.name||'LiteSale'),tools:names,read_only_check:true,orders_imported:0});
  }catch(error){return respond({error:String(error.message||'connection_failed').slice(0,100)},502)}
}
