(()=>{
  const oldCan=can;
  can=function(p){
    const shadi=String(state.user?.username||state.user?.display_name||'').toLowerCase()==='shadi';
    if(shadi&&p==='returns')return true;
    return oldCan(p);
  };

  async function fastApi(path='',opts={}){return api('/returns-fast'+path,opts)}
  function isShadi(){return String(state.user?.username||state.user?.display_name||'').toLowerCase()==='shadi'}
  function parseItemsText(text=''){return String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{const m=line.match(/^(.*?)\s*[|×x]\s*(\d+)\s*$/i);return m?{name:m[1].trim(),quantity:Number(m[2])}:{name:line,quantity:1}}).filter(x=>x.name&&x.quantity>0)}

  async function editFastReturn(orderCode,onDone){
    try{
      const d=await fastApi('?order_code='+encodeURIComponent(orderCode)),r=d.return_event;
      const old=document.querySelector('.modal-backdrop');if(old)old.remove();
      const overlay=document.createElement('div');overlay.className='modal-backdrop';
      overlay.innerHTML=`<div class="modal-card" dir="rtl"><div class="modal-head"><h3>تعديل مرتجع الطلب #${esc(orderCode)}</h3><button class="btn btn-soft close-fast-ret">✕</button></div>
      <div class="field"><label>نوع المرتجع</label><select id="frType" class="select"><option value="full" ${r.return_type==='full'?'selected':''}>مرتجع كامل</option><option value="partial" ${r.return_type==='partial'?'selected':''}>مرتجع جزئي</option></select></div>
      <div class="field"><label>الأصناف — كل سطر صنف، ويمكن كتابة الكمية هكذا: بنطلون تركي | 2</label><textarea id="frItems" class="textarea" style="min-height:150px">${esc((r.items||[]).map(i=>`${i.item_name} | ${i.quantity}`).join('\n'))}</textarea></div>
      <div class="field"><label>السبب</label><input id="frReason" class="input" value="${esc(r.reason||'')}"></div>
      <div class="field"><label>ملاحظة</label><textarea id="frNotes" class="textarea">${esc(r.notes||'')}</textarea></div>
      <div class="actions"><button id="saveFastRet" class="btn btn-accent">حفظ التعديل</button><button id="deleteFastRet" class="btn btn-danger">حذف المرتجع</button><button class="btn btn-soft close-fast-ret">إلغاء</button></div></div>`;
      document.body.appendChild(overlay);overlay.querySelectorAll('.close-fast-ret').forEach(x=>x.onclick=()=>overlay.remove());overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
      $('#saveFastRet').onclick=async()=>{const items=parseItemsText($('#frItems').value);if(!items.length)return toast('أضف صنفًا واحدًا على الأقل');const b=$('#saveFastRet');b.disabled=true;try{await fastApi('',{method:'PUT',body:JSON.stringify({order_code:orderCode,return_type:$('#frType').value,reason:$('#frReason').value,notes:$('#frNotes').value,items})});toast('تم تعديل المرتجع');overlay.remove();if(onDone)await onDone()}catch(e){b.disabled=false;toast(e.message)}};
      $('#deleteFastRet').onclick=async()=>{if(!confirm(`حذف مرتجع الطلب #${orderCode}؟\nسيتم إزالته من سجل المرتجعات ومن الأكثر رجوعًا.`))return;const b=$('#deleteFastRet');b.disabled=true;try{await fastApi('?order_code='+encodeURIComponent(orderCode),{method:'DELETE'});toast('تم حذف المرتجع');overlay.remove();if(onDone)await onDone()}catch(e){b.disabled=false;toast(e.message)}};
    }catch(e){toast(e.message)}
  }

  function fastDashboardHtml(d){
    const s=d.summary||{},top=d.top_items||[],history=d.returns||[];
    return `<div class="return-summary"><div><span>إجمالي المرتجعات</span><b>${Number(s.total_returns||0)}</b></div><div><span>مرتجع كامل</span><b>${Number(s.full_returns||0)}</b></div><div><span>مرتجع جزئي</span><b>${Number(s.partial_returns||0)}</b></div><div class="pieces"><span>إجمالي القطع الراجعة</span><b>${Number(s.returned_pieces||0)}</b></div></div>
    <div class="return-report-grid"><div><h3>الأكثر رجوعًا</h3>${top.length?`<div class="return-ranking">${top.map((x,i)=>`<div class="return-rank-row"><span class="return-rank-number">${i+1}</span><div><b>${esc(x.item_name)}</b><small>${Number(x.return_orders||0)} طلب مرتجع</small></div><strong>${Number(x.returned_quantity||0)} قطعة</strong></div>`).join('')}</div>`:'<div class="empty">لا توجد مرتجعات بعد</div>'}</div>
    <div><h3>سجل الاستلام</h3>${history.length?`<div class="return-history-list">${history.map(r=>`<div class="return-history-row"><div><b>#${r.order_code} — ${esc(r.store_name||'')}</b><div class="sub">${r.return_type==='full'?'مرتجع كامل':'مرتجع جزئي'} • ${(r.items||[]).map(i=>`${esc(i.item_name)} × ${i.quantity}`).join('، ')}</div><div class="return-history-meta">${esc(r.created_by_name||'')} • ${fmtDate(r.created_at)}</div></div><div class="actions" style="margin:0"><button class="btn btn-soft fast-edit-return" data-code="${r.order_code}">تعديل</button><button class="btn btn-danger fast-delete-return" data-code="${r.order_code}">حذف</button></div></div>`).join('')}</div>`:'<div class="empty">لا توجد مرتجعات بعد</div>'}</div></div>`;
  }

  async function deleteReturn(orderCode,onDone){if(!confirm(`حذف مرتجع الطلب #${orderCode}؟\nسيتم إزالته من سجل المرتجعات ومن الأكثر رجوعًا.`))return;try{await fastApi('?order_code='+encodeURIComponent(orderCode),{method:'DELETE'});toast('تم حذف المرتجع');if(onDone)await onDone()}catch(e){toast(e.message)}}
  function bindRows(onDone){document.querySelectorAll('.fast-edit-return').forEach(b=>b.onclick=()=>editFastReturn(Number(b.dataset.code),onDone));document.querySelectorAll('.fast-delete-return').forEach(b=>b.onclick=()=>deleteReturn(Number(b.dataset.code),onDone))}

  async function shadiReturnsView(){
    const c=$('#content');
    c.innerHTML=`<div class="page-title"><div><h1>مركز المرتجعات</h1><div class="sub">اضرب الباركود — يتم تسجيل المرتجع مباشرة بدون تأكيد</div></div><span class="pill return-live-pill">جاهز للمسح</span></div><div class="return-scan-card"><div class="return-scan-title"><span class="return-scan-icon">▥</span><div><h2>مسح سريع</h2><div class="sub">كل ضربة باركود تحفظ المرتجع فورًا.</div></div></div><div class="return-scan-actions"><input id="fastReturnInput" class="input return-code-input" autocomplete="off" placeholder="امسح الباركود"><button id="fastReturnBtn" class="btn btn-primary">تسجيل</button></div><div id="fastReturnStatus"></div></div><div class="card"><div id="fastReturnsDashboard"><div class="empty">جاري التحميل...</div></div></div>`;
    const load=async()=>{try{const d=await fastApi();$('#fastReturnsDashboard').innerHTML=fastDashboardHtml(d);bindRows(load)}catch(e){$('#fastReturnsDashboard').innerHTML=`<div class="empty">${esc(e.message)}</div>`}};
    const scan=async()=>{const inp=$('#fastReturnInput'),code=inp.value.trim();if(!code)return;inp.value='';inp.disabled=true;try{const r=await fastApi('',{method:'POST',body:JSON.stringify({code})});$('#fastReturnStatus').innerHTML=`<div class="return-success"><b>${r.already?'✓ المرتجع مسجل مسبقًا':'✓ تم استلام المرتجع مباشرة'}</b><span>طلب #${r.return_event?.order_code||''}</span></div>`;toast(r.already?'هذا المرتجع مسجل مسبقًا':'تم تسجيل المرتجع');$('#fastReturnsDashboard').innerHTML=fastDashboardHtml(r.dashboard);bindRows(load)}catch(e){toast(e.message)}finally{inp.disabled=false;inp.focus()}};
    $('#fastReturnInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();scan()}};$('#fastReturnBtn').onclick=scan;await load();$('#fastReturnInput').focus();
  }

  const originalReturns=returnsCenterView;
  returnsCenterView=async function(){
    if(isShadi())return shadiReturnsView();
    await originalReturns();
    const input=$('#returnCodeInput');if(!input)return;
    const fastScan=async code=>{if(!code)return;input.value='';input.disabled=true;try{const r=await fastApi('',{method:'POST',body:JSON.stringify({code})});$('#returnOrderPanel').innerHTML=`<div class="return-success"><b>${r.already?'✓ المرتجع مسجل مسبقًا':'✓ تم استلام المرتجع مباشرة'}</b><span>طلب #${r.return_event?.order_code||''} — بدون تأكيد</span>${r.return_event?.order_code?`<div class="actions" style="margin:8px 0 0"><button class="btn btn-soft fast-edit-current" data-code="${r.return_event.order_code}">تعديل المرتجع</button><button class="btn btn-danger fast-delete-current" data-code="${r.return_event.order_code}">حذف المرتجع</button></div>`:''}</div>`;toast(r.already?'هذا المرتجع مسجل مسبقًا':'تم تسجيل المرتجع مباشرة');$('#loadReturns')?.click();document.querySelector('.fast-edit-current')?.addEventListener('click',e=>editFastReturn(Number(e.currentTarget.dataset.code),async()=>$('#loadReturns')?.click()));document.querySelector('.fast-delete-current')?.addEventListener('click',e=>deleteReturn(Number(e.currentTarget.dataset.code),async()=>{$('#returnOrderPanel').innerHTML='';$('#loadReturns')?.click()}))}catch(e){toast(e.message)}finally{input.disabled=false;input.focus()}};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();fastScan(input.value.trim())}},true);
    const btn=$('#findReturnOrder');if(btn)btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();fastScan(input.value.trim())},true);
    const addButtons=()=>document.querySelectorAll('#returnHistory .return-history-row').forEach(row=>{const m=row.textContent.match(/#(\d+)/);if(!m)return;let actions=row.querySelector('.fast-return-actions');if(!actions){actions=document.createElement('div');actions.className='actions fast-return-actions';actions.style.margin='0';row.appendChild(actions)}if(!actions.querySelector('.fast-edit-return')){const b=document.createElement('button');b.className='btn btn-soft fast-edit-return';b.textContent='تعديل';b.onclick=()=>editFastReturn(Number(m[1]),async()=>$('#loadReturns')?.click());actions.appendChild(b)}if(!actions.querySelector('.fast-delete-return')){const b=document.createElement('button');b.className='btn btn-danger fast-delete-return';b.textContent='حذف';b.onclick=()=>deleteReturn(Number(m[1]),async()=>$('#loadReturns')?.click());actions.appendChild(b)}});
    const hist=$('#returnHistory');if(hist){new MutationObserver(addButtons).observe(hist,{childList:true,subtree:true});addButtons()}
  };

  function ensureShadiMenu(){if(!isShadi())return;const nav=document.querySelector('.side-nav,aside nav,nav');if(!nav||nav.querySelector('[data-view="returns-center"]'))return;const b=document.createElement('button');b.dataset.view='returns-center';b.textContent='↩ مركز المرتجعات';b.onclick=()=>show('returns-center');nav.appendChild(b)}
  const timer=setInterval(()=>{if(state.user){ensureShadiMenu();if(isShadi()&&state.view==='returns-center'&&!document.querySelector('#fastReturnInput'))shadiReturnsView()}},600);setTimeout(()=>clearInterval(timer),30000);
})();
