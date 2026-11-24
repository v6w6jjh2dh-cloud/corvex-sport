// New manual order without a product name (owner request 2026-11-24) — Corvex only.
// Before the NEW-order form is saved, the server checks whether a product is named. Only when no product name is
// written at all, the employee is asked to choose one (or save the order as a draft for review). Known products,
// new names and every other flow (edits, imports) are untouched; if the check fails the order is saved as before.
(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const previousApi=api;
  const fromNewOrderForm=body=>{
    const raw=document.getElementById('raw'),save=document.getElementById('saveOrder');
    return !!(raw&&save&&String(body.raw_text||'')===raw.value);
  };
  function ask(catalogue){
    return new Promise(resolve=>{
      const box=document.createElement('div');box.id='productGuard';
      box.innerHTML=`<style>#productGuard{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center}
        #productGuard .pg{background:var(--card,#fff);color:inherit;width:min(520px,100%);border-radius:18px 18px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.25)}
        @media(min-width:700px){#productGuard{align-items:center}#productGuard .pg{border-radius:18px}}
        #productGuard h3{margin:0 0 6px;font-size:18px}#productGuard p{margin:0 0 12px;font-size:14px;opacity:.8}
        #productGuard select{width:100%;font-size:16px;margin-bottom:12px}
        #productGuard .pg-actions{display:grid;gap:8px}#productGuard .btn{width:100%;font-size:16px;padding:12px}</style>
        <div class="pg" role="dialog" aria-modal="true" aria-labelledby="pgTitle">
         <h3 id="pgTitle">اسم المنتج غير مكتوب</h3>
         <p>الطلب فيه لون أو عدد بدون اسم المنتج. اختاري المنتج ليُضاف للملاحظات، أو احفظيه كمسودة للمراجعة.</p>
         <select id="pgProduct" class="select"><option value="">— اختاري المنتج —</option>${catalogue.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select>
         <div class="pg-actions">
          <button id="pgUse" class="btn btn-accent" disabled>إضافة المنتج وحفظ الطلب</button>
          <button id="pgDraft" class="btn btn-soft">حفظ كمسودة للمراجعة</button>
          <button id="pgBack" class="btn btn-soft">رجوع للتعديل</button>
         </div></div>`;
      document.body.appendChild(box);
      const sel=box.querySelector('#pgProduct'),use=box.querySelector('#pgUse');
      sel.onchange=()=>{use.disabled=!sel.value};
      const done=v=>{box.remove();resolve(v)};
      use.onclick=()=>done({product:sel.value});
      box.querySelector('#pgDraft').onclick=()=>done({draft:true});
      box.querySelector('#pgBack').onclick=()=>done({back:true});
    });
  }
  api=async function(path,opts={}){
    const method=String(opts.method||'GET').toUpperCase();
    if(!(path==='/orders'&&method==='POST'))return previousApi(path,opts);
    let body={};try{body=JSON.parse(opts.body||'{}')}catch{return previousApi(path,opts)}
    if(!fromNewOrderForm(body))return previousApi(path,opts);
    const send=async o=>{const r=await previousApi(path,o);
      // an order completed from a draft closes that draft (admin); the draft itself is kept
      const id=window.__corvexDraftId;if(id){window.__corvexDraftId=null;previousApi('/order-drafts',{method:'POST',body:JSON.stringify({action:'close',id})}).catch(()=>{})}
      return r};
    let check=null;
    try{check=await previousApi('/order-product-check',{method:'POST',body:JSON.stringify({store_id:body.store_id,order_notes:body.order_notes,raw_text:body.raw_text})})}catch{check=null}
    if(!check||check.status!=='missing_product')return send(opts);
    const choice=await ask(check.catalogue||[]);
    if(choice.product){
      body.order_notes=[choice.product,String(body.order_notes||'').trim()].filter(Boolean).join('\n');
      const notes=document.getElementById('notes');if(notes)notes.value=body.order_notes;
      return send({...opts,body:JSON.stringify(body)});
    }
    if(choice.draft){
      await previousApi('/order-drafts',{method:'POST',body:JSON.stringify({action:'save',reason:'missing_product',payload:body})});
      const e=new Error('حُفظ الطلب كمسودة للمراجعة — لم يُعتمد كطلب مكتمل');e.draftSaved=true;throw e;
    }
    throw new Error('اكتبي اسم المنتج في الطلب ثم احفظي');
  };
})();
