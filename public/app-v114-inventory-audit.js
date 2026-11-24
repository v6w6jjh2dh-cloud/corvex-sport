// «تدقيق فروقات المرتجعات التاريخية» on the inventory page. Completely separate from closing
// new returns statements: it only reports, and adds stock only for rows the admin ticks and
// confirms. Read-only until «تطبيق التصحيح المحدد».
(()=>{
  const S=()=>{try{return state}catch{return window.state||{}}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=x=>(x||[]).map(i=>esc(i.model_name)+' × '+i.quantity).join('، ')||'—';
  const tone={ok:'ok',missing:'bad',count_excluded:'warn',mixed:'warn',never_deducted:'muted',no_baseline:'warn',unrecognized:'warn',review:'warn'};
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
      const d=await window.api('/inventory-return-audit');const s=d.summary;
      const since=d.deduct_on_print_since;
      const why=s.no_deduction?`<div class="inv-audit-why"><b>لماذا تظهر شحنات «بدون خصم مسجل»؟</b> ${s.no_deduction_before_system} من ${s.no_deduction} شحنة طُبعت ${since?'قبل '+esc(fmt(since))+' (بداية الخصم عند الطباعة)':'قبل تفعيل الخصم عند الطباعة'}؛ لم يُخصم من المخزون عند خروجها، فعدم وجود خصم ليس دليلًا على صحة الجرد. حكم كل شحنة يعتمد على آخر جرد للموديل (تعيين الرصيد أو التصفير): إن خرجت قبل الجرد ورجعت بعده فهي مرشحة للإضافة، وإن خرجت بعده فلا تُضاف لأنها لم تُخصم.</div>`:'';
      const cells=[['شحنات مسكّرة',s.closed_shipments,''],['مُضافة',s.ok,'ok'],['خُصمت ولم تُضف',s.missing+' ('+s.missing_pieces+' قطعة)','bad'],['مرشحة للإضافة (قبل الجرد)',s.count_excluded+' ('+s.count_excluded_pieces+' قطعة)','warn'],['لم تُخصم — لا تُضاف',s.never_deducted,''],['بدون جرد مرجعي',s.no_baseline,'warn'],['تحتاج مراجعة',s.review+s.unrecognized,'warn']];
      const actionable=d.rows.filter(r=>['missing','count_excluded','mixed'].includes(r.kind)&&r.proposed.length);
      box.innerHTML=`<div class="inv-audit-grid">${cells.map(([k,v,t])=>`<div class="${t}"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>${why}
        <div class="inv-audit-list">${d.rows.filter(r=>r.kind!=='ok').map(r=>`<label class="inv-audit-row ${tone[r.kind]||''}">
          ${actionable.includes(r)?`<input type="checkbox" class="inv-audit-pick" value="${r.order_id}">`:'<span class="inv-audit-nopick"></span>'}
          <span class="inv-audit-body"><b>#${esc(r.order_code)}</b> • شحنة ${esc(r.shipment_code)} • كشف #${r.report_id} (${esc(r.closed_on||'')})<br>
          <small>طُبع: <bdi dir="ltr">${esc(r.printed_at||'—')}</bdi> • المخصوم عند الطباعة: ${list(r.deducted)} • المضاف سابقًا: ${list(r.already_added)}</small><br>
          ${r.per_model?`<small>${r.per_model.map(p=>esc(p.model_name)+' × '+p.quantity+': '+esc(p.label)+(p.baseline_at?' (آخر جرد '+esc(fmt(p.baseline_at))+')':'')).join(' • ')}</small><br>`:''}
          <span class="inv-audit-tag">${esc(r.label)}</span>${r.proposed.length?` <small>المقترح إضافته: <b>${list(r.proposed)}</b></small>`:''}${r.note?` <small>${esc(r.note)}</small>`:''}</span></label>`).join('')||'<div class="sub">لا توجد فروقات.</div>'}</div>
        ${actionable.length?`<div class="inv-audit-actions"><button type="button" class="btn btn-soft" id="invAuditAll">تحديد كل المقترح</button><button type="button" class="btn btn-primary" id="invAuditApply">تطبيق التصحيح المحدد</button></div>`:''}`;
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
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  const style=document.createElement('style');
  style.textContent=`.inv-audit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0}.inv-audit-grid div{background:#f7f9fb;border-radius:10px;padding:8px;text-align:center}.inv-audit-grid span{display:block;font-size:12px;color:#65798b}.inv-audit-grid b{font-size:16px;color:#173750}.inv-audit-grid .ok b{color:#1e6b3a}.inv-audit-grid .bad b{color:#9b1c1c}.inv-audit-grid .warn b{color:#8a5a00}
  .inv-audit-why{background:#f6f8fb;border:1px solid #e3e9f0;border-radius:10px;padding:10px;line-height:1.8;font-size:13px;margin-bottom:10px}
  .inv-audit-list{display:grid;gap:8px;max-height:520px;overflow:auto}.inv-audit-row{display:flex;gap:10px;align-items:flex-start;border:1px solid #e4e9f0;border-radius:12px;padding:10px;background:#fff;cursor:pointer;line-height:1.7}.inv-audit-row.bad{border-color:#f3c1c1;background:#fff8f8}.inv-audit-row.warn{border-color:#f2d58e;background:#fffcf3}.inv-audit-row.muted{opacity:.85}.inv-audit-row small{color:#4f6274}.inv-audit-nopick{width:16px;flex:0 0 16px}.inv-audit-tag{display:inline-block;font-size:12px;border-radius:999px;padding:1px 8px;background:#eef3f7}.inv-audit-row.bad .inv-audit-tag{background:#fde2e2;color:#8f1d1d}.inv-audit-row.warn .inv-audit-tag{background:#fff0cc;color:#8a5a00}
  .inv-audit-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}`;
  document.head.appendChild(style);
})();
