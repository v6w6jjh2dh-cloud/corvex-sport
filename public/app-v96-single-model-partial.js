(()=>{
 const rules=()=>window.CORVEX_PRODUCT_RULES;
 const norm=text=>rules()?.normalize(text)||String(text||'').trim();

 function infer(text){
  const productRules=rules();if(!productRules)return null;
  const normalized=norm(text),hits=productRules.findAll(normalized);if(hits.length!==1)return null;
  const model=hits[0];let original=0,returned=0;
  const returnMatches=[...normalized.matchAll(/(?:استرجاع|مرتجع|ارجاع)\s*(?:عدد\s*)?(\d+)\s*(?:قطعه|قطع)?/g)];
  if(returnMatches.length)returned=Number(returnMatches[0][1]);
  const quantities=[...normalized.matchAll(/(?:عدد|العدد|تفصيل)\s*[:=\-]?\s*(\d+)|(?:^|\s)(\d+)\s*(?:قطعه|قطع|لون|الوان)/g)]
   .map(match=>Number(match[1]||match[2]||0)).filter(Boolean);
  original=quantities.filter(quantity=>quantity!==returned).sort((a,b)=>b-a)[0]||0;
  if(!original){
   const colors=normalized.match(/(?:^|\s)(\d+)\s*(?:اسود|ابيض|بني|زيتي|سكني|سماوي|ازرق|برتقالي)/g)||[];
   original=colors.reduce((sum,value)=>sum+Number(value.match(/\d+/)?.[0]||0),0);
  }
  if(!original||!returned||returned>=original)return null;
  const delivered=original-returned;
  return{model,original,returned,delivered,cost:productRules.itemCost(model,delivered)};
 }

 async function run(){
  if(state?.view!=='daily-profits'||!rules())return;
  for(const card of document.querySelectorAll('.profit-order-card[data-status="partial"]')){
   if(card.dataset.singlePartialDone==='1'||card.dataset.manualCostOverride==='1'||card.dataset.manualCost==='1')continue;
   const box=card.querySelector('.profit-original-notes');if(!box)continue;
   const text=box.dataset.cleanText||box.textContent.replace(/^نص الطلب الأصلي:\s*/,''),result=infer(text);if(!result)continue;
   card.dataset.singlePartialDone='1';
   const items=card.querySelector('textarea');if(items&&!items.value.trim())items.value=`${result.model.name} عدد ${result.delivered}`;
   const cost=card.querySelector('.profit-cost');
   if(cost){cost.value=result.cost.toFixed(2);cost.dispatchEvent(new Event('input',{bubbles:true}))}
   const hint=document.createElement('div');hint.className='sub';hint.style.margin='8px 0';
   hint.textContent=`تم الاستنتاج تلقائيًا: ${result.original} ${result.model.name} - مرتجع ${result.returned} = المستلم ${result.delivered} قطعة، الكوست ${result.cost.toFixed(2)} د.أ`;
   box.parentNode.insertBefore(hint,box);
   try{
    const id=Number(card.dataset.id),data=await api('/orders/'+id),order=data.order;
    const amount=Number(card.querySelector('.profit-amount')?.value||0),fee=Number(card.querySelector('.profit-fee')?.value||0);
    await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({
     delivery_status:'partial',printed:Number(order.printed||0),delivered_amount:amount,delivery_fee:fee,
     cash_collected:Math.max(0,amount-fee),cost_of_goods:result.cost,partial_cost_reviewed:Number(order.partial_cost_reviewed||0),partial_received_items:order.partial_received_items||'',delivered_pieces:result.delivered,
     returned_pieces:result.returned,settlement_note:order.settlement_note||''
    })});
   }catch{card.dataset.singlePartialDone=''}
  }
 }

 document.addEventListener('corvex:profits-rendered',run);run();
})();
