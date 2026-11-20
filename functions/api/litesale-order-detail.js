// Manual admin-only full LiteSale order details. Read-only; no database writes.
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function onRequest({request,env}){
 if(request.method!=='POST')return out({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return out({error:'invalid_origin'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const actor=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!actor)return out({error:'admin_required'},403);
 let body;try{body=await request.json()}catch{return out({error:'invalid_request'},400)}
 const id=body?.id;if(typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))return out({error:'invalid_order_id'},400);
 const key=env.LITESALE_MCP_KEY;if(!key||!/^lsk_[\w-]+$/.test(key))return out({error:'missing_secret'},503);
 const endpoint='https://api.litesale.store/mcp/k/'+encodeURIComponent(key);
 async function rpc(method,num,params,session){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),15000);
  try{
   const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};if(session)headers['Mcp-Session-Id']=session;
   const res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:num,method,params}),signal:ctrl.signal});
   const txt=await res.text();if(!res.ok)throw Error('upstream_http_'+res.status);
   const data=(res.headers.get('content-type')||'').includes('text/event-stream')?JSON.parse(txt.split(/\r?\n/).filter(s=>s.startsWith('data:')&&s.includes('{')).at(-1)?.slice(5).trim()||'{}'):JSON.parse(txt);
   if(data.error)throw Error('mcp_error_'+data.error.code);
   return {value:data.result,session:res.headers.get('mcp-session-id')||session};
  }finally{clearTimeout(timeout)}
 }
 try{
  const init=await rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'corvex-order-detail',version:'1.0'}});
  const list=await rpc('tools/list',2,{},init.session);
  const tool=list.value?.tools?.find(x=>x.name==='get_order');if(!tool)return out({error:'get_order_unavailable'},502);
  const props=tool.inputSchema?.properties||{},required=tool.inputSchema?.required||[];
  const field=['order_id','id','orderId','order_number'].find(x=>x in props)||(required.length===1?required[0]:null);
  if(!field||required.some(x=>x!==field))return out({error:'unsupported_get_order_schema',required},422);
  const result=await rpc('tools/call',3,{name:'get_order',arguments:{[field]:id}},list.session);
  if(result.value?.isError)return out({error:'get_order_failed'},502);
  let data=result.value?.structuredContent;
  if(data==null){const txt=(result.value?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');data=JSON.parse(txt)}
  const o=data?.order??data?.data?.order??data?.data??data;
  if(!o||typeof o!=='object'||Array.isArray(o))return out({error:'unexpected_order_shape'},502);
  const product=o.product_name??o.product?.name??o.product??o.items??o.order_items??o.products??o.line_items??o.variant??null;
  const amount=o.total??o.total_amount??o.total_price??o.grand_total??o.order_total??o.price??o.amount??o.total_jod??o.pricing??null;
  const schemaPaths=[]; const scan=(v,path='',depth=0)=>{if(!v||typeof v!=='object'||depth>3||schemaPaths.length>=90)return;for(const [k,x] of Object.entries(v).slice(0,35)){const p=path?path+'.'+k:k; if(/price|total|amount|cost|subtotal|discount|shipping|currency|product|item|variant|line|payment|order_value|quantity/i.test(k)){schemaPaths.push({path:p,type:Array.isArray(x)?'array':typeof x,value:(typeof x==='number'||(typeof x==='string'&&/^\\d+(?:\\.\\d+)?$/.test(x)))?String(x).slice(0,35):undefined});}if(x&&typeof x==='object')scan(Array.isArray(x)?x[0]:x,p+(Array.isArray(x)?'[0]':''),depth+1);if(schemaPaths.length>=90)break}};scan(o);
  return out({ok:true,diagnostic:{candidate_fields:schemaPaths},detail:{id:o.id??o.order_id??id,product,amount,quantity:o.quantity??o.qty??o.items?.length??null,address:o.address??o.shipping_address??o.customer?.address??null,city:o.city??o.customer?.city??null,color:o.color??o.variant?.color??null,notes:o.notes??o.customer_notes??null},available_fields:Object.keys(o).slice(0,45),read_only:true,imported:0});
 }catch(e){return out({error:String(e?.message||'detail_failed').slice(0,130)},502)}
}
