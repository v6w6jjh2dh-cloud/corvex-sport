(()=>{
 const prevApi=api;
 async function markIfShared(order){try{if(!order?.id||!order.phone)return;const d=await prevApi('/shared-orders?phone='+encodeURIComponent(order.phone));const others=(d.orders||[]).filter(x=>Number(x.id)!==Number(order.id)&&Number(x.store_id)!==Number(order.store_id));if(!others.length)return;await prevApi('/shared-orders',{method:'POST',body:JSON.stringify({phone:order.phone,order_id:order.id})});toast('طلب مشترك — تم احتساب 1 د توصيل لكل طلب')}catch(e){console.warn(e)}}
 api=async function(path,opts={}){const r=await prevApi(path,opts);if(path==='/orders'&&String(opts.method||'GET').toUpperCase()==='POST'&&r?.order)setTimeout(()=>markIfShared(r.order),50);return r};
 async function decorate(){if(!['orders','store-orders'].includes(state?.view))return;const links=[...document.querySelectorAll('a,button')];for(const link of links){const m=link.textContent.match(/#?(\d{3,})/);if(!m||link.dataset.sharedSimple)continue;link.dataset.sharedSimple='1';try{const d=await prevApi('/orders?search='+m[1]),o=(d.orders||[]).find(x=>String(x.order_code)===m[1]);if(!o)continue;const sh=await prevApi('/shared-orders?order_id='+o.id);if(sh.shared){const badge=document.createElement('span');badge.className='badge';badge.style.margin='0 5px';badge.textContent='طلب مشترك';link.parentElement?.appendChild(badge)}}catch{}}}
 // Put the notice into the label HTML itself. This avoids Safari print timing/DOM injection issues.
 const baseLabelHtml=labelHtml;
 labelHtml=function(o){let html=baseLabelHtml(o);if(!o.__shared_order)return html;const mark='<div class="shared-order-note" style="display:block;width:100%;margin-top:2mm;text-align:left;direction:rtl;font-size:16pt;line-height:1.05;font-weight:900;color:#000;white-space:nowrap">طلب مشترك مع طلب آخر</div>';const noteEnd=/(<div class="note"[^>]*>[\s\S]*?)(<\/div>)(?=(?:<div class="return-alert"|<\/div>$))/i;if(noteEnd.test(html))return html.replace(noteEnd,(m,a,b)=>a+mark+b);return html.replace(/<\/div>$/i,mark+'</div>')};
 const baseOpenPrintWindow=openPrintWindow;
 openPrintWindow=async function(orders,title='طباعة'){
   const enriched=await Promise.all((orders||[]).map(async o=>{const x={...o,__shared_order:false};try{const d=await prevApi('/shared-orders?order_id='+o.id);x.__shared_order=!!d.shared}catch{}return x}));
   return baseOpenPrintWindow(enriched,title);
 };
 new MutationObserver(()=>setTimeout(decorate,80)).observe(document.documentElement,{childList:true,subtree:true});setInterval(decorate,1000);
})();