// Admin-only LiteSale status synchronization; fail closed when the MCP update schema is unknown.
const out=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function onRequest({request,env}){
 if(request.method!=='POST')return out({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return out({error:'invalid_origin'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const admin=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!admin)return out({error:'admin_required'},403);
 let b;try{b=await request.json()}catch{return out({error:'invalid_json'},400)}
 const id=String(b.id??'');if(!/^[-\w]{1,100}$/.test(id)||!['processing','shipped'].includes(b.target))return out({error:'invalid_request'},400);
 const row=await env.DB.prepare('SELECT state FROM litesale_review_queue WHERE source_id=?').bind(id).first();
 if(!row||row.state!==(b.target==='shipped'?'approved':'pending'))return out({error:'queue_state_mismatch'},409);
 const key=env.LITESALE_MCP_KEY;if(!key||!/^lsk_[\w-]+$/.test(key))return out({error:'missing_secret'},503);
 const endpoint='https://api.litesale.store/mcp/k/'+encodeURIComponent(key);
 let session;
 async function rpc(method,n,params){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);try{
 const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};if(session)headers['Mcp-Session-Id']=session;
 const res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:n,method,params}),signal:ctrl.signal});const raw=await res.text();if(!res.ok)throw Error('upstream_http_'+res.status);
 session=res.headers.get('mcp-session-id')||session;const data=(res.headers.get('content-type')||'').includes('text/event-stream')?JSON.parse(raw.split(/\r?\n/).filter(s=>s.startsWith('data:')&&s.includes('{')).at(-1)?.slice(5).trim()||'{}'):JSON.parse(raw);
 if(data.error)throw Error('mcp_error');return data.result;
 }finally{clearTimeout(timer)}}
 try{
 await rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'corvex-status',version:'1.0'}});
 const listing=await rpc('tools/list',2,{});const tool=(listing.tools||[]).find(t=>['update_order_status','set_order_status','change_order_status'].includes(t.name));
 if(!tool)return out({error:'status_update_tool_unavailable'},422);
 const props=tool.inputSchema?.properties||{},required=tool.inputSchema?.required||[];
 const idField=['order_id','orderId','id'].find(k=>k in props),statusField=['status','order_status','new_status'].find(k=>k in props);
 if(!idField||!statusField||required.some(k=>k!==idField&&k!==statusField))return out({error:'unsupported_status_schema'},422);
 const spec=props[statusField],options=spec.enum??spec.oneOf?.map(x=>x.const).filter(Boolean)??[];
 // Do not invent LiteSale status codes: use only explicitly advertised enum values.
 const wanted=b.target==='processing'?['قيد المعالجة','قيد المعالجه','processing','in_progress']:['تم الشحن','shipped','dispatched'];
 const value=options.find(x=>wanted.includes(String(x).toLowerCase()));
 if(value===undefined)return out({error:'status_value_not_confirmed',available_statuses:options},422);
 const result=await rpc('tools/call',3,{name:tool.name,arguments:{[idField]:id,[statusField]:value}});
 if(result?.isError)return out({error:'litesale_update_failed'},502);
 return out({ok:true,target:b.target,value});
 }catch(e){return out({error:String(e.message||'litesale_connection_failed').slice(0,130)},502)}
}