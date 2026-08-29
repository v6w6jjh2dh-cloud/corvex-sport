(()=>{
  const CANCELLED=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival']);
  const STATUS_DETAIL={refused_fee_paid:'رفض ودفع أجور',refused_no_fee:'رفض وعدم دفع أجور',canceled_before_arrival:'ملغي قبل الوصول'};
  const originalApi=api;
  const originalRenderOrdersTable=renderOrdersTable;
  const originalOrdersView=ordersView;
  const originalLoadOrders=loadOrders;
  const originalDeliveryBadge=deliveryBadge;
  const originalDashboard=dashboard;
  const originalReturnsCenterView=returnsCenterView;

  function injectStyles(){
    if(document.getElementById('corvex-v81-style'))return;
    const s=document.createElement('style');s.id='corvex-v81-style';s.textContent=`
      .money-after{font-weight:800}.money-diff.pos{color:#147d3d}.money-diff.neg{color:#b42318}.cancel-main{background:#ffe5e5;color:#9b1c1c}.lock-mark{font-size:12px;margin-inline-start:4px}.audit-btn{padding:5px 9px!important}.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.control-stat{padding:14px;border:1px solid #e5e7eb;border-radius:14px;background:#fff}.control-stat span{display:block;color:#667085;font-size:12px}.control-stat b{font-size:24px}.reconcile-card{margin-bottom:16px}.reconcile-drop{padding:16px;border:2px dashed #cbd5e1;border-radius:14px;background:#f8fafc}.reconcile-summary{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:8px;margin:12px 0}.reconcile-summary>div{border-radius:12px;padding:10px;background:#f8fafc;text-align:center}.reconcile-summary b{display:block;font-size:22px}.reconcile-status-matched{color:#147d3d}.reconcile-status-missing{color:#b42318}.reconcile-status-review{color:#9a6700}.reconcile-status-extra{color:#b42318}.audit-list{display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto}.audit-row{padding:10px;border:1px solid #e5e7eb;border-radius:10px}.audit-meta{font-size:12px;color:#667085}.stale-chip{display:inline-block;padding:3px 7px;border-radius:999px;background:#fff3cd;color:#8a6d1d;font-size:11px;margin-inline-start:5px}@media(max-width:760px){.reconcile-summary{grid-template-columns:repeat(2,1fr)}}`;
    document.head.appendChild(s);
  }

  function orderSnapshot(o){
    if(!o)return{};
    return {amount:Number(o.amount||0),delivered_amount:Number(o.delivered_amount||0),delivery_fee:Number(o.delivery_fee||0),cash_collected:Number(o.cash_collected||0),cost_of_goods:Number(o.cost_of_goods||0),delivery_status:o.delivery_status||'pending',printed:Number(o.printed||0),store_id:o.store_id||null,courier_id:o.courier_id||null,recipient_name:o.recipient_name||'',phone:o.phone||'',area:o.area||'',detailed_address:o.detailed_address||'',order_notes:o.order_notes||''};
  }

  api=async function(path,opts={}){
    const method=String(opts.method||'GET').toUpperCase();
    const m=String(path).match(/^\/orders\/(\d+)(?:\/outcome)?$/);
    let before=null,orderId=null,orderCode=null;
    if(m&&['PUT','DELETE'].includes(method)){
      orderId=Number(m[1]);
      try{before=(await originalApi('/orders/'+orderId)).order;orderCode=before?.order_code||null}catch{}
      if(before&&Number(before.delivery_company_settled||0)===1&&state.user?.role!=='admin')throw new Error('هذا الطلب مقفل ماليًا بعد اعتماد تسوية شركة التوصيل');
    }

    if(path==='/orders'&&method==='POST'){
      try{
        const body=JSON.parse(opts.body||'{}'),phone=canonicalJordanPhone(body.phone||'');
        if(phone){
          const d=await originalApi('/orders?q='+encodeURIComponent(phone));
          const recent=(d.orders||[]).filter(o=>{
            const days=(Date.now()-new Date(String(o.created_at||'').replace(' ','T')+'Z').getTime())/86400000;
            const closeAmount=Math.abs(Number(o.amount||0)-Number(body.amount||0))<=1;
            const samePhone=canonicalJordanPhone(o.phone||'')===phone;
            return samePhone&&closeAmount&&days>=0&&days<=7;
          });
          if(recent.length&&!confirm(`تنبيه: يوجد ${recent.length} طلب قريب لنفس الرقم خلال آخر 7 أيام وبسعر قريب.\n\nهل هذا طلب جديد حقيقي وتريد المتابعة؟`))throw new Error('تم إلغاء الحفظ بعد تنبيه الطلب المكرر');
        }
      }catch(e){if(e.message?.includes('تم إلغاء'))throw e}
    }

    const result=await originalApi(path,opts);
    if(m&&['PUT','DELETE'].includes(method)){
      let after=null;try{after=method==='DELETE'?null:(await originalApi('/orders/'+orderId)).order}catch{}
      originalApi('/control?action=audit',{method:'POST',body:JSON.stringify({order_id:orderId,order_code:orderCode,event_type:path.endsWith('/outcome')?'outcome_update':method==='DELETE'?'delete':'order_update',before:orderSnapshot(before),after:orderSnapshot(after),note:Number(before?.delivery_company_settled||0)===1?'تعديل إداري بعد الاعتماد':''})}).catch(()=>{});
    }
    if(path==='/orders'&&method==='POST'){
      const o=result.order||result;const id=o?.id,code=o?.order_code;if(id)originalApi('/control?action=audit',{method:'POST',body:JSON.stringify({order_id:id,order_code:code,event_type:'create',after:orderSnapshot(o)})}).catch(()=>{});
    }
    return result;
  };

  deliveryBadge=function(o){
    const s=o.delivery_status||'pending';
    if(CANCELLED.has(s))return `<span class="badge badge-danger cancel-main">${esc(STATUS_DETAIL[s]||'ملغي')}</span>`;
    const html=originalDeliveryBadge(o);
    const stale=s==='pending'&&((Date.now()-new Date(String(o.first_printed_at||o.created_at||'').replace(' ','T')+'Z').getTime())/86400000)>=3;
    return html+(stale?'<span class="stale-chip">معلق +3 أيام</span>':'');
  };

  renderOrdersTable=function(sel,orders,selectable){
    originalRenderOrdersTable(sel,orders,selectable);
    const table=document.querySelector(sel+' table');if(!table)return;
    const heads=[...table.querySelectorAll('thead th')];const valueIndex=heads.findIndex(h=>h.textContent.trim()==='القيمة');if(valueIndex<0)return;
    heads[valueIndex].textContent='السعر قبل التسليم';
    const afterH=document.createElement('th');afterH.textContent='السعر بعد التسليم';heads[valueIndex].after(afterH);
    const diffH=document.createElement('th');diffH.textContent='الفرق';afterH.after(diffH);
    const auditH=document.createElement('th');auditH.textContent='السجل';table.querySelector('thead tr').appendChild(auditH);
    [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{
      const o=orders[i];if(!o)return;
      const before=Number(o.amount||0),after=Number(o.delivered_amount||0),diff=after-before;
      const afterTd=document.createElement('td');afterTd.className='money-after';afterTd.textContent=money(after);tr.children[valueIndex].after(afterTd);
      const diffTd=document.createElement('td');diffTd.className='money-diff '+(diff>0?'pos':diff<0?'neg':'');diffTd.textContent=(diff>0?'+':'')+money(diff);afterTd.after(diffTd);
      if(Number(o.delivery_company_settled||0)===1)tr.children[valueIndex].innerHTML+=`<span class="lock-mark" title="مقفل ماليًا">🔒</span>`;
      const a=document.createElement('td');a.innerHTML=`<button class="btn btn-soft audit-btn" data-audit="${o.id}">سجل</button>`;tr.appendChild(a);
    });
    table.querySelectorAll('[data-audit]').forEach(b=>b.onclick=()=>showAudit(Number(b.dataset.audit)));
  };

  async function showAudit(orderId){
    const old=document.querySelector('.modal-backdrop');if(old)old.remove();
    const overlay=document.createElement('div');overlay.className='modal-backdrop';overlay.innerHTML='<div class="modal-card"><div class="empty">جاري تحميل السجل...</div></div>';document.body.appendChild(overlay);overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
    try{
      const d=await originalApi('/control?action=audit&order_id='+orderId),rows=d.rows||[];
      overlay.firstElementChild.innerHTML=`<div class="modal-head"><h3>سجل حركة الطلب</h3><button class="btn btn-soft" id="closeAudit">✕</button></div><div class="audit-list">${rows.length?rows.map(r=>`<div class="audit-row"><b>${esc(r.event_type)}</b><div class="audit-meta">${esc(r.created_by_name||'')} • ${fmtDate(r.created_at)}</div>${r.note?`<div>${esc(r.note)}</div>`:''}</div>`).join(''):'<div class="empty">لا يوجد سجل بعد</div>'}</div>`;
      overlay.querySelector('#closeAudit').onclick=()=>overlay.remove();
    }catch(e){overlay.firstElementChild.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  }

  ordersView=async function(){
    await originalOrdersView();
    const f=$('#statusFilter');if(!f)return;
    const old=[...f.options];old.forEach(o=>{if(CANCELLED.has(o.value))o.remove()});
    f.insertAdjacentHTML('beforeend','<option value="cancelled">ملغي</option><option value="stale">معلق +3 أيام</option>');
  };

  loadOrders=async function(){
    const f=$('#statusFilter'),special=f&&['cancelled','stale'].includes(f.value)?f.value:'';
    if(!special)return originalLoadOrders();
    const keep=f.value;f.value='';await originalLoadOrders();f.value=keep;
    const filtered=state.orders.filter(o=>special==='cancelled'?CANCELLED.has(o.delivery_status):(o.delivery_status==='pending'&&((Date.now()-new Date(String(o.first_printed_at||o.created_at||'').replace(' ','T')+'Z').getTime())/86400000)>=3));
    state.orders=filtered;renderOrdersTable('#ordersTable',filtered,false);
  };

  dashboard=async function(){
    await originalDashboard();
    try{
      const d=await originalApi('/control?action=summary'),daily=d.daily||{},rec=d.reconcile||{};
      const c=$('#content');if(!c)return;
      const box=document.createElement('div');box.className='card';box.innerHTML=`<div class="section-head"><div><h3>الرقابة اليومية</h3><div class="sub">الطلبات والربح وعهدة شركة التوصيل</div></div></div><div class="control-grid"><div class="control-stat"><span>تم التسليم اليوم</span><b>${Number(daily.delivered_today||0)}</b></div><div class="control-stat"><span>ملغي اليوم</span><b>${Number(daily.cancelled_today||0)}</b></div><div class="control-stat"><span>قيد التوصيل</span><b>${Number(daily.pending||0)}</b></div><div class="control-stat"><span>معلق +3 أيام</span><b>${Number(daily.stale_pending||0)}</b></div><div class="control-stat"><span>صافي الربح التقديري</span><b>${money(daily.gross_profit||0)}</b></div><div class="control-stat"><span>عهدة شركة التوصيل</span><b>${money(daily.company_due||0)}</b></div><div class="control-stat"><span>مرتجعات ناقصة بآخر كشف</span><b>${Number(rec.missing||0)}</b></div><div class="control-stat"><span>مرتجعات مطابقة بآخر كشف</span><b>${Number(rec.matched||0)}</b></div></div>`;c.appendChild(box);
    }catch{}
  };

  function loadPdfJs(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve(window.pdfjsLib)};s.onerror=()=>reject(new Error('تعذر تحميل قارئ PDF'));document.head.appendChild(s)});
  }
  function extractRowsFromText(text){
    const clean=String(text||'').replace(/\s+/g,' ').trim();const re=/(?:\+?962|00962|0)?7[789]\d{7}/g;const out=[];let m;
    while((m=re.exec(clean))){
      const phone=canonicalJordanPhone(m[0]);const start=Math.max(0,m.index-90),end=Math.min(clean.length,m.index+m[0].length+120),ctx=clean.slice(start,end);
      const am=[...ctx.matchAll(/(?:^|\s)(\d{1,3}(?:\.\d{1,2})?)(?=\s*(?:د(?:ينار)?|JD|JOD|$))/gi)].map(x=>Number(x[1])).filter(x=>x>0&&x<1000);const amount=am.length?am[am.length-1]:0;
      const arab=(ctx.slice(0,Math.max(0,m.index-start)).match(/[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){0,3}/g)||[]).pop()||'';
      out.push({phone,customer_name:arab.trim(),amount,raw_text:ctx});
    }
    const seen=new Set();return out.filter(r=>{const k=r.phone+'|'+r.raw_text;if(seen.has(k))return false;seen.add(k);return true});
  }
  async function parsePdf(file){
    const pdfjs=await loadPdfJs(),buf=await file.arrayBuffer(),pdf=await pdfjs.getDocument({data:buf}).promise;let text='';
    for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),tc=await page.getTextContent();text+=' '+tc.items.map(i=>i.str).join(' ')}
    return extractRowsFromText(text);
  }

  function renderReconcile(box,d){
    if(!d?.batch)return;window.__corvexReturnBatchId=Number(d.batch.id);const c=d.counts||{},rows=d.rows||[];
    box.innerHTML=`<div class="reconcile-summary"><div><span>الكشف</span><b>${Number(c.total||0)}</b></div><div class="reconcile-status-matched"><span>مطابق</span><b>${Number(c.matched||0)}</b></div><div class="reconcile-status-missing"><span>ناقص</span><b>${Number(c.missing||0)}</b></div><div class="reconcile-status-review"><span>مراجعة</span><b>${Number(c.review||0)}</b></div><div class="reconcile-status-extra"><span>زائد</span><b>${Number(c.extra||0)}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>الهاتف</th><th>الاسم</th><th>السعر</th><th>الحالة</th><th>طلب مطابق</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.source_index}</td><td>${esc(r.phone||'')}</td><td>${esc(r.customer_name||'—')}</td><td>${r.amount?money(r.amount):'—'}</td><td>${r.match_status==='matched'?'مطابق':r.match_status==='review'?'يحتاج مراجعة':'لم يصل'}</td><td>${r.matched_order_code?'#'+r.matched_order_code:'—'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function refreshBatch(){const id=window.__corvexReturnBatchId;if(!id)return;try{renderReconcile($('#reconcileResult'),await originalApi('/control?action=batch&id='+id))}catch{}}
  async function matchScan(code){const id=window.__corvexReturnBatchId;if(!id||!code)return;try{const r=await originalApi('/control?action=scan_return',{method:'POST',body:JSON.stringify({batch_id:id,code})});const labels={matched:'مطابق',review:'يحتاج مراجعة',extra:'وصل وغير موجود بالكشف',duplicate:'تم مسحه مسبقًا'};toast('مطابقة المرتجع: '+(labels[r.result]||r.result));renderReconcile($('#reconcileResult'),r.batch)}catch(e){toast(e.message)}}

  function installReconcile(){
    const target=document.querySelector('.return-scan-card');if(!target||document.getElementById('returnReconcileCard'))return;
    const card=document.createElement('div');card.id='returnReconcileCard';card.className='card reconcile-card';card.innerHTML=`<div class="section-head"><div><h2>مطابقة كشف المرتجعات</h2><div class="sub">ارفع PDF شركة التوصيل. المطابقة تعتمد على رقم الهاتف، ثم الاسم والسعر للتأكيد. هذه الميزة للمرتجعات فقط.</div></div></div><div class="reconcile-drop"><input id="returnPdfFile" type="file" accept="application/pdf"><button id="readReturnPdf" class="btn btn-primary">قراءة الكشف وبدء المطابقة</button><div class="sub">بعد تحميل الكشف، امسح باركود كل شحنة راجعة كالمعتاد.</div></div><div id="reconcileResult"></div>`;target.parentNode.insertBefore(card,target);
    $('#readReturnPdf').onclick=async()=>{const file=$('#returnPdfFile').files?.[0];if(!file)return toast('اختر ملف PDF أولاً');const b=$('#readReturnPdf');b.disabled=true;b.textContent='جاري قراءة الكشف...';try{const rows=await parsePdf(file);if(!rows.length)throw new Error('لم أجد أرقام هواتف داخل الكشف');const d=await originalApi('/control?action=create_return_batch',{method:'POST',body:JSON.stringify({file_name:file.name,rows})});renderReconcile($('#reconcileResult'),d);toast(`تم تحميل ${rows.length} سجل من الكشف`)}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent='قراءة الكشف وبدء المطابقة'}};
    const input=$('#returnCodeInput');if(input){input.addEventListener('keydown',e=>{if(e.key==='Enter'){const code=input.value.trim();setTimeout(()=>matchScan(code),250)}})}
    const panel=$('#returnOrderPanel');if(panel){let last='';new MutationObserver(()=>{const code=input?.value?.trim();if(code&&code!==last&&window.__corvexReturnBatchId){last=code;setTimeout(()=>matchScan(code),250)}}).observe(panel,{childList:true,subtree:true})}
  }

  returnsCenterView=async function(){await originalReturnsCenterView();installReconcile()};
  injectStyles();
  setTimeout(()=>{if(state?.token&&state?.view){try{show(state.view)}catch{}}},50);
})();
