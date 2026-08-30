(()=>{
 const rules=()=>window.CORVEX_PRODUCT_RULES;
 const calc=text=>rules()?.calculateCost(text)||{cost:0,items:[],found:0};
 function clearIncomplete(card){const wasIncomplete=card.dataset.costIncomplete==='1';delete card.dataset.costIncomplete;card.classList.remove('profit-cost-incomplete');card.querySelector('.profit-unknown-models')?.remove();if(wasIncomplete)card.querySelector('.profit-cost')?.dispatchEvent(new Event('input',{bubbles:true}))}
 function showIncomplete(card,names){
  card.dataset.costIncomplete='1';card.classList.add('profit-cost-incomplete');let box=card.querySelector('.profit-unknown-models');
  if(!box){box=document.createElement('div');box.className='profit-unknown-models';const anchor=card.querySelector('.profit-original-notes');anchor?.parentNode.insertBefore(box,anchor)}
  box.innerHTML=`<b>الكوست غير مكتمل</b><span>موديل غير معرّف: ${names.map(esc).join('، ')}</span><div>${names.map(name=>`<button type="button" class="btn btn-soft profit-define-model" data-model="${encodeURIComponent(name)}">تعريف ${esc(name)}</button><button type="button" class="btn btn-soft profit-ignore-model" data-model="${encodeURIComponent(name)}">ليست موديلًا — تجاهل</button>`).join('')}</div>`;
  card.querySelector('.profit-cost')?.dispatchEvent(new Event('input',{bubbles:true}));
 }
 function showBreakdown(card,items){let box=card.querySelector('.profit-cost-breakdown');if(!box){box=document.createElement('div');box.className='sub profit-cost-breakdown';const anchor=card.querySelector('.profit-original-notes');anchor?.parentNode.insertBefore(box,anchor)}box.textContent='تفصيل الكوست: '+items.map(item=>`${item.qty} ${item.name} = ${Number(item.cost).toFixed(2)}`).join(' + ')}
 async function apply(card){
  if(card.dataset.manualCostOverride==='1'||card.dataset.manualCost==='1'||card.dataset.status==='partial'){clearIncomplete(card);return}
  const rr=rules();if(!rr)return;await rr.loadRemote?.();
  const text=(card.querySelector('.profit-original-notes')?.textContent||'').replace(/^نص الطلب الأصلي:\s*/,''),result=rr.calculateCost(text),unknown=result.unknown||[];
  if(unknown.length){showIncomplete(card,unknown);return}clearIncomplete(card);if(!result.items.length)return;
  const input=card.querySelector('.profit-cost');if(!input)return;showBreakdown(card,result.items);
  const id=+card.dataset.id,amount=+(card.querySelector('.profit-amount')?.value||0),fee=+(card.querySelector('.profit-fee')?.value||0),key=`${id}:${result.cost}:${rr.version}`;
  if(card.dataset.centralCostKey===key)return;card.dataset.centralCostKey=key;input.value=result.cost.toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}));card.dataset.autoCostUnknown='0';card.querySelectorAll('.local-unknown,[data-model-unknown="1"]').forEach(x=>x.remove());
  try{const d=await api('/orders/'+id),o=d.order;if(Math.abs(+(o.cost_of_goods||0)-result.cost)>.001)await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({delivery_status:o.delivery_status,printed:+(o.printed||0),delivered_amount:amount,delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:result.cost,delivered_pieces:+(o.delivered_pieces||0),returned_pieces:+(o.returned_pieces||0),settlement_note:o.settlement_note||''})})}catch{card.dataset.centralCostKey=''}
 }
 let running=false,rerun=false;
 async function run(){if(running){rerun=true;return}if(state?.view!=='daily-profits'||!rules())return;running=true;try{await rules().loadRemote?.();for(const c of document.querySelectorAll('.profit-order-card'))await apply(c)}finally{running=false;if(rerun){rerun=false;run()}}}
 window.CORVEX_CALC_ORDER_COST=calc;window.CORVEX_CLEAR_PROFIT_INCOMPLETE=clearIncomplete;document.addEventListener('corvex:profits-rendered',run);run();setTimeout(run,1200);
})();
