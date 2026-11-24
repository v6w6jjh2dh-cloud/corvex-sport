// Read-only sheets for the delivery-statement matching screen:
//  [data-rc-order="ID"]      -> order details (GET /api/orders/:id)
//  [data-rc-settlement="ID"] -> previous statement details (GET /api/delivery-reconcile/settlement)
// Nothing here changes data.
(function(){
  if(window.__corvexReconcileLinks)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>(Math.round((Number(n)||0)*100)/100).toFixed(2).replace(/\.00$/,'');
  const ST={pending:'قيد التوصيل',delivered:'تم التسليم',partial:'تسليم جزئي',delivered_adjusted:'تسليم بقيمة معدلة',refused_fee_paid:'مرتجع مع أجور',refused_no_fee:'مرتجع بدون أجور',canceled_before_arrival:'ملغي قبل الوصول',postponed:'مؤجل'};
  const st=v=>ST[v]||v||'—';
  const call=async p=>{if(typeof window.api==='function')return window.api(p);const r=await fetch('/api'+p,{headers:{authorization:'Bearer '+(localStorage.getItem('token')||'')}});const d=await r.json();if(!r.ok)throw new Error(d.error||'خطأ');return d};
  const sheet=(title,body)=>{
    document.querySelectorAll('.rc-sheet').forEach(x=>x.remove());
    const w=document.createElement('div');w.className='rc-sheet';
    w.innerHTML=`<div class="rc-sheet-card" role="dialog" aria-modal="true"><div class="rc-sheet-head"><b>${title}</b><button type="button" class="rc-sheet-close" aria-label="إغلاق">✕</button></div><div class="rc-sheet-body">${body}</div><div class="rc-sheet-ro">عرض فقط — لا يمكن التعديل من هنا</div></div>`;
    w.onclick=e=>{if(e.target===w||e.target.closest('.rc-sheet-close'))w.remove()};
    document.body.appendChild(w);return w;
  };
  const row=(k,v)=>`<div class="rc-row"><span>${k}</span><b>${esc(v??'—')||'—'}</b></div>`;
  const f=v=>{if(!v)return '—';const d=new Date(String(v).replace(' ','T')+(String(v).length<=10||/Z|[+-]\d\d:?\d\d$/.test(v)?'':'Z'));return isNaN(d)?String(v):d.toLocaleString('en-GB',{timeZone:'Asia/Amman',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})};
  async function openOrder(id){
    const w=sheet('تفاصيل الطلب','<div class="rc-loading">جارٍ التحميل…</div>');
    try{
      const o=(await call('/orders/'+Number(id))).order||{};
      w.querySelector('.rc-sheet-head b').textContent='الطلب #'+(o.order_code||id);
      w.querySelector('.rc-sheet-body').innerHTML=[
        row('المستلم',o.recipient_name),row('الهاتف',o.phone),row('المتجر',o.store_name),row('المنطقة',[o.area,o.detailed_address].filter(Boolean).join(' — ')),
        row('قيمة الطلب',money(o.amount)+' د.أ'),row('حالة التوصيل',st(o.delivery_status)),row('المبلغ المسلّم',o.delivered_amount==null?'—':money(o.delivered_amount)+' د.أ'),
        row('أول طباعة',f(o.first_printed_at)),row('تاريخ الإنشاء',f(o.created_at)),
        row('مسوّى مع شركة التوصيل',Number(o.delivery_company_settled||0)?'نعم':'لا'),
        Number(o.delivery_company_settlement_id||0)?`<div class="rc-row"><span>كشف التسوية</span><b><button type="button" class="rc-link" data-rc-settlement="${Number(o.delivery_company_settlement_id)}">فتح الكشف ↗</button></b></div>`:'',
        row('نص الطلب',o.order_notes||o.raw_text),
        `<button type="button" class="rc-inv-btn" data-rc-investigate="${Number(o.id)}">🔍 تحقيق كامل في الطلب (قراءة فقط)</button>`].join('');
    }catch(e){w.querySelector('.rc-sheet-body').innerHTML=`<div class="rc-err">${esc(e.message)}</div>`}
  }
  async function openSettlement(id){
    const w=sheet('تفاصيل كشف التسوية','<div class="rc-loading">جارٍ التحميل…</div>');
    try{
      const d=await call('/delivery-reconcile/settlement?id='+Number(id)),s=d.settlement||{};
      w.querySelector('.rc-sheet-head b').textContent='كشف '+(s.settlement_code||id);
      w.querySelector('.rc-sheet-body').innerHTML=[
        row('المتجر',s.store_name),row('تاريخ الكشف',s.statement_date||'—'),row('تاريخ الحفظ',f(s.created_at)),row('حفظه',s.created_by_name),
        row('عدد الطلبات المطابقة',s.matched_count),row('المحصّل',money(s.collected_amount)+' د.أ'),row('صافي التحصيل',money(s.net_due)+' د.أ')].join('')+
        `<h4 class="rc-sub">الطلبات في هذا الكشف (${(d.orders||[]).length})</h4>`+
        (d.orders||[]).map(o=>`<div class="rc-order"><div><button type="button" class="rc-link" data-rc-order="${Number(o.order_id)}">#${esc(o.order_code||o.order_id)}</button> • ${esc(o.recipient_name||'')}<div class="rc-muted">${esc(o.phone||'')} • طباعة ${esc(o.first_print_date||'—')}</div></div>
          <div class="rc-order-r"><b>${money(o.imported_amount)} د.أ</b><div class="rc-muted">بالكشف: ${esc(o.imported_status||'—')} • المعتمد: ${esc(st(o.applied_status))}</div></div></div>`).join('');
    }catch(e){w.querySelector('.rc-sheet-body').innerHTML=`<div class="rc-err">${esc(e.message)}</div>`}
  }
  async function openInvestigation(id){
    const w=sheet('تحقيق في الطلب','<div class="rc-loading">جارٍ جمع كل السجلات…</div>');
    try{
      const d=await call('/order-investigation?id='+Number(id)),o=d.order||{};
      w.querySelector('.rc-sheet-head b').textContent='تحقيق — الطلب #'+(o.order_code||id);
      const sec=(t,b)=>`<details class="rc-sec" open><summary>${t}</summary>${b}</details>`;
      const list=(items,fn)=>items&&items.length?items.map(fn).join(''):'<div class="rc-muted">لا يوجد</div>';
      w.querySelector('.rc-sheet-body').innerHTML=
        `<div class="rc-find">${(d.findings||[]).map(x=>`<p>${esc(x)}</p>`).join('')}</div>`+
        ((d.hints||[]).length?`<div class="rc-hint"><b>ما تشير إليه السجلات (ليس قرارًا):</b>${d.hints.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:'')+
        sec('سطور كشوف شركة التوصيل لهذا الطلب',list(d.settlement_lines,l=>`<div class="rc-order"><div><button type="button" class="rc-link" data-rc-settlement="${Number(l.settlement_id)}">${esc(l.settlement_code)}</button><div class="rc-muted">تاريخ الكشف ${esc(l.statement_date||'—')} • حُفظ ${esc(l.saved_at||'—')} • ${esc(String(l.match_type||'').startsWith('manual')?'ربط يدوي':'ربط تلقائي')}</div></div><div class="rc-order-r"><b>${money(l.imported_amount)} د.أ</b><div class="rc-muted">بالكشف: ${esc(l.imported_status||'—')} • المعتمد: ${esc(st(l.applied_status))}${l.shipment_date?' • شحنة '+esc(l.shipment_date):''}</div></div></div>`))+
        sec('طلبات أخرى لنفس الهاتف',list(d.same_phone_orders,x=>`<div class="rc-order"><div><button type="button" class="rc-link" data-rc-order="${Number(x.id)}">#${esc(x.order_code)}</button><div class="rc-muted">${esc(x.store_name||'')} • طُبع ${esc(x.first_printed_local||'—')}</div></div><div class="rc-order-r"><b>${money(x.amount)} د.أ</b><div class="rc-muted">${esc(st(x.delivery_status))}${Number(x.settled)?' • مسوّى '+esc(x.settlement_code||''):' • غير مسوّى'}</div></div></div>`))+
        sec('الطباعة',list(d.prints,p=>`<div class="rc-row"><span>${esc(p.batch_code)}</span><b>${esc(p.at)}${p.by_name?' • '+esc(p.by_name):''}</b></div>`))+
        sec('المخزون',`<div class="rc-muted">الخصم عند الطباعة: ${(d.inventory?.allocation||[]).map(a=>esc(a.model_name)+' × '+a.quantity).join('، ')||'لا يوجد'}</div>`+list(d.inventory?.movements,m=>`<div class="rc-row"><span>${esc(m.at)}</span><b>${esc(m.model_name||'')} ${Number(m.quantity_delta)>0?'+':''}${m.quantity_delta} • ${esc(m.note||m.movement_type||'')}</b></div>`))+
        sec('استلام المرتجع بالمستودع',(d.warehouse?.closed_report?`<p>كشف مرتجعات #${esc(d.warehouse.closed_report.report_id||'')} • ${esc(d.warehouse.closed_report.closed_at||'')}</p>`:'')+list([...(d.warehouse?.receipts||[]),...(d.warehouse?.scans||[])],x=>`<div class="rc-row"><span>${esc(x.at||'')}</span><b>${esc(x.shipment_code||x.result||'')}</b></div>`))+
        sec('سجل تغييرات الحالة',list(d.status_history,h=>`<div class="rc-row"><span>${esc(h.at)}${h.by_name?' • '+esc(h.by_name):''}</span><b>${esc(st(h.from_status))} ← ${esc(st(h.to_status))} • ${esc(({delivery_statement:'كشف شركة التوصيل',settlement_correction:'تصحيح تسوية',manual_bulk_status:'تغيير يدوي',cargo_returns_statement:'كشف مرتجعات',other:'غير محدد'})[String(h.source).split(':')[0]]||h.source)}${String(h.source).includes(':')?' '+esc(String(h.source).split(':').slice(1).join(':')):''}</b></div>`))+
        sec('تصحيحات التسوية',list(d.corrections,c=>`<div class="rc-row"><span>${esc(c.at)}${c.by_name?' • '+esc(c.by_name):''}</span><b>${esc(st(c.from_status))} ← ${esc(st(c.to_status))} • فرق ${money(c.cash_difference)} • ${esc(c.reason||'')}</b></div>`))+
        sec('سجل التعديلات',list(d.audit,a=>`<div class="rc-row"><span>${esc(a.at)}</span><b>${esc(a.event_type)} ${esc(a.note||'')}</b></div>`));
    }catch(e){w.querySelector('.rc-sheet-body').innerHTML=`<div class="rc-err">${esc(e.message)}</div>`}
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-rc-order],[data-rc-settlement],[data-rc-investigate]');if(!a)return;
    e.preventDefault();e.stopPropagation();
    if(a.dataset.rcInvestigate){openInvestigation(a.dataset.rcInvestigate);return}
    if(a.dataset.rcOrder)openOrder(a.dataset.rcOrder);else openSettlement(a.dataset.rcSettlement);
  },true);
  const css=document.createElement('style');
  css.textContent=`.rc-link{border:0;background:none;padding:0;color:#0b6bcb;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
  .rc-sheet{position:fixed;inset:0;background:rgba(15,30,45,.45);display:flex;align-items:flex-end;justify-content:center;z-index:10000}
  .rc-sheet-card{background:#fff;width:min(600px,100%);max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px}
  @media(min-width:760px){.rc-sheet{align-items:center}.rc-sheet-card{border-radius:18px}}
  .rc-sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.rc-sheet-close{border:0;background:#f1f4f7;border-radius:999px;width:32px;height:32px}
  .rc-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed #e6ebf0;font-size:13px}.rc-row span{color:#65798b;white-space:nowrap}.rc-row b{text-align:left;white-space:pre-wrap;font-weight:600}
  .rc-sub{margin:14px 0 6px;font-size:14px}.rc-order{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eef1f4;font-size:13px}.rc-order-r{text-align:left}
  .rc-muted{color:#65798b;font-size:12px}.rc-inv-btn{margin-top:12px;width:100%;border:1px solid #d5dde7;background:#f4f6f9;color:#1f3a5f;border-radius:12px;padding:10px;font:inherit;font-weight:700}.rc-find{background:#f4f6f9;border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.8}.rc-find p,.rc-hint p{margin:4px 0}.rc-hint{margin-top:10px;background:#fff7ed;border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.8;color:#7a4100}.rc-sec{margin-top:10px;border-top:1px solid #eef1f4;padding-top:6px}.rc-sec summary{cursor:pointer;font-weight:700;color:#1f3a5f;font-size:14px}.rc-sheet-ro{margin-top:12px;color:#65798b;font-size:12px;text-align:center}.rc-err{color:#b42318}.rc-loading{color:#65798b}`;
  document.head.appendChild(css);
  window.__corvexReconcileLinks={openOrder,openSettlement,openInvestigation};
})();
// ci proof
