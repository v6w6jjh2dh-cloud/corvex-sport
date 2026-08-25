(()=>{
 const KEY='corvex_last_view_v1';
 const restorable=new Set(['dashboard','orders','new','stores','store-orders','reports','profits','returns-center','direct-orders','model-performance','permissions','users','regions','couriers','courier-settlement','delivery-reconcile','store-account','admin-reset']);
 function remember(){try{if(state?.user&&restorable.has(state.view))localStorage.setItem(KEY,state.view)}catch{}}
 const obs=new MutationObserver(remember);obs.observe(document.documentElement,{childList:true,subtree:true});setInterval(remember,700);
 async function restore(){let tries=0;const timer=setInterval(()=>{tries++;try{const v=localStorage.getItem(KEY);if(state?.user&&v&&restorable.has(v)){clearInterval(timer);if(v==='model-performance'&&typeof window.modelPerformanceView==='function')window.modelPerformanceView();else if(v==='admin-reset'&&typeof window.adminResetView==='function')window.adminResetView();else if(typeof show==='function')show(v)}}catch{}if(tries>20)clearInterval(timer)},150)}
 window.addEventListener('load',restore);
})();
