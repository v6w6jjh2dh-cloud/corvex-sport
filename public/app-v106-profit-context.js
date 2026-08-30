(()=>{
 const VIEW='daily-profits',cache=new Map();
 const inProfitView=()=>{try{return typeof state!=='undefined'&&state?.view===VIEW}catch{return false}};
 const fallbackResult=value=>value&&typeof value==='object'?value:{cost:0,items:[],found:0,unknown:[]};
 async function calculate(text,localResult){
  const fallback=fallbackResult(localResult);
  if(!inProfitView()||typeof api!=='function'||!String(text||'').trim())return fallback;
  const version=window.CORVEX_PRODUCT_RULES?.version||'unknown',key=`${version}:${String(text)}`;
  if(cache.has(key))return cache.get(key);
  try{
   const data=await api('/profit-interpret',{method:'POST',body:JSON.stringify({scope:'profits',text:String(text)})}),result=data?.result;
   if(!result||result.scope!=='profits'||!Array.isArray(result.items)||!Number.isFinite(Number(result.cost)))return fallback;
   const safe={...result,cost:Number(result.cost),found:Number(result.found||result.items.length),unknown:Array.isArray(result.unknown)?result.unknown:[]};
   cache.set(key,safe);if(cache.size>200)cache.delete(cache.keys().next().value);return safe;
  }catch{return fallback}
 }
 window.CORVEX_PROFIT_CONTEXT={calculate,clear:()=>cache.clear(),scope:'profits'};
})();
