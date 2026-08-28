(()=>{
 function unlock(input){
  input.removeAttribute('readonly');input.removeAttribute('disabled');input.readOnly=false;input.disabled=false;input.tabIndex=0;input.style.pointerEvents='auto';input.style.userSelect='text';input.style.webkitUserSelect='text';input.style.opacity='1';input.style.background='#fff';
 }
 function run(){if(state?.view!=='daily-profits')return;document.querySelectorAll('.profit-order-card').forEach(card=>{const input=card.querySelector('.profit-cost');if(!input)return;unlock(input);if(input.dataset.manualCostBound==='1')return;input.dataset.manualCostBound='1';
   const manual=()=>{card.dataset.manualCostOverride='1';card.dataset.manualCostEditing='1';card.dataset.v92CostKey=`manual:${input.value}`;card.dataset.offerPartialDone='1';card.dataset.singlePartialDone='1';};
   input.addEventListener('pointerdown',()=>{unlock(input);card.dataset.manualCostEditing='1'});input.addEventListener('touchstart',()=>{unlock(input);card.dataset.manualCostEditing='1'},{passive:true});input.addEventListener('focus',()=>{unlock(input);card.dataset.manualCostEditing='1'});input.addEventListener('input',manual);input.addEventListener('change',manual);input.addEventListener('blur',()=>{setTimeout(()=>delete card.dataset.manualCostEditing,500)});
  });}
 new MutationObserver(()=>setTimeout(run,20)).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['readonly','disabled']});setInterval(run,250);run();
})();