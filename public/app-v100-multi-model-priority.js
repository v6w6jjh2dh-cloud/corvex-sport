(()=>{
 const MODELS=[
  {name:'جيوب سحاب',re:/جيوب\s*سحاب|سحاب\s*جيوب/i,cost:2.3},
  {name:'رياضة سحاب',re:/رياض[هة]\s*سحاب|سحاب\s*رياض[هة]|بنطلون\s*سحاب/i,cost:2.7},
  {name:'تركي',re:/(?:بنطلون\s*)?تركي/i,cost:2.7},
  {name:'ريبوك',re:/ريبوك|reebok|ري\s*bok/i,cost:2.5},
  {name:'باريس',re:/باريس/i,cost:2.5},
  {name:'اولد موني',re:/(?:اولد|أولد|ولد)\s*(?:موني|مني)/i,cost:3.5},
  {name:'M',re:/(?:تيشرت|تيشيرت|تشرت|بلوز[هة]?|بلايز)\s*(?:حرف\s*)?(?:m6|m|م6|م|ام6|أم6|ام|أم)(?=\s|$)/i,cost:3},
  {name:'زرار',re:/جيوب\s*زرار|بنطلون\s*(?:ب?زرار|بزار)|(?:^|\s)(?:زرار|بزار)(?:\s|$)/i,cost:2.2},
  {name:'جيوب',re:/جيوب\s*عادي|بنطلون\s*جيوب(?!\s*سحاب|\s*زرار)|(?:^|\s)جيوب(?:\s|$)/i,cost:2.2},
  {name:'تريكو سادة',re:/ساد[هة]\s*تريكو|تريكو\s*ساد[هة]/i,cost:2.5},
  {name:'جاكار',re:/جاكار|ترينغ|تريننغ/i,cost:4.25},
  {name:'بولو صيفي',re:/بولو\s*صيفي|صيفي\s*بولو/i,cost:2.8},
  {name:'بولو تريكو',re:/بولو\s*تريكو|تريكو\s*بولو/i,cost:3.5},
  {name:'بولو سادة',re:/ساد[هة]\s*بولو|بولو\s*ساد[هة]/i,cost:2.8},
  {name:'تيشيرت قطن',re:/تيش(?:رت|يرت)\s*قطن|قطن\s*سبور/i,cost:3.3},
  {name:'كاردونيه',re:/كاردوني[هة]|بجام[هة]\s*كاردوني[هة]/i,cost:3.5}
 ];
 const COLORS=/^(?:اسود|أسود|ابيض|أبيض|بني|زيتي|سكني|رمادي|سماوي|ازرق|أزرق|كحلي|برتقالي|احمر|أحمر|اخضر|أخضر|بيج|رصاصي|نهدي|زهري|وردي)(?:\s+.*)?$/i;
 const norm=s=>normalizeDigits(String(s||'')).replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
 const isModelLine=s=>MODELS.some(m=>m.re.test(norm(s)));
 function explicitQty(s=''){const x=norm(s);let m=x.match(/(?:عدد|العدد|كميه|تفصيل)\s*[:=\-]?\s*(\d+)/i);if(m)return +m[1];m=x.match(/(?:^|\s)(\d+)\s*(?:قطعه|قطع|حبه|حبات|الوان)(?:\s|$)/i);if(m)return +m[1];m=x.match(/(?:^|\s)(\d+)\s*(?:جاكار|ترينغ|تريننغ|تيشرت|تيشيرت|تشرت|بلوزه|بلوزة|بنطلون|ريبوك|باريس|اولد|أولد|ولد|جيوب|رياضه|رياضة|تريكو|بولو|كاردونيه|كاردونية)/i);if(m)return +m[1];m=x.match(/(?:جاكار|ترينغ|تريننغ|تيشرت|تيشيرت|تشرت|بلوزه|بلوزة|بنطلون|ريبوك|باريس|اولد|أولد|ولد|جيوب|رياضه|رياضة|تريكو|بولو|كاردونيه|كاردونية)\s*(\d+)(?:\s|$)/i);if(m)return +m[1];return 0}
 function qtyFor(lines,i){let q=explicitQty(lines[i]);if(q)return q;
  if(i+1<lines.length&&!isModelLine(lines[i+1])){q=explicitQty(lines[i+1]);if(q)return q;}
  if(i>0&&!isModelLine(lines[i-1])){q=explicitQty(lines[i-1]);if(q)return q;}
  let colors=0;for(let j=i+1;j<lines.length;j++){if(isModelLine(lines[j]))break;const x=String(lines[j]).trim();if(/استرجاع|ارجاع|مرتجع|وزن|تواصل|توصيل|مقاس|طول|ملاحظه|ملاحظة/i.test(x))continue;if(COLORS.test(x))colors++;}
  return colors||1;
 }
 function calc(text=''){const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);let cost=0,items=[];for(let i=0;i<lines.length;i++){const line=norm(lines[i]);if(/استرجاع|ارجاع|مرتجع/.test(line))continue;for(const m of MODELS){if(!m.re.test(line))continue;if(m.name==='جيوب'&&/جيوب\s*سحاب|سحاب\s*جيوب|جيوب\s*زرار/i.test(line))continue;if(m.name==='بولو سادة'&&/بولو\s*تريكو|تريكو\s*بولو|بولو\s*صيفي/i.test(line))continue;const q=qtyFor(lines,i);cost+=q*m.cost;items.push({name:m.name,qty:q,cost:q*m.cost});break;}}
  return{cost:+cost.toFixed(2),items};}
 async function apply(card){if(card.dataset.manualCostOverride==='1')return;if(card.dataset.status==='partial')return;const text=(card.querySelector('.profit-original-notes')?.innerText||'').replace(/^نص الطلب الأصلي:\s*/,'');const r=calc(text);if(!r.items.length)return;const input=card.querySelector('.profit-cost');if(!input)return;const old=+input.value||0;if(Math.abs(old-r.cost)>.001){input.value=r.cost.toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}))}card.dataset.multiModelPriority='1';const id=+card.dataset.id,amount=+(card.querySelector('.profit-amount')?.value||0),fee=+(card.querySelector('.profit-fee')?.value||0),key=`${id}:${r.cost}`;if(card.dataset.multiModelKey===key)return;card.dataset.multiModelKey=key;try{const d=await api('/orders/'+id),o=d.order;if(Math.abs(+(o.cost_of_goods||0)-r.cost)>.001)await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({delivery_status:o.delivery_status,printed:+(o.printed||0),delivered_amount:amount,delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:r.cost,delivered_pieces:+(o.delivered_pieces||0),returned_pieces:+(o.returned_pieces||0),settlement_note:o.settlement_note||''})})}catch{card.dataset.multiModelKey=''}}
 async function run(){if(state?.view!=='daily-profits')return;for(const c of document.querySelectorAll('.profit-order-card'))await apply(c)}
 new MutationObserver(()=>setTimeout(run,50)).observe(document.documentElement,{childList:true,subtree:true});setInterval(run,500);run();
})();