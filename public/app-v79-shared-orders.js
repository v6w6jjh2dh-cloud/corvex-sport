(()=>{
 const previousApi=api;
 let decorateTimer=0,lastDecorationKey='';

 async function markIfShared(order){
  try{
   if(!order?.id||!order.phone)return;
   const result=await previousApi('/shared-orders',{
    method:'POST',
    body:JSON.stringify({phone:order.phone,order_id:order.id})
   });
   if(result.shared)toast('طلب مشترك — تم احتساب 1 د توصيل لكل طلب');
  }catch(error){console.warn(error)}
 }

 api=async function(path,options={}){
  const result=await previousApi(path,options);
  if(path==='/orders'&&String(options.method||'GET').toUpperCase()==='POST'&&result?.order){
   setTimeout(()=>markIfShared(result.order),50);
  }
  return result;
 };

 async function loadSharedIds(ids){
  const shared=new Set();
  for(let index=0;index<ids.length;index+=450){
   const chunk=ids.slice(index,index+450);
   const result=await previousApi('/shared-orders?order_ids='+encodeURIComponent(chunk.join(',')));
   (result.shared_order_ids||[]).forEach(id=>shared.add(Number(id)));
  }
  return shared;
 }

 async function decorate(){
  if(!['orders','store-orders'].includes(state?.view))return;
  const links=[...document.querySelectorAll('.order-code-link[data-edit-order]')];
  const ids=[...new Set(links.map(link=>Number(link.dataset.editOrder||0)).filter(Boolean))];
  if(!ids.length)return;
  const key=`${state.view}:${ids.join(',')}`;
  if(key===lastDecorationKey)return;
  lastDecorationKey=key;
  try{
   const shared=await loadSharedIds(ids);
   for(const link of links){
    if(!shared.has(Number(link.dataset.editOrder))||link.parentElement?.querySelector('.shared-order-badge'))continue;
    const badge=document.createElement('span');
    badge.className='badge shared-order-badge';
    badge.style.margin='0 5px';
    badge.textContent='طلب مشترك';
    link.parentElement?.appendChild(badge);
   }
  }catch{}
 }

 function scheduleDecoration(){
  clearTimeout(decorateTimer);
  decorateTimer=setTimeout(decorate,80);
 }

 const baseLabelHtml=labelHtml;
 labelHtml=function(order){
  let html=baseLabelHtml(order);
  if(!order.__shared_order)return html;
  const mark='<div class="shared-order-note" style="display:block;width:100%;margin-top:2mm;text-align:left;direction:rtl;font-size:16pt;line-height:1.05;font-weight:900;color:#000;white-space:nowrap">طلب مشترك مع طلب آخر</div>';
  const noteEnd=/(<div class="note"[^>]*>[\s\S]*?)(<\/div>)(?=(?:<div class="return-alert"|<\/div>$))/i;
  if(noteEnd.test(html))return html.replace(noteEnd,(match,start,end)=>start+mark+end);
  return html.replace(/<\/div>$/i,mark+'</div>');
 };

 const baseOpenPrintWindow=openPrintWindow;
 openPrintWindow=async function(orders,title='طباعة'){
  const list=orders||[];
  const ids=list.map(order=>Number(order.id||0)).filter(Boolean);
  let shared=new Set();
  if(ids.length){try{shared=await loadSharedIds(ids)}catch{}}
  return baseOpenPrintWindow(list.map(order=>({...order,__shared_order:shared.has(Number(order.id))})),title);
 };

 new MutationObserver(scheduleDecoration).observe(document.documentElement,{childList:true,subtree:true});
 scheduleDecoration();
})();
