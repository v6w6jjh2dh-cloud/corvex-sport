(()=>{
 const MODELS=[
  {name:'جيوب سحاب',re:/جيوب\s*سحاب|سحاب\s*جيوب/i,price:2.3},
  {name:'رياضة سحاب',re:/رياض[هة]\s*سحاب|سحاب\s*رياض[هة]|بنطلون\s*سحاب/i,price:2.7},
  {name:'رياضة قطن',re:/رياض[هة]\s*قطن|قطن\s*رياض[هة]|قطن\s*سبور|سبور\s*قطن/i,price:3.5},
  {name:'تركي',re:/(?:بنطلون\s*)?تركي/i,price:2.7},
  {name:'ريبوك',re:/ريبوك/i,price:2.5},
  {name:'باريس',re:/باريس/i,price:2.5},
  {name:'اولد موني',re:/اولد\s*موني|أولد\s*موني|ولد\s*موني/i,price:3.5},
  {name:'M',re:/(?:تيشرت|تيشيرت|تشرت|بلوز[هة]?|بلايز)\s*(?:حرف\s*)?(?:m6?|M6?|م6?|ام6?|أم6?|ام|أم)(?=\s|\d|$)/i,price:3},
  {name:'زرار',re:/بنطلون\s*(?:ب?زرار|بزار|الازرار|الأزرار)|(?:ب?زرار|بزار)/i,price:2.2},
  {name:'جيوب',re:/(?:قطع\s*)?جيوب(?!\s*سحاب)|بنطلون\s*جيوب(?!\s*سحاب)/i,price:2.2},
  {name:'تريكو سادة',re:/ساد[هة]\s*تريكو|تريكو\s*ساد[هة]/i,price:2.5},
  {name:'جاكار',re:/جاكار|ترينغ|تريننغ/i,price:4.25},
  {name:'بولو',re:/بولو\s*تريكو|تريكو\s*بولو|بولو\s*ترند|تيشرت\s*بولو|تيشيرت\s*بولو|بلوز[هة]\s*بولو/i,price:3.5}
 ];
 function norm(s=''){return normalizeDigits(String(s)).replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim()}
 function qFrom(s=''){
  s=norm(s);let m=s.match(/(?:عدد|العدد|كميه|تفصيل)\s*[:=\-]?\s*(\d+)/i);if(m)return Math.max(1,Number(m[1]));
  m=s.match(/(\d+)\s*(?:قطعه|قطع|حبه|حبات|الوان)/i);if(m)return Math.max(1,Number(m[1]));
  if(/ثلاث(?:ه)?\s*(?:ال)?الوان/.test(s))return 3;if(/لونين|قطعتين/.test(s))return 2;return 1;
 }
 function localCost(text=''){
  const lines=String(text).replace(/\r/g,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean);let total=0,found=0;
  for(let i=0;i<lines.length;i++){
   const line=norm(lines[i]);if(/استرجاع|ارجاع/.test(line))continue;
   for(const model of MODELS){if(!model.re.test(line))continue;
    const before=lines[i-1]||'',after1=lines[i+1]||'',after2=lines[i+2]||'';
    const context=[before,line,after1,after2].join(' ');total+=model.price*qFrom(context);found++;break;
   }
  }
  return {cost:Number(total.toFixed(2)),found};
 }
 async function auto(){
  if(state?.view!=='daily-profits')return;
  const cards=[...document.querySelectorAll('.profit-order-card')];
  for(const card of cards){
   if(card.dataset.autoCostDone==='1'||card.dataset.status==='partial')continue;card.dataset.autoCostDone='1';
   const notes=card.querySelector('.profit-original-notes')?.innerText?.replace(/^نص الطلب الأصلي:\s*/,'')||'',r=localCost(notes),input=card.querySelector('.profit-cost');if(!input)continue;
   if(r.found){input.value=r.cost.toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}));
    const id=Number(card.dataset.id||0),amount=Number(card.querySelector('.profit-amount')?.value||0),fee=Number(card.querySelector('.profit-fee')?.value||0);
    try{const d=await api('/orders/'+id),o=d.order;if(o&&Math.abs(Number(o.cost_of_goods||0)-r.cost)>.001)await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({delivery_status:o.delivery_status,printed:Number(o.printed||0),delivered_amount:amount,delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:r.cost,delivered_pieces:Number(o.delivered_pieces||0),returned_pieces:Number(o.returned_pieces||0),settlement_note:o.settlement_note||''})})}catch{}
   }else{card.dataset.autoCostUnknown='1';const b=card.querySelector('.profit-ai');if(b){b.textContent='✨ موديل غير معروف — تحليل بالذكاء';b.style.display='inline-flex'}}
  }
  const all=document.querySelector('#profitAiAll');if(all)all.style.display='none';document.querySelectorAll('.profit-ai').forEach(b=>{const c=b.closest('.profit-order-card');if(c?.dataset.autoCostUnknown!=='1')b.style.display='none'});
 }
 new MutationObserver(()=>setTimeout(auto,40)).observe(document.documentElement,{childList:true,subtree:true});setInterval(auto,700);auto();
})();