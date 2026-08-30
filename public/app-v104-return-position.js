(()=>{
 const KEY='corvex_order_return_context_v2';
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}};
 const write=value=>{try{sessionStorage.setItem(KEY,JSON.stringify(value))}catch{}};
 const clear=()=>{try{sessionStorage.removeItem(KEY)}catch{}};
 const selectSnapshot=select=>({value:select?.value||'',label:select?.selectedOptions?.[0]?.textContent?.trim()||''});
 const restoreSelect=(select,saved)=>{
   if(!select)return false;
   const value=typeof saved==='object'?String(saved?.value||''):String(saved||'');
   const label=typeof saved==='object'?String(saved?.label||'').trim():'';
   let option=[...select.options].find(x=>String(x.value)===value);
   if(!option&&label)option=[...select.options].find(x=>x.textContent.trim()===label);
   if(!option&&value==='')option=[...select.options].find(x=>String(x.value)==='');
   if(!option)return false;
   select.value=option.value;
   return true;
 };
 const highlight=element=>{if(!element)return;element.classList.add('corvex-return-target');element.scrollIntoView({block:'center'});setTimeout(()=>element.classList.remove('corvex-return-target'),2600)};
 const waitEvent=(name,action)=>new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;document.removeEventListener(name,finish);resolve()};document.addEventListener(name,finish,{once:true});action();setTimeout(finish,3500)});
 function modelContext(id){const button=document.querySelector(`.mp-open-order[data-id="${id}"]`),card=button?.closest('.model-audit-card');return{type:'model-performance',id:Number(id),model:card?decodeURIComponent(card.dataset.model||''):'',store:selectSnapshot(document.querySelector('#mpStore')),from:document.querySelector('#mpFrom')?.value||'',to:document.querySelector('#mpTo')?.value||''}}
 function profitContext(id){return{type:'daily-profits',id:Number(id),store:selectSnapshot(document.querySelector('#profitStore')),date:document.querySelector('#profitDate')?.value||''}}
 async function backToModel(ctx){state.view='model-performance';await window.modelPerformanceView();const store=document.querySelector('#mpStore'),from=document.querySelector('#mpFrom'),to=document.querySelector('#mpTo');restoreSelect(store,ctx.store);if(from&&ctx.from)from.value=ctx.from;if(to&&ctx.to)to.value=ctx.to;await waitEvent('corvex:model-performance-rendered',()=>document.querySelector('#mpLoad')?.click());restoreSelect(document.querySelector('#mpStore'),ctx.store);const card=[...document.querySelectorAll('.model-audit-card')].find(x=>decodeURIComponent(x.dataset.model||'')===ctx.model);if(card&&!card.querySelector('.model-audit-list'))card.click();await wait(40);highlight(document.querySelector(`.mp-open-order[data-id="${ctx.id}"]`)||card);clear()}
 async function backToProfit(ctx){state.view='daily-profits';await window.dailyProfitsView();const store=document.querySelector('#profitStore'),date=document.querySelector('#profitDate');restoreSelect(store,ctx.store);if(date&&ctx.date)date.value=ctx.date;await waitEvent('corvex:profits-rendered',()=>document.querySelector('#loadProfits')?.click());restoreSelect(document.querySelector('#profitStore'),ctx.store);highlight(document.querySelector(`.profit-order-card[data-id="${ctx.id}"]`));clear()}
 function bindBack(ctx){const action=ctx.type==='model-performance'?()=>backToModel(ctx):()=>backToProfit(ctx),label=ctx.type==='model-performance'?'العودة لأداء الموديلات':'العودة لأرباح المتاجر';for(const button of [document.querySelector('#backToOrders'),document.querySelector('#cancelEditOrder')])if(button){button.textContent=label;button.onclick=action}}
 const originalEdit=window.editOrder;
 if(typeof originalEdit==='function')window.editOrder=async function(id,source){let ctx=null;if(source==='model-performance'||state?.view==='model-performance')ctx=modelContext(id);else if(state?.view==='daily-profits')ctx=profitContext(id);if(ctx)write(ctx);const result=await originalEdit.apply(this,arguments);if(ctx){bindBack(ctx);setTimeout(()=>bindBack(ctx),100);setTimeout(()=>bindBack(ctx),260)}return result};
 const style=document.createElement('style');style.textContent='.corvex-return-target{outline:4px solid #b7ff22!important;box-shadow:0 0 0 7px rgba(183,255,34,.28)!important;transition:.25s}';document.head.appendChild(style);
 window.CORVEX_RETURN_TO_ORDER_CONTEXT=async()=>{const ctx=read();if(!ctx)return false;if(ctx.type==='model-performance')await backToModel(ctx);else if(ctx.type==='daily-profits')await backToProfit(ctx);else return false;return true};
})();
