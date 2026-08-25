(()=>{
  const inflight=new Map();
  const previousApi=api;
  api=function(path,opts={}){
    const method=String(opts.method||'GET').toUpperCase();
    if(path==='/orders'&&method==='POST'){
      let body={};try{body=JSON.parse(opts.body||'{}')}catch{}
      const key=[body.store_id||'',String(body.phone||'').replace(/\D/g,''),body.raw_text||'',body.order_notes||'',body.amount||''].join('|');
      if(inflight.has(key))return inflight.get(key);
      const p=previousApi(path,opts).finally(()=>inflight.delete(key));
      inflight.set(key,p);
      return p;
    }
    return previousApi(path,opts);
  };

  const oldConfirm=window.confirm.bind(window);
  window.confirm=function(message){
    const m=String(message||'');
    if(m.startsWith('تنبيه: يوجد ')&&m.includes('طلب قريب لنفس الرقم خلال آخر 7 أيام'))return true;
    return oldConfirm(message);
  };

  function guardButtons(){
    ['saveOrder','saveNext'].forEach(id=>{
      const b=document.getElementById(id);if(!b||b.dataset.rapidGuard)return;b.dataset.rapidGuard='1';
      b.addEventListener('click',()=>{
        if(b.dataset.busy==='1')return;
        b.dataset.busy='1';
        const mate=document.getElementById(id==='saveOrder'?'saveNext':'saveOrder');
        b.disabled=true;if(mate)mate.disabled=true;
        setTimeout(()=>{b.dataset.busy='0';b.disabled=false;if(mate)mate.disabled=false},2500);
      },true);
    });
  }
  new MutationObserver(guardButtons).observe(document.documentElement,{childList:true,subtree:true});
  guardButtons();
})();
