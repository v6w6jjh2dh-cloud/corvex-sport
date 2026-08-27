(()=>{
 const MODELS=[
  [/جيوب\s*سحاب|سحاب\s*جيوب/i,2.3],[/رياض[هة]\s*سحاب|سحاب\s*رياض[هة]|بنطلون\s*سحاب/i,2.7],[/رياض[هة]\s*قطن|قطن\s*رياض[هة]|قطن\s*سبور|سبور\s*قطن/i,3.5],
  [/(?:بنطلون\s*)?تركي/i,2.7],[/ريبوك/i,2.5],[/باريس/i,2.5],[/(?:اولد|أولد|ولد)\s*(?:موني|مني)/i,3.5],
  [/(?:^|\s)(?:\d+\s*)?(?:تيشرت|تيشيرت|تشرت|بلوز[هة]?|بلايز)\s*(?:حرف\s*)?(?:m6|m|م6|م|ام6|أم6|ام|أم)(?=\s|$)/i,3],
  [/بنطلون\s*(?:ب?زرار|بزار|الازرار|الأزرار)|(?:ب?زرار|بزار)/i,2.2],[/(?:قطع\s*)?جيوب(?!\s*سحاب)|بنطلون\s*جيوب(?!\s*سحاب)/i,2.2],
  [/ساد[هة]\s*تريكو|تريكو\s*ساد[هة]/i,2.5],[/جاكار|ترينغ|تريننغ/i,4.25],[/بولو\s*صيفي|صيفي\s*بولو|تيشرت\s*بولو\s*صيفي|تيشيرت\s*بولو\s*صيفي/i,2.8],[/بولو\s*تريكو|تريكو\s*بولو|بولو\s*ترند|تيشرت\s*بولو|تيشيرت\s*بولو|بلوز[هة]\s*بولو/i,3.5]
 ];
 function n(s=''){return normalizeDigits(String(s)).replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim()}
 function q(s=''){s=n(s);let m=s.match(/(?:عدد|العدد|كميه|تفصيل)\s*[:=\-]?\s*(\d+)/i);if(m)return Math.max(1,+m[1]);m=s.match(/(?:^|\s)(\d+)\s*(?:قطعه|قطع|حبه|حبات|الوان)(?:\s|$)/i);if(m)return Math.max(1,+m[1]);if(/ثلاث(?:ه)?\s*(?:ال)?الوان/.test(s))return 3;if(/لونين|قطعتين/.test(s))return 2;return 1}
 function calc(text=''){const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);let total=0,found=0;for(let i=0;i<lines.length;i++){const line=n(lines[i]);if(/استرجاع|ارجاع|مرتجع/.test(line))continue;for(const [re,p] of MODELS){if(!re.test(line))continue;total+=p*q([lines[i-1]||'',line,lines[i+1]||'',lines[i+2]||''].join(' '));found++;break}}return{found,cost:+total.toFixed(2)}}
 function refresh(){
  if(state?.view!=='daily-profits')return;
  document.querySelectorAll('.profit-ai').forEach(b=>b.remove());
  document.querySelector('#profitAiAll')?.closest('.actions')?.remove();
  document.querySelectorAll('.profit-order-card').forEach(card=>{
   const notes=card.querySelector('.profit-original-notes')?.innerText||'';
   if(card.dataset.status!=='partial'){
    const r=calc(notes),head=card.querySelector('.section-head');
    if(!r.found&&head&&!head.querySelector('.local-unknown'))head.insertAdjacentHTML('beforeend','<span class="badge badge-warn local-unknown">موديل غير معرّف</span>');
   }
   const btn=card.querySelector('.profit-partial-ai');
   if(btn&&!btn.dataset.localBound){btn.dataset.localBound='1';btn.textContent='حساب كوست القطع المكتوبة';btn.onclick=()=>{const text=card.querySelector('.profit-partial-items')?.value.trim()||'';if(!text)return toast('اكتب القطع التي تم تسليمها أولًا');const r=calc(text);if(!r.found)return toast('الموديل غير معرّف — أدخل الكوست يدويًا');card.querySelector('.profit-cost').value=r.cost.toFixed(2);card.querySelector('.profit-cost').dispatchEvent(new Event('input',{bubbles:true}));toast('تم حساب كوست القطع المكتوبة')};}
  });
 }
 new MutationObserver(()=>setTimeout(refresh,30)).observe(document.documentElement,{childList:true,subtree:true});setInterval(refresh,500);refresh();
})();