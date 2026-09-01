(()=>{
 const KEY='corvex_last_view_v1';
 const restorable=new Set(['dashboard','orders','new','deleted-orders','stores','store-add','store-orders','reports','daily-profits','returns-center','direct-orders','model-performance','permissions','users','regions','couriers','courier-add','courier-settlement','delivery-reconcile','store-account','print','batches','admin-reset']);
 function remember(){try{if(state?.user&&restorable.has(state.view))localStorage.setItem(KEY,state.view)}catch{}}
 const obs=new MutationObserver(remember);obs.observe(document.documentElement,{childList:true,subtree:true});
 window.__corvexOpenRememberedView=async function(){
  try{
   const v=localStorage.getItem(KEY);
   if(!state?.user||!v||!restorable.has(v))return false;
   if(v==='model-performance'&&typeof window.modelPerformanceView==='function')await window.modelPerformanceView();
   else if(v==='direct-orders'&&typeof window.directOrdersView==='function')await window.directOrdersView();
   else if(v==='admin-reset'&&typeof window.adminResetView==='function')await window.adminResetView();
   else if(typeof show==='function')await show(v);
   else return false;
   return true;
  }catch{return false}
 };
})();
