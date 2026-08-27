(()=>{
 const PRICES=[
  [/جيوب\s*سحاب|سحاب\s*جيوب/i,2.3],
  [/(?:رياض[هة]\s*سحاب|سحاب\s*رياض[هة]|بنطلون\s*سحاب)/i,2.7],
  [/بنطلون\s*تركي|\bتركي\b/i,2.7],
  [/بنطلون\s*(?:ب?زرار|بزار|الازرار|الأزرار)|(?:ب?زرار|بزار)/i,2.2],
  [/جيوب\s*(?:عادي|عادى)|بنطلون\s*جيوب(?!\s*سحاب)/i,2.2],
  [/ساد[هة]\s*تريكو/i,2.5],
  [/(?:جاكار|ترينغ|تريننغ)/i,4.25],
  [/(?:بولو\s*تريكو|تريكو\s*بولو|بولو\s*ترند|تيشرت\s*بولو|تيشيرت\s*بولو|بلوز[هة]\s*بولو)/i,3.5]
 ];
 function qty(text=''){
  const s=normalizeDigits(String(text));
  let m=s.match(/(?:عدد|العدد|كمية|كميه)\s*[:=\-]?\s*(\d+)/i);if(m)return Math.max(1,Number(m[1]));
  m=s.match(/(\d+)\s*(?:قطعة|قطعه|قطع|حبة|حبات|الوان|ألوان)/i);if(m)return Math.max(1,Number(m[1]));
  if(/ثلاث(?:ه|ة)?\s*(?:ال)?الوان|ثلاثة\s*ألوان/i.test(s))return 3;
  if(/لونين|قطعتين/i.test(s))return 2;
  return 1;
 }
 function localCost(text=''){
  const lines=String(text).replace(/\r/g,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let total=0,found=0;
  for(let i=0;i<lines.length;i++){
   const line=lines[i];if(/استرجاع|ارجاع|إرجاع/i.test(line))continue;
   for(const [re,price] of PRICES){
    if(!re.test(line))continue;
    const context=[line,lines[i+1]||'',lines[i+2]||''].join(' ');
    total+=price*qty(context);found++;break;
   }
  }
  return {cost:Number(total.toFixed(2)),found};
 }
 async function auto(){
  if(state?.view!=='daily-profits')return;
  const cards=[...document.querySelectorAll('.profit-order-card')];
  for(const card of cards){
   if(card.dataset.autoCostDone==='1'||card.dataset.status==='partial')continue;
   card.dataset.autoCostDone='1';
   const notes=card.querySelector('.profit-original-notes')?.innerText?.replace(/^نص الطلب الأصلي:\s*/,'')||'';
   const r=localCost(notes),input=card.querySelector('.profit-cost');
   if(!input)continue;
   if(r.found){
    input.value=r.cost.toFixed(2);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const id=Number(card.dataset.id||0),amount=Number(card.querySelector('.profit-amount')?.value||0),fee=Number(card.querySelector('.profit-fee')?.value||0);
    try{const d=await api('/orders/'+id);const o=d.order;if(o&&Math.abs(Number(o.cost_of_goods||0)-r.cost)>.001)await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({delivery_status:o.delivery_status,printed:Number(o.printed||0),delivered_amount:amount,delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:r.cost,delivered_pieces:Number(o.delivered_pieces||0),returned_pieces:Number(o.returned_pieces||0),settlement_note:o.settlement_note||''})})}catch{}
   }else{
    card.dataset.autoCostUnknown='1';
    const b=card.querySelector('.profit-ai');if(b){b.textContent='✨ موديل غير معروف — تحليل بالذكاء';b.style.display='inline-flex'}
   }
  }
  const all=document.querySelector('#profitAiAll');if(all)all.style.display='none';
  document.querySelectorAll('.profit-ai').forEach(b=>{const c=b.closest('.profit-order-card');if(c?.dataset.autoCostUnknown!=='1')b.style.display='none'});
 }
 new MutationObserver(()=>setTimeout(auto,40)).observe(document.documentElement,{childList:true,subtree:true});
 setInterval(auto,700);auto();
})();