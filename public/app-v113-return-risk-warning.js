// Warns, while a new order is being entered, when the customer has two or more
// consecutive proven returns from the same store. Advisory only: the order can still
// be saved («متابعة رغم التحذير»); nothing about the customer or old orders changes.
(()=>{
  const S=()=>{try{return state}catch{return window.state||{}}};
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canon=v=>{const f=window.canonicalJordanPhone;let p=typeof f==='function'?f(v):String(v||'');p=String(p).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');if(p.startsWith('00962'))p=p.slice(2);if(p.startsWith('962'))p='0'+p.slice(3);if(p.length===9&&p.startsWith('7'))p='0'+p;return p};
  const fmt=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'—';
  let lastKey='',current=null,acknowledged='',timer=null,seq=0;

  function panel(){
    let box=$('#returnRiskNotice');
    if(!box){
      const field=$('#phone')?.closest('.field');if(!field)return null;
      box=document.createElement('div');box.id='returnRiskNotice';box.setAttribute('role','alert');box.hidden=true;
      field.appendChild(box);
    }
    return box;
  }
  function render(){
    const box=panel();if(!box)return;
    const key=current&&`${current.phone}|${current.store_id}`;
    if(!current||!current.warning){box.hidden=true;box.innerHTML='';return}
    if(acknowledged===key){
      box.hidden=false;box.className='return-risk return-risk-ack';
      box.innerHTML=`<span>⚠️ تمت المتابعة رغم التحذير — ${current.count} مرتجعات متتالية لهذا العميل من ${esc(current.store_name)}.</span> <button type="button" class="return-risk-show">عرض التفاصيل</button>`;
      box.querySelector('.return-risk-show').onclick=()=>{acknowledged='';render()};
      return;
    }
    box.hidden=false;box.className='return-risk';
    box.innerHTML=`<div class="return-risk-title">⚠️ العميل مزعج – لا يستلم الطلبات.</div>
      <div class="return-risk-text">لديه ${current.count===2?'طلبان مرتجعان متتاليان':current.count+' طلبات مرتجعة متتالية'} من هذا المتجر. يرجى التأكد من جدية العميل قبل اعتماد الطلب.</div>
      <div class="return-risk-meta"><span>المرتجعات المتتالية: <b>${current.count}</b></span><span>المتجر: <b>${esc(current.store_name||'—')}</b></span></div>
      <div class="return-risk-list">${current.orders.map(o=>`<div class="return-risk-row">
        <button type="button" class="return-risk-order" data-id="${Number(o.id)}" title="فتح تفاصيل الطلب">#${esc(o.order_code)} <span aria-hidden="true">↗</span></button>
        <span>تاريخ الطلب: <b>${fmt(o.print_date||o.order_date)}</b></span>
        <span>تاريخ المرتجع: <b>${fmt(o.return_date)}</b></span>
        <span class="return-risk-status">${esc(o.status_label)}${o.return_source?' • '+esc(o.return_source):''}</span></div>`).join('')}</div>
      <div class="return-risk-actions"><button type="button" class="btn return-risk-cancel">إلغاء الطلب</button><button type="button" class="btn return-risk-continue">متابعة رغم التحذير</button></div>`;
    box.querySelectorAll('.return-risk-order').forEach(b=>b.onclick=()=>openDetails(Number(b.dataset.id)));
    box.querySelector('.return-risk-continue').onclick=()=>{acknowledged=key;render()};
    box.querySelector('.return-risk-cancel').onclick=cancelOrder;
  }
  function cancelOrder(){
    if(!confirm('إلغاء هذا الطلب ومسح البيانات المدخلة؟ لن يتم حفظ أي شيء.'))return;
    for(const id of ['raw','name','phone','address','amount','notes']){const el=document.getElementById(id);if(el){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}))}}
    current=null;lastKey='';acknowledged='';render();
    (window.toast||(()=>{}))('تم إلغاء الطلب ولم يُحفظ');
    $('#raw')?.focus();
  }
  async function openDetails(id){
    // Read-only details in a sheet, so the order being typed is not lost.
    let o;try{o=(await window.api('/orders/'+id)).order}catch(e){return (window.toast||alert)(e.message)}
    const labels={pending:'قيد التوصيل',delivered:'تم التسليم',partial:'تسليم جزئي',delivered_adjusted:'تسليم جزئي',returned:'مرتجع',refused_fee_paid:'رفض مع دفع أجور',refused_no_fee:'رفض بدون أجور',canceled_before_arrival:'ملغي قبل الوصول'};
    const wrap=document.createElement('div');wrap.className='return-risk-sheet';
    wrap.innerHTML=`<div class="return-risk-sheet-card" role="dialog" aria-modal="true"><div class="return-risk-sheet-head"><b>الطلب #${esc(o.order_code)}</b><button type="button" class="return-risk-close" aria-label="إغلاق">✕</button></div>
      ${[['المستلم',o.recipient_name],['الهاتف',o.phone],['المتجر',o.store_name],['المنطقة',[o.area,o.detailed_address].filter(Boolean).join(' — ')],['القيمة',o.amount],['الحالة',labels[o.delivery_status]||o.delivery_status],['تاريخ الإدخال',fmt(o.created_at)],['تاريخ الطباعة',fmt(o.first_printed_at)],['الملاحظات',o.order_notes||o.raw_text]].map(([k,v])=>`<div class="return-risk-sheet-row"><span>${k}</span><b>${esc(v||'—')}</b></div>`).join('')}
      <div class="return-risk-sheet-foot">للعرض فقط — لا يتغير الطلب.</div></div>`;
    const close=()=>wrap.remove();
    wrap.onclick=e=>{if(e.target===wrap||e.target.closest('.return-risk-close'))close()};
    document.body.appendChild(wrap);
  }
  let formPhone=null;
  async function check(){
    if(S().view!=='new'){lastKey='';return}
    // A freshly rendered order form starts with no previous acknowledgement.
    const el=$('#phone');if(el&&el!==formPhone){formPhone=el;acknowledged='';lastKey='';current=null}
    const phone=canon($('#phone')?.value||''),store=$('#store')?.value||'';
    const key=`${phone}|${store}`;if(key===lastKey)return;lastKey=key;
    if(!/^07\d{8}$/.test(phone)||!store){current=null;render();return}
    const mine=++seq;
    try{const d=await window.api('/customer-return-risk?phone='+encodeURIComponent(phone)+'&store_id='+encodeURIComponent(store));if(mine!==seq)return;current=d;render()}
    catch{if(mine===seq){current=null;render()}}
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(check,350)};
  document.addEventListener('input',e=>{if(e.target?.id==='phone')schedule()},true);
  document.addEventListener('change',e=>{if(['phone','store'].includes(e.target?.id))schedule()},true);
  // Auto-fill («تعبئة تلقائية») sets the phone value without an input event.
  setInterval(()=>{if(S().view==='new'&&$('#phone'))check();else{lastKey='';current=null}},800);
  // Saving while the warning is still open asks for a choice first (never blocks for good).
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#saveOrder,#saveNext,#approveDuplicate,#approveDuplicateNew,#approveDuplicateNegative');
    if(!btn||S().view!=='new'||!current?.warning)return;
    if(acknowledged===`${current.phone}|${current.store_id}`)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    $('#returnRiskNotice')?.scrollIntoView({behavior:'smooth',block:'center'});
    $('#returnRiskNotice')?.classList.add('return-risk-pulse');setTimeout(()=>$('#returnRiskNotice')?.classList.remove('return-risk-pulse'),1200);
  },true);
  // A saved order or a new form starts clean.
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view]')){acknowledged='';lastKey=''}},true);

  const style=document.createElement('style');
  style.textContent=`.return-risk{margin-top:10px;padding:12px 14px;border:1px solid #f3b4b4;border-radius:14px;background:#fff1f1;color:#7a1c1c;box-shadow:0 2px 10px rgba(155,28,28,.06)}
  .return-risk-title{font-weight:800;font-size:15px;margin-bottom:4px}
  .return-risk-text{font-size:13px;line-height:1.7;margin-bottom:8px}
  .return-risk-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-bottom:8px}
  .return-risk-list{display:grid;gap:6px;margin-bottom:10px}
  .return-risk-row{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;background:#fff;border:1px solid #f6d0d0;border-radius:10px;padding:7px 10px;font-size:12.5px}
  .return-risk-status{color:#9b4a4a}
  .return-risk-order{border:0;background:#fde2e2;color:#8f1d1d;font:inherit;font-weight:800;padding:2px 9px;border-radius:999px;cursor:pointer}
  .return-risk-order:hover{background:#fbd0d0}
  .return-risk-actions{display:flex;gap:8px;flex-wrap:wrap}
  .return-risk-actions .btn{flex:1;min-width:140px;padding:9px 12px;border-radius:10px;font-weight:700;cursor:pointer}
  .return-risk-cancel{background:#b42318;color:#fff;border:1px solid #b42318}
  .return-risk-continue{background:#fff;color:#7a1c1c;border:1px solid #e9a5a5}
  .return-risk-ack{background:#fff7f7;border-style:dashed;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .return-risk-show{border:0;background:none;color:#8f1d1d;text-decoration:underline;cursor:pointer;font:inherit}
  .return-risk-pulse{animation:returnRiskPulse .4s 3}
  @keyframes returnRiskPulse{50%{box-shadow:0 0 0 4px rgba(180,35,24,.25)}}
  .return-risk-sheet{position:fixed;inset:0;background:rgba(15,30,45,.45);display:flex;align-items:flex-end;justify-content:center;z-index:9999}
  .return-risk-sheet-card{background:#fff;width:min(560px,100%);max-height:85vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px}
  @media(min-width:760px){.return-risk-sheet{align-items:center}.return-risk-sheet-card{border-radius:18px}}
  .return-risk-sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:16px}
  .return-risk-close{border:0;background:#f1f4f7;border-radius:999px;width:32px;height:32px;cursor:pointer}
  .return-risk-sheet-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed #e6ebf0;font-size:13px}
  .return-risk-sheet-row span{color:#65798b;white-space:nowrap}.return-risk-sheet-row b{text-align:left;white-space:pre-wrap;font-weight:600}
  .return-risk-sheet-foot{margin-top:10px;font-size:12px;color:#65798b;text-align:center}`;
  document.head.appendChild(style);
})();
