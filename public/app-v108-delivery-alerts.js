(()=>{
 const VIEW='delivery-alerts',CACHE_MS=60000;
 let cachedAt=0,cachedOrders=[],loadingBadge=false;

 function dateText(v){
  if(!v)return '—';
  const d=new Date(String(v).replace(' ','T')+'Z');
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('ar-JO',{dateStyle:'short',timeStyle:'short'});
 }
 async function fetchAlerts(force=false){
  if(!force&&cachedAt&&Date.now()-cachedAt<CACHE_MS)return cachedOrders;
  const data=await api('/delivery-alerts');
  cachedOrders=Array.isArray(data.orders)?data.orders:[];
  cachedAt=Date.now();
  updateBadge(cachedOrders.length);
  return cachedOrders;
 }
 function updateBadge(count){
  const badge=document.querySelector('#deliveryAlertsCount');
  if(!badge)return;
  badge.textContent=String(count||0);
  badge.style.display=count?'inline-flex':'none';
 }
 async function refreshBadge(){
  if(loadingBadge||!state?.user)return;
  loadingBadge=true;
  try{await fetchAlerts(false)}catch{}finally{loadingBadge=false}
 }
 function locationOf(o){return [o.area,o.detailed_address].filter(Boolean).join(' — ')||'—'}
 function rowsHtml(orders){
  return orders.map(o=>`<tr>
   <td><button class="btn btn-soft delivery-alert-order" data-id="${Number(o.id)}">${esc(o.order_code||o.id)}</button></td>
   <td><b>${esc(o.recipient_name||'—')}</b><div class="sub">${esc(o.phone||'—')}</div></td>
   <td>${esc(o.store_name||'—')}</td>
   <td>${esc(locationOf(o))}</td>
   <td>${dateText(o.first_printed_at)}</td>
   <td><b style="color:#b91c1c">${Number(o.days_waiting||4)} أيام</b></td>
   <td>${money(o.amount)} د.أ</td>
  </tr>`).join('');
 }
 async function openAlertOrder(id){
  if(typeof window.editOrder!=='function')return;
  await window.editOrder(id);
  const goBack=()=>window.deliveryAlertsView();
  const top=document.querySelector('#backToOrders'),bottom=document.querySelector('#cancelEditOrder');
  [top,bottom].forEach(btn=>{if(btn){btn.textContent='العودة للتنبيهات';btn.onclick=goBack}});
 }
 async function view(){
  state.view=VIEW;
  const c=document.querySelector('#content');if(!c)return;
  c.innerHTML=`<div class="page-title"><div><h1>🔔 تنبيه</h1><div class="sub">طلبات أُرسلت لشركة التوصيل من 8/9/2026 وبقيت بلا نتيجة 4 أيام كاملة أو أكثر.</div></div><button id="deliveryAlertsRefresh" class="btn btn-soft">تحديث</button></div><div class="card"><div id="deliveryAlertsBody" class="empty">جاري تحميل التنبيهات...</div></div>`;
  document.querySelector('#deliveryAlertsRefresh').onclick=()=>loadIntoView(true);
  await loadIntoView(true);
 }
 async function loadIntoView(force){
  const body=document.querySelector('#deliveryAlertsBody');if(!body)return;
  body.className='empty';body.textContent='جاري تحميل التنبيهات...';
  try{
   const orders=await fetchAlerts(force);
   if(!orders.length){body.innerHTML='<div class="empty">لا توجد طلبات متأخرة حاليًا ✅</div>';return}
   body.className='';
   body.innerHTML=`<div style="margin-bottom:14px"><b>${orders.length} طلب بحاجة متابعة</b></div><div class="table-wrap"><table><thead><tr><th>الطلب</th><th>الزبون</th><th>المتجر</th><th>الموقع</th><th>أُرسل للشركة</th><th>مدة الانتظار</th><th>المبلغ</th></tr></thead><tbody>${rowsHtml(orders)}</tbody></table></div>`;
   body.querySelectorAll('.delivery-alert-order').forEach(btn=>btn.onclick=()=>openAlertOrder(Number(btn.dataset.id)));
  }catch(e){body.className='empty';body.textContent=e.message||'تعذر تحميل التنبيهات'}
 }
 function installNav(){
  const nav=document.querySelector('.sidebar .nav');if(!nav)return;
  let button=document.querySelector('#deliveryAlertsNav');
  if(!button){
   button=document.createElement('button');button.id='deliveryAlertsNav';button.type='button';
   button.innerHTML='🔔 تنبيه <span id="deliveryAlertsCount" style="display:none;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;margin-right:auto;border-radius:999px;background:#dc2626;color:#fff;font-size:12px;font-weight:800">0</span>';
   button.onclick=()=>{view();document.querySelector('.sidebar')?.classList.remove('open');document.querySelector('#sidebarOverlay')?.classList.remove('show')};
  }
  if(nav.lastElementChild!==button)nav.appendChild(button);
  refreshBadge();
 }
 window.deliveryAlertsView=view;
 const originalRenderShell=window.renderShell;
 if(typeof originalRenderShell==='function')window.renderShell=function(){const result=originalRenderShell.apply(this,arguments);setTimeout(installNav,0);return result};
 let scheduled=false;
 new MutationObserver(()=>{if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;installNav()},0)}).observe(document.documentElement,{childList:true,subtree:true});
 installNav();
})();
