(()=>{
 let rendering=false,lastKey='';
 function removeAll(){document.querySelectorAll('#profitSettlementGroups').forEach((x,i)=>{if(i>0)x.remove()})}
 function showSettlement(cards,sid){cards.forEach(c=>c.style.display=String(c.dataset.settlementId||'')===String(sid)?'':'none')}
 async function render(force=false){
  if(state?.view!=='daily-profits')return;
  const summary=document.querySelector('#profitSummary'),date=document.querySelector('#profitDate')?.value,store=document.querySelector('#profitStore')?.value||'';
  if(!summary||!date||rendering)return;removeAll();const key=date+'|'+store;let box=document.querySelector('#profitSettlementGroups');if(box&&!force&&lastKey===key)return;rendering=true;lastKey=key;
  try{
   const d=await api('/profit-settlements?date='+encodeURIComponent(date)+(store?'&store_id='+encodeURIComponent(store):'')),rows=d.settlements||[];
   if(!box){box=document.createElement('div');box.id='profitSettlementGroups';box.className='card';summary.parentNode.insertBefore(box,summary.nextSibling)}box.style.margin='12px 0';
   box.innerHTML=`<h3 style="margin-bottom:4px">الأرباح حسب كشف شركة التوصيل</h3><div class="sub" style="margin-bottom:10px">الأرباح تعرض الطلبات التي أغلقها كشف شركة التوصيل فقط.</div>${!rows.length?'<div class="empty">لا توجد كشوف معتمدة بهذا التاريخ</div>':rows.map(x=>`<button type="button" class="settlement-profit-row btn btn-soft" data-sid="${x.id}" style="display:block;width:100%;margin:8px 0;text-align:right;padding:12px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b style="direction:ltr">${esc(x.settlement_code)}</b><span>${Number(x.order_count||0)} طلب</span></div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px"><span>المستلم<br><b>${money(x.sales||0)}</b></span><span>الكوست<br><b>${money(x.costs||0)}</b></span><span>التوصيل<br><b>${money(x.fees||0)}</b></span><span>الربح<br><b>${money(x.profit||0)}</b></span></div></button>`).join('')}`;
   const cards=[...document.querySelectorAll('.profit-order-card')];
   const valid=new Set(rows.map(x=>String(x.id)));cards.forEach(c=>c.style.display=valid.has(String(c.dataset.settlementId||''))?'':'none');
   // When one settlement is shown for the selected store/date, default directly to its exact orders.
   if(rows.length===1)showSettlement(cards,rows[0].id);
   box.querySelectorAll('.settlement-profit-row').forEach(b=>b.onclick=()=>showSettlement(cards,b.dataset.sid));
  }catch{}finally{rendering=false}
 }
 document.addEventListener('corvex:profits-rendered',()=>{lastKey='';render(true)});render(true);
})();
