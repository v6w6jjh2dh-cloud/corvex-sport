(()=>{
 const OFFERS=[
  {name:'جاكار',re:/جاكار|ترينغ|تريننغ/i,cost:4.25,prices:{1:[8],2:[15],3:[20]},delivery:false},
  {name:'باريس',re:/باريس/i,cost:2.5,prices:{3:[15]},delivery:true},
  {name:'ريبوك',re:/ريبوك|re\s*e?bok|ري\s*bok/i,cost:2.5,prices:{3:[15]},delivery:true},
  {name:'M',re:/(?:تيشرت|تيشيرت|بلوز[هة]?)\s*(?:حرف\s*)?(?:m6|m|م6|م|ام6|ام)(?=\s|$)/i,cost:3,prices:{1:[7],2:[12],3:[15]},delivery:false},
  {name:'تريكو سادة',re:/ساد[هة]\s*تريكو|تريكو\s*ساد[هة]/i,cost:2.5,prices:{1:[7],2:[12],3:[15]},delivery:false},
  {name:'زرار',re:/جيوب\s*زرار|بنطلون\s*زرار|زرار/i,cost:2.2,prices:{1:[7],2:[12],3:[15]},delivery:false},
  {name:'جيوب سحاب',re:/جيوب\s*سحاب|سحاب\s*جيوب/i,cost:2.3,prices:{1:[7],2:[12],3:[15]},delivery:false},
  {name:'جيوب عادي',re:/جيوب\s*عادي|بنطلون\s*جيوب(?!\s*سحاب|\s*زرار)/i,cost:2.2,prices:{1:[5],2:[9],3:[12]},delivery:false},
  {name:'رياضة سحاب',re:/رياض[هة]\s*سحاب|سحاب\s*رياض[هة]/i,cost:2.7,prices:{1:[5],2:[9]},delivery:false},
  {name:'بولو سادة',re:/ساد[هة]\s*بولو|بولو\s*ساد[هة]/i,cost:2.8,prices:{1:[5],2:[10]},delivery:false},
  {name:'بولو تريكو',re:/بولو\s*تريكو|تريكو\s*بولو/i,cost:3.5,prices:{1:[5],2:[9],3:[15]},delivery:false},
  {name:'تركي',re:/بنطلون\s*تركي|(?:^|\s)تركي(?:\s|$)/i,cost:2.7,prices:{1:[5],2:[9],3:[15,16]},delivery:false},
  {name:'كاردونيه',re:/كاردوني[هة]|بجام[هة]\s*كاردوني[هة]/i,cost:3.5,prices:{1:[8],2:[14],3:[18]},delivery:false},
  {name:'تيشيرت قطن',re:/تيش(?:رت|يرت)\s*قطن|قطن\s*سبور/i,cost:3.3,prices:{1:[7],2:[12],3:[15]},delivery:false},
  {name:'اولد مني',re:/(?:اولد|ولد)\s*(?:مني|موني)/i,cost:3.5,prices:{1:[7],2:[12],3:[15]},delivery:false}
 ];
 const norm=s=>normalizeDigits(String(s||'')).replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
 function inferByAmount(text,amount,fee){const t=norm(text),hits=OFFERS.filter(x=>x.re.test(t));if(hits.length!==1)return null;const m=hits[0],matches=[];for(const [qty,vals] of Object.entries(m.prices))for(const base of vals){const expected=m.delivery?base:base+fee;const diff=expected-amount;if(diff>=0&&diff<=3)matches.push({qty:+qty,expected,diff})}matches.sort((a,b)=>a.diff-b.diff||b.qty-a.qty);if(!matches.length)return null;if(matches.length>1&&matches[0].diff===matches[1].diff&&matches[0].qty!==matches[1].qty)return null;const best=matches[0];return{model:m,qty:best.qty,cost:+(best.qty*m.cost).toFixed(2),expected:best.expected,diff:best.diff}}
 async function run(){if(state?.view!=='daily-profits')return;for(const card of document.querySelectorAll('.profit-order-card[data-status="partial"]')){if(card.dataset.offerPartialDone==='1')continue;const text=card.querySelector('.profit-original-notes')?.innerText||'',amount=+(card.querySelector('.profit-amount')?.value||0),fee=+(card.querySelector('.profit-fee')?.value||2),r=inferByAmount(text,amount,fee);if(!r)continue;card.dataset.offerPartialDone='1';const cost=card.querySelector('.profit-cost');if(cost){cost.value=r.cost.toFixed(2);cost.dispatchEvent(new Event('input',{bubbles:true}))}const ta=card.querySelector('.profit-partial-items');if(ta&&!ta.value.trim())ta.value=`${r.model.name} عدد ${r.qty}`;const note=document.createElement('div');note.className='sub';note.style.margin='8px 0';note.textContent=`استنتاج من عرض البيع: المستلم ${r.qty} ${r.model.name} — كوست ${r.cost.toFixed(2)} د.أ${r.diff?` (فرق/خصم ${r.diff.toFixed(2)} د.أ)`:''}`;card.querySelector('.profit-original-notes')?.parentNode.insertBefore(note,card.querySelector('.profit-original-notes'));try{const id=+card.dataset.id,d=await api('/orders/'+id),o=d.order;await api('/orders/'+id+'/outcome',{method:'PUT',body:JSON.stringify({delivery_status:'partial',printed:+(o.printed||0),delivered_amount:amount,delivery_fee:fee,cash_collected:Math.max(0,amount-fee),cost_of_goods:r.cost,delivered_pieces:r.qty,returned_pieces:+(o.returned_pieces||0),settlement_note:o.settlement_note||''})})}catch{card.dataset.offerPartialDone=''}}}
 new MutationObserver(()=>setTimeout(run,100)).observe(document.documentElement,{childList:true,subtree:true});setInterval(run,1000);run();
})();