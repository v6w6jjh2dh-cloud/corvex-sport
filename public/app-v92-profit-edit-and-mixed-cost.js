(()=>{
 const MODELS=[
  {name:'جيوب سحاب',re:/جيوب\s*سحاب|سحاب\s*جيوب/i,price:2.3},{name:'رياضة سحاب',re:/رياض[هة]\s*سحاب|سحاب\s*رياض[هة]|بنطلون\s*سحاب/i,price:2.7},{name:'رياضة قطن',re:/رياض[هة]\s*قطن|قطن\s*رياض[هة]|قطن\s*سبور|سبور\s*قطن/i,price:3.5},{name:'تركي',re:/(?:بنطلون\s*)?تركي/i,price:2.7},{name:'ريبوك',re:/ريبوك/i,price:2.5},{name:'باريس',re:/باريس/i,price:2.5},{name:'اولد موني',re:/(?:اولد|أولد|ولد)\s*(?:موني|مني)/i,price:3.5},{name:'M',re:/(?:تيشرت|تيشيرت|تشرت|بلوز[هة]?|بلايز)\s*(?:حرف\s*)?(?:m6|m|م6|م|ام6|أم6|ام|أم)(?=\s|$)/i,price:3},{name:'زرار',re:/بنطلون\s*(?:ب?زرار|بزار|الازرار|الأزرار)|(?:ب?زرار|بزار)/i,price:2.2},{name:'جيوب',re:/(?:قطع\s*)?جيوب(?!\s*سحاب)|بنطلون\s*جيوب(?!\s*سحاب)/i,price:2.2},{name:'تريكو سادة',re:/ساد[هة]\s*تريكو|تريكو\s*ساد[هة]/i,price:2.5},{name:'جاكار',re:/جاكار|ترينغ|تريننغ/i,price:4.25},{name:'بولو صيفي',re:/بولو\s*صيفي|صيفي\s*بولو|تيشرت\s*بولو\s*صيفي|تيشيرت\s*بولو\s*صيفي/i,price:2.8},{name:'بولو',re:/بولو\s*تريكو|تريكو\s*بولو|بولو\s*ترند|تيشرت\s*بولو|تيشيرت\s*بولو|بلوز[هة]\s*بولو/i,price:3.5}
 ];
 function n(s=''){return normalizeDigits(String(s)).replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim()}
 function qtyInLine(s=''){s=n(s);let m=s.match(/(?:عدد|العدد|كميه|تفصيل)\s*[:=\-]?\s*(\d+)/i);if(m)return +m[1];m=s.match(/(?:^|\s)(\d+)\s*(?:قطعه|قطع|حبه|حبات|الوان)(?:\s|$)/i);if(m)return +m[1];m=s.match(/(?:^|\s)(\d+)\s+(?=(?:بنطلون|تيشرت|تيشيرت|تشرت|بلوز|بلايز|جيوب|رياض|قطن|ريبوك|باريس|اولد|ولد|تريكو|بولو))/i);if(m)return +m[1];if(/ثلاث(?:ه)?\s*(?:ال)?الوان/.test(s))return 3;if(/لونين|قطعتين/.test(s))return 2;return 0}
 function isModelLine(line){const x=n(line);return MODELS.some(m=>m.re.test(x))}
 function modelQty(lines,i){
  let q=qtyInLine(lines[i]);if(q)return q;
  // A quantity-only line immediately after a model belongs to that model.
  for(let j=i+1;j<=Math.min(i+2,lines.length-1);j++){if(isModelLine(lines[j]))break;q=qtyInLine(lines[j]);if(q)return q;}
  // A quantity-only line immediately before a model belongs to that model, but never borrow an overall total such as "العدد 4 قطع" when another model follows.
  if(i>0&&!isModelLine(lines[i-1])){q=qtyInLine(lines[i-1]);if(q&&!/^(?:العدد|عدد)\s*\d+\s*قطع?$/i.test(n(lines[i-1])))return q;}
  return 1;
 }
 function calc(text=''){
  const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);let total=0,found=0;
  for(let i=0;i<lines.length;i++){
   const line=n(lines[i]);if(/استرجاع|ارجاع|مرتجع/.test(line))continue;
   for(const model of MODELS){
    if(!model.re.test(line))continue;
    if(model.name==='جيوب'&&/جيوب\s*سحاب|سحاب\s*جيوب/i.test(line))continue;
    if(model.name==='بولو'&&/بولو\s*صيفي|صيفي\s*بولو/i.test(line))continue;
    total+=model.price*modelQty(lines,i);found++;break;
   }
  }
  return{cost:+total.toFixed(2),found};
 }
 function getText(card){const box=card.querySelector('.profit-original-notes');if(!box)return'';return(box.dataset.cleanText||box.innerText.replace(/^نص الطلب الأصلي:\s*/,'')).trim()}
 async function persistCost(card,r){const id=+card.dataset.id;if(!id||!r.found)return;const input=card.querySelector('.profit-cost'),amount=+(card.querySelector('.profit-amount')?.value||0),fee=+(card.querySelector('.profit-fee')?.value||0);if(input&&Math.abs(+input.value-r.cost)>.001){input.value=r.cost.toFixed(2);input.dispatchEvent(new Event('input',{bubbles:true}))}const key=`${id}:${r.cost}`;if(card.dataset.v92CostKey===key)return;card.dataset.v92CostKey=key;try{const d=await api('/orders/'+id),o=d.order;if(o&&Math.abs(+(o.cost_of_goods||0)-r.cost)>.001)await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({delivery_status:o.delivery_status,printed:+(o.printed||0),delivered_amount:amount,delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:r.cost,delivered_pieces:+(o.delivered_pieces||0),returned_pieces:+(o.returned_pieces||0),settlement_note:o.settlement_note||''})})}catch{card.dataset.v92CostKey=''}}
 function bindEdit(card){if(card.dataset.editPhrasesBound==='1')return;card.dataset.editPhrasesBound='1';const box=card.querySelector('.profit-original-notes');if(!box)return;box.dataset.cleanText=getText(card);const btn=document.createElement('button');btn.type='button';btn.className='btn btn-soft';btn.textContent='تعديل جمل الطلب';btn.style.marginBottom='8px';box.parentNode.insertBefore(btn,box);btn.onclick=()=>{if(card.querySelector('.profit-edit-text'))return;const ta=document.createElement('textarea');ta.className='textarea profit-edit-text';ta.value=box.dataset.cleanText||'';ta.style.minHeight='130px';const actions=document.createElement('div');actions.className='actions';actions.style.margin='8px 0';const save=document.createElement('button');save.type='button';save.className='btn btn-accent';save.textContent='حفظ التعديل وإعادة الحساب';const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-soft';cancel.textContent='إلغاء';actions.append(save,cancel);box.style.display='none';box.parentNode.insertBefore(ta,box);box.parentNode.insertBefore(actions,box);cancel.onclick=()=>{ta.remove();actions.remove();box.style.display=''};save.onclick=async()=>{const text=ta.value.trim();if(!text)return toast('اكتب جمل الطلب أولًا');save.disabled=true;try{await api('/profit-note-edit',{method:'POST',body:JSON.stringify({order_id:+card.dataset.id,text})});box.dataset.cleanText=text;box.innerHTML='<b>نص الطلب الأصلي:</b><br>'+esc(text).replace(/\n/g,'<br>');ta.remove();actions.remove();box.style.display='';card.dataset.v92CostKey='';const r=calc(text);if(r.found)await persistCost(card,r);toast('تم حفظ جمل الطلب وإعادة الحساب')}catch(e){toast(e.message)}finally{save.disabled=false}}}}
 async function run(){if(state?.view!=='daily-profits')return;for(const card of document.querySelectorAll('.profit-order-card')){bindEdit(card);if(card.dataset.status==='partial')continue;const r=calc(getText(card));if(r.found){card.querySelectorAll('.local-unknown').forEach(x=>x.remove());await persistCost(card,r)}}}
 new MutationObserver(()=>setTimeout(run,40)).observe(document.documentElement,{childList:true,subtree:true});setInterval(run,700);run();
})();