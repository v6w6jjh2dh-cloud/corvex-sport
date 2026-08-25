(()=>{
  function addDirectButton(){
    if(!window.directOrdersView)return;
    let b=document.getElementById('directOrdersQuickBtn');
    if(!b){
      b=document.createElement('button');
      b.id='directOrdersQuickBtn';
      b.type='button';
      b.className='btn btn-accent';
      b.textContent='⚡ طلبات مباشر';
      b.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483000;min-width:155px;font-weight:900;box-shadow:0 8px 24px rgba(0,0,0,.28)';
      b.onclick=()=>window.directOrdersView();
      document.body.appendChild(b);
    }
  }
  window.addEventListener('load',addDirectButton);
  setTimeout(addDirectButton,300);
  setTimeout(addDirectButton,1200);
  setTimeout(addDirectButton,3000);
})();
