// «تدقيق فروقات المرتجعات التاريخية» on the inventory page. Completely separate from closing
// new returns statements: it only reports, and adds stock only for rows the admin ticks and
// confirms. Read-only until «تطبيق التصحيح المحدد».
(()=>{
  const S=()=>{try{return state}catch{return window.state||{}}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=x=>(x||[]).map(i=>esc(i.model_name)+' × '+i.quantity).join('، ')||'—';
  const tone={bug_not_deducted:'bad',ok:'ok',missing:'bad',count_excluded:'warn',mixed:'warn',never_deducted:'muted',no_baseline:'warn',unrecognized:'warn',review:'warn'};
  const fmt=t=>t||'—';

  function mount(){
    if(S().view!=='inventory'||document.getElementById('invAuditCard'))return;
    const title=document.querySelector('#content .page-title');if(!title)return;
    const card=document.createElement('div');card.className='card';card.id='invAuditCard';card.style.marginBottom='16px';
    card.innerHTML=`<b>تدقيق فروقات المرتجعات التاريخية</b><div class="sub">منفصل عن تسكير كشوف المرتجعات. يعرض الشحنات المسكّرة سابقًا وسبب عدم إضافتها للمخزون، ولا يغيّر أي رصيد إلا للطلبات التي تختارها وتؤكدها.</div><button type="button" id="invAuditRun" class="btn btn-soft" style="margin-top:12px">فحص الفروقات</button><div id="invAuditResult"></div>`;
    title.after(card);
    card.querySelector('#invAuditRun').onclick=run;
  }
  async function run(){
    const box=document.getElementById('invAuditResult');box.innerHTML='<div class="sub" style="margin-top:10px">جارٍ الفحص...</div>';
    try{
      const d=await window.api('/inventory-return-audit');const s=d.summary,ev=d.evidence||{};
      const before=d.rows.filter(r=>r.kind!=='ok'&&r.printed_before_system),after=d.rows.filter(r=>r.kind!=='ok'&&!r.printed_before_system);
      const actionable=d.rows.filter(r=>['missing','count_excluded','mixed'].includes(r.kind)&&r.proposed.length);
      const status=s.needs_attention?`<div class="inv-audit-alert">⚠ ${s.needs_attention} من ${s.closed_shipments} شحنة تحتاج مراجعة أو قرارًا — لا يوجد ما يثبت أن جردها صحيح.</div>`:`<div class="inv-audit-okmsg">✓ كل الشحنات المسكّرة (${s.closed_shipments}) مُضافة للمخزون بحركات مسجلة.</div>`;
      const evidence=`<div class="inv-audit-why"><b>السبب والدليل من سجل الحركات</b><br>
        • تفعيل الخصم عند أول طباعة: <b><bdi dir="ltr">${esc(ev.activated_at||'—')}</bdi></b>. قبلها كان النظام يخصم عند التسليم فقط، فالطلبات التي طُبعت قبل هذا الوقت ثم رجعت لم تُخصم أصلًا.<br>
        • حركات «خصم أول طباعة» المسجلة: <b>${ev.deduction_movements||0}</b> حركة لـ <b>${ev.deducted_orders||0}</b> طلب${ev.first_deduction?` (من <bdi dir="ltr">${esc(ev.first_deduction)}</bdi> إلى <bdi dir="ltr">${esc(ev.last_deduction)}</bdi>)`:' — لا يوجد أي خصم مسجل حتى الآن'}.<br>
        • طلبات طُبعت بعد التفعيل: <b>${ev.printed_since_activation||0}</b>، منها مخصومة: <b>${ev.printed_since_activation_deducted||0}</b>.<br>
        • من الشحنات المسكّرة بدون خصم: <b>${s.no_deduction_before_system}</b> طُبعت قبل التفعيل، و<b>${s.printed_after_activation_without_deduction}</b> بعده (خلل يحتاج تحقيقًا).</div>`;
      const cells=[['شحنات مسكّرة',s.closed_shipments,''],['مُضافة بحركة مسجلة',s.ok,'ok'],['خُصمت ولم تُضف',s.missing+' • '+s.missing_pieces+' قطعة','bad'],['قبل التفعيل: مرشحة للإضافة',s.count_excluded+' • '+s.count_excluded_pieces+' قطعة','warn'],['قبل التفعيل: لم تُخصم',s.never_deducted,''],['قبل التفعيل: بدون جرد مرجعي',s.no_baseline,'warn'],['بعد التفعيل: لم تُخصم (خلل)',s.bug_not_deducted+s.unrecognized,'bad'],['تحتاج مراجعة',s.review,'warn']];
      const card=r=>`<div class="inv-audit-row ${tone[r.kind]||''}">
          ${actionable.includes(r)?`<input type="checkbox" class="inv-audit-pick" value="${r.order_id}" aria-label="اختيار الطلب ${esc(r.order_code)}">`:'<span class="inv-audit-nopick"></span>'}
          <div class="inv-audit-body">
            <div class="inv-audit-head"><button type="button" class="inv-audit-order" data-id="${r.order_id}">#${esc(r.order_code)} <span aria-hidden="true">↗</span></button><span class="inv-audit-tag">${esc(r.label)}</span></div>
            <div class="inv-audit-line"><span>الشحنة</span><b>${esc(r.shipment_code||'—')}</b></div>
            <div class="inv-audit-line"><span>الكشف</span><b>#${r.report_id} — ${esc(r.closed_on||'')}</b></div>
            <div class="inv-audit-line"><span>حالة الطلب</span><b>${esc(r.status_ar||r.status)}</b></div>
            <div class="inv-audit-line"><span>تاريخ الطباعة</span><b><bdi dir="ltr">${esc(r.printed_at||'—')}</bdi></b></div>
            <div class="inv-audit-line"><span>المخصوم عند الطباعة</span><b>${list(r.deducted)}</b></div>
            <div class="inv-audit-line"><span>المضاف سابقًا</span><b>${list(r.already_added)}</b></div>
            ${r.per_model?r.per_model.map(p=>`<div class="inv-audit-line"><span>${esc(p.model_name)} × ${p.quantity}</span><b>${esc(p.label)}${p.baseline_at?` <small>(آخر جرد <bdi dir="ltr">${esc(p.baseline_at)}</bdi>)</small>`:''}</b></div>`).join(''):''}
            ${r.proposed.length?`<div class="inv-audit-line"><span>المقترح إضافته</span><b>${list(r.proposed)}</b></div>`:''}
            ${r.note?`<div class="inv-audit-note">${esc(r.note)}</div>`:''}
          </div></div>`;
      const section=(title,rows,open)=>rows.length?`<details class="inv-audit-section" ${open?'open':''}><summary>${title} <b>(${rows.length})</b></summary><div class="inv-audit-list">${rows.map(card).join('')}</div></details>`:'';
      box.innerHTML=status+`<div class="inv-audit-grid">${cells.map(([k,v,t])=>`<div class="${t}"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`+evidence+
        section('طُبعت بعد تفعيل الخصم ولم تُخصم أو لم تُضف',after,true)+section('طُبعت قبل تفعيل الخصم عند الطباعة',before,!after.length)+
        (actionable.length?`<div class="inv-audit-actions"><button type="button" class="btn btn-soft" id="invAuditAll">تحديد كل المقترح</button><button type="button" class="btn btn-primary" id="invAuditApply">تطبيق التصحيح المحدد</button></div>`:'')+
        `<div class="sub" style="margin-top:8px">لن يتغير أي رصيد قبل اختيارك وتأكيدك.</div>`;
      box.querySelectorAll('.inv-audit-order').forEach(b=>b.onclick=e=>{e.preventDefault();openOrder(Number(b.dataset.id))});
      document.getElementById('invAuditAll')?.addEventListener('click',()=>box.querySelectorAll('.inv-audit-pick').forEach(x=>x.checked=true));
      document.getElementById('invAuditApply')?.addEventListener('click',async()=>{
        const ids=[...box.querySelectorAll('.inv-audit-pick:checked')].map(x=>Number(x.value));
        if(!ids.length)return (window.toast||alert)('اختر الطلبات التي توافق على تصحيحها');
        const chosen=actionable.filter(r=>ids.includes(r.order_id)),pieces=chosen.reduce((n,r)=>n+r.proposed.reduce((m,p)=>m+p.quantity,0),0);
        if(!confirm(`سيتم إضافة ${pieces} قطعة للمخزون عن ${chosen.length} طلب كتصحيح تاريخي بموافقتك.\n${chosen.map(r=>'#'+r.order_code+': '+r.proposed.map(p=>p.model_name+' × '+p.quantity).join('، ')).join('\n')}\nتأكيد؟`))return;
        try{const res=await window.api('/inventory-return-audit',{method:'POST',body:JSON.stringify({action:'apply',confirm:'تطبيق التصحيح',items:ids.map(order_id=>({order_id}))})});(window.toast||alert)(`تمت إضافة ${res.applied_pieces} قطعة عن ${res.applied_orders} طلب`);window.inventoryView?.()}
        catch(e){(window.toast||alert)(e.message)}
      });
    }catch(e){box.innerHTML='<div class="sub" style="margin-top:10px">تعذر الفحص: '+esc(e.message)+'</div>'}
  }
  async function openOrder(id){
    let o;try{o=(await window.api('/orders/'+id)).order}catch(e){return (window.toast||alert)(e.message)}
    const wrap=document.createElement('div');wrap.className='inv-sheet';
    const ar={pending:'قيد التوصيل',delivered:'تم التسليم',partial:'تسليم جزئي',delivered_adjusted:'تسليم جزئي',returned:'مرتجع',refused_fee_paid:'رفض مع دفع أجور',refused_no_fee:'رفض بدون أجور',canceled_before_arrival:'ملغي قبل الوصول'};
    const f=v=>{if(!v)return '—';const d=new Date(String(v).replace(' ','T')+'Z');return isNaN(d)?String(v):d.toLocaleString('en-GB',{timeZone:'Asia/Amman',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',','')};
    wrap.innerHTML=`<div class="inv-sheet-card" role="dialog" aria-modal="true"><div class="inv-sheet-head"><b>الطلب #${esc(o.order_code)}</b><button type="button" class="inv-sheet-close" aria-label="إغلاق">✕</button></div>
      ${[['المستلم',o.recipient_name],['الهاتف',o.phone],['المتجر',o.store_name],['المنطقة',[o.area,o.detailed_address].filter(Boolean).join(' — ')],['الحالة',ar[o.delivery_status]||o.delivery_status],['أول طباعة',f(o.first_printed_at)],['نص الطلب',o.order_notes||o.raw_text]].map(([k,v])=>`<div class="inv-sheet-row"><span>${k}</span><b>${esc(v||'—')}</b></div>`).join('')}
      <div class="sub" style="text-align:center;margin-top:8px">للعرض فقط.</div></div>`;
    wrap.onclick=e=>{if(e.target===wrap||e.target.closest('.inv-sheet-close'))wrap.remove()};document.body.appendChild(wrap);
  }
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  const style=document.createElement('style');
  style.textContent=`.inv-audit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0}.inv-audit-grid div{background:#f7f9fb;border-radius:10px;padding:8px;text-align:center}.inv-audit-grid span{display:block;font-size:12px;color:#65798b}.inv-audit-grid b{font-size:16px;color:#173750}.inv-audit-grid .ok b{color:#1e6b3a}.inv-audit-grid .bad b{color:#9b1c1c}.inv-audit-grid .warn b{color:#8a5a00}
  .inv-audit-why{background:#f6f8fb;border:1px solid #e3e9f0;border-radius:10px;padding:10px;line-height:1.8;font-size:13px;margin-bottom:10px}
  .inv-audit-list{display:grid;gap:8px;max-height:520px;overflow:auto}.inv-audit-row{display:flex;gap:10px;align-items:flex-start;border:1px solid #e4e9f0;border-radius:12px;padding:10px;background:#fff;cursor:pointer;line-height:1.7}.inv-audit-row.bad{border-color:#f3c1c1;background:#fff8f8}.inv-audit-row.warn{border-color:#f2d58e;background:#fffcf3}.inv-audit-row.muted{opacity:.85}.inv-audit-row small{color:#4f6274}.inv-audit-nopick{width:16px;flex:0 0 16px}.inv-audit-tag{display:inline-block;font-size:12px;border-radius:999px;padding:1px 8px;background:#eef3f7}.inv-audit-row.bad .inv-audit-tag{background:#fde2e2;color:#8f1d1d}.inv-audit-row.warn .inv-audit-tag{background:#fff0cc;color:#8a5a00}
  .inv-audit-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .inv-audit-alert{margin:12px 0;padding:10px 12px;border-radius:12px;background:#fff1f1;border:1px solid #f3b4b4;color:#8f1d1d;font-weight:700}.inv-audit-okmsg{margin:12px 0;padding:10px 12px;border-radius:12px;background:#ecf8f0;color:#1e6b3a;font-weight:700}
  .inv-audit-section{border:1px solid #e4e9f0;border-radius:12px;padding:10px;margin-top:10px}.inv-audit-section summary{cursor:pointer;font-weight:700;color:#173750}
  .inv-audit-row{display:flex;gap:10px;align-items:flex-start;border:1px solid #e4e9f0;border-radius:12px;padding:10px;background:#fff;line-height:1.6}.inv-audit-body{flex:1;min-width:0}
  .inv-audit-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}.inv-audit-order{border:0;background:#eef5fb;color:#145082;font:inherit;font-weight:800;padding:2px 10px;border-radius:999px;cursor:pointer}
  .inv-audit-line{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed #edf1f5;font-size:13px}.inv-audit-line:last-child{border-bottom:0}.inv-audit-line span{color:#65798b;white-space:nowrap}.inv-audit-line b{text-align:left;font-weight:600;overflow-wrap:anywhere}
  .inv-audit-note{font-size:12.5px;color:#4f6274;margin-top:4px}
  .inv-sheet{position:fixed;inset:0;background:rgba(15,30,45,.45);display:flex;align-items:flex-end;justify-content:center;z-index:9999}.inv-sheet-card{background:#fff;width:min(560px,100%);max-height:85vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px}@media(min-width:760px){.inv-sheet{align-items:center}.inv-sheet-card{border-radius:18px}}
  .inv-sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.inv-sheet-close{border:0;background:#f1f4f7;border-radius:999px;width:32px;height:32px}.inv-sheet-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed #e6ebf0;font-size:13px}.inv-sheet-row span{color:#65798b;white-space:nowrap}.inv-sheet-row b{text-align:left;white-space:pre-wrap;font-weight:600}
  @media(max-width:640px){.inv-audit-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inv-audit-line{flex-direction:column;gap:0}.inv-audit-line b{text-align:right}}`;
  document.head.appendChild(style);
})();
