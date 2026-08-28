(()=>{
 function installStyles(){if(document.querySelector('#profitModelManagerStyles'))return;const style=document.createElement('style');style.id='profitModelManagerStyles';style.textContent=`
  .profit-model-manager{width:min(820px,96vw);max-height:90dvh;overflow:auto}
  .profit-model-form{display:grid;grid-template-columns:1fr 160px;gap:12px;margin:14px 0;padding:14px;border:1px solid #dce5ec;border-radius:14px;background:#f8fafc}
  .profit-model-form .aliases{grid-column:1/-1}.profit-model-form .actions{grid-column:1/-1;margin:0}
  .profit-model-list{display:grid;gap:8px}.profit-model-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8ef;border-radius:12px}
  .profit-model-row.inactive{opacity:.55}.profit-model-aliases{font-size:12px;color:#667085;margin-top:4px}.profit-model-cost{font-size:20px;font-weight:900;direction:ltr}
  .profit-ignored{margin:14px 0;padding:12px;border:1px solid #e2e8ef;border-radius:12px;background:#fff}.profit-ignored-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.profit-ignored-item{display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:#f1f5f9}.profit-ignored-item button{border:0;background:transparent;color:#b42318;font-weight:900;cursor:pointer}
  .profit-unknown-models{display:grid;gap:8px;margin:10px 0;padding:12px;border:2px solid #d64545;border-radius:12px;background:#fff1f1;color:#9f1d1d}
  .profit-unknown-models>div{display:flex;gap:8px;flex-wrap:wrap}.profit-cost-incomplete{border-color:#d64545!important}.profit-cost-breakdown{padding:8px 10px;border-radius:9px;background:#eef7ff;color:#244a68}
  @media(max-width:650px){.profit-model-form{grid-template-columns:1fr}.profit-model-form .aliases,.profit-model-form .actions{grid-column:auto}.profit-model-row{grid-template-columns:1fr auto}.profit-model-row .btn{grid-column:1/-1;width:100%}}
 `;document.head.appendChild(style)}

 function formHtml(prefill=''){return `<form id="profitModelForm" class="profit-model-form">
  <input type="hidden" id="profitModelId" value="">
  <div class="field"><label>اسم الموديل</label><input id="profitModelName" class="input" value="${esc(prefill)}" placeholder="مثال: بنطلون تكيف" required></div>
  <div class="field"><label>كوست القطعة</label><input id="profitModelCost" class="input" inputmode="decimal" placeholder="0.00" required></div>
  <div class="field aliases"><label>الأسماء البديلة — افصل بينها بفاصلة أو سطر</label><textarea id="profitModelAliases" class="textarea" placeholder="تكيف، تكييف، يكتف، تكف">${esc(prefill)}</textarea></div>
  <label style="display:flex;align-items:center;gap:8px"><input id="profitModelActive" type="checkbox" checked> الموديل فعال</label>
  <div class="actions"><button class="btn btn-accent" type="submit">حفظ الموديل</button><button class="btn btn-soft" type="button" id="profitModelReset">موديل جديد</button></div>
 </form>`}

 function renderList(models){const list=document.querySelector('#profitModelList');if(!list)return;list.innerHTML=models.map(model=>`<div class="profit-model-row ${model.active?'':'inactive'}">
  <div><b>${esc(model.name)}</b><div class="profit-model-aliases">${(model.aliases||[]).map(esc).join('، ')}</div></div>
  <div class="profit-model-cost">${Number(model.cost||0).toFixed(2)}</div>
  <button type="button" class="btn btn-soft profit-model-edit" data-id="${model.id}">تعديل</button>
 </div>`).join('')||'<div class="empty">لا توجد موديلات</div>'}

 function renderIgnored(phrases){const list=document.querySelector('#profitIgnoredList');if(!list)return;list.innerHTML=phrases.map(phrase=>`<span class="profit-ignored-item">${esc(phrase)}<button type="button" class="profit-unignore" data-model="${encodeURIComponent(phrase)}" aria-label="إلغاء التجاهل">✕</button></span>`).join('')||'<span class="sub">لا توجد عبارات متجاهلة.</span>'}

 async function openManager(prefill=''){
  installStyles();document.querySelector('#profitModelManagerOverlay')?.remove();
  const overlay=document.createElement('div');overlay.id='profitModelManagerOverlay';overlay.className='modal-backdrop';overlay.innerHTML=`<div class="modal-card profit-model-manager"><div class="modal-head"><div><h3>إدارة الموديلات والكوست</h3><div class="sub">عرّف الموديل مرة واحدة ليُقرأ في كل الطلبات.</div></div><button type="button" class="btn btn-soft" id="closeProfitModels">✕</button></div>${formHtml(prefill)}<div class="profit-ignored"><b>عبارات ليست موديلات</b><div class="sub">يمكنك إلغاء التجاهل إذا ضغطته بالخطأ.</div><div id="profitIgnoredList" class="profit-ignored-list"></div></div><div id="profitModelList"><div class="empty">جاري تحميل الموديلات...</div></div></div>`;document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.querySelector('#closeProfitModels').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
  let data;try{data=await api('/profit-models')}catch(e){toast(e.message);close();return}let models=data.models||[],ignored=data.ignored_phrases||[];renderList(models);renderIgnored(ignored);
  const reset=(value='')=>{overlay.querySelector('#profitModelId').value='';overlay.querySelector('#profitModelName').value=value;overlay.querySelector('#profitModelCost').value='';overlay.querySelector('#profitModelAliases').value=value;overlay.querySelector('#profitModelActive').checked=true};
  overlay.querySelector('#profitModelReset').onclick=()=>reset();
  overlay.addEventListener('click',async e=>{const unignore=e.target.closest('.profit-unignore');if(unignore){const phrase=decodeURIComponent(unignore.dataset.model||'');unignore.disabled=true;try{const saved=await api('/profit-models',{method:'PUT',body:JSON.stringify({action:'unignore',phrase})});ignored=saved.ignored_phrases||[];renderIgnored(ignored);await window.CORVEX_PRODUCT_RULES?.loadRemote?.(true);document.dispatchEvent(new CustomEvent('corvex:profits-rendered'));toast('تم إلغاء تجاهل العبارة')}catch(error){toast(error.message||'تعذر إلغاء التجاهل')}return}const button=e.target.closest('.profit-model-edit');if(!button)return;const model=models.find(item=>Number(item.id)===Number(button.dataset.id));if(!model)return;overlay.querySelector('#profitModelId').value=model.id;overlay.querySelector('#profitModelName').value=model.name;overlay.querySelector('#profitModelCost').value=Number(model.cost).toFixed(2);overlay.querySelector('#profitModelAliases').value=(model.aliases||[]).join('\n');overlay.querySelector('#profitModelActive').checked=model.active!==false;overlay.querySelector('#profitModelName').focus();overlay.querySelector('.profit-model-manager').scrollTop=0});
  overlay.querySelector('#profitModelForm').onsubmit=async e=>{e.preventDefault();const id=Number(overlay.querySelector('#profitModelId').value||0),name=overlay.querySelector('#profitModelName').value.trim(),cost=Number(overlay.querySelector('#profitModelCost').value.replace(',','.')),aliases=overlay.querySelector('#profitModelAliases').value.split(/[،,\n]+/).map(x=>x.trim()).filter(Boolean),active=overlay.querySelector('#profitModelActive').checked,button=e.submitter||overlay.querySelector('#profitModelForm [type="submit"]');if(!name)return toast('اكتب اسم الموديل');if(!Number.isFinite(cost)||cost<0)return toast('اكتب كوست صحيح');button.disabled=true;try{const saved=await api('/profit-models',{method:id?'PUT':'POST',body:JSON.stringify({id,name,cost,aliases,active})});models=saved.models||models;renderList(models);await window.CORVEX_PRODUCT_RULES?.loadRemote?.(true);document.dispatchEvent(new CustomEvent('corvex:profits-rendered'));toast(id?'تم تعديل الموديل':'تم تعريف الموديل');reset()}catch(error){toast(error.message||'تعذر حفظ الموديل')}finally{button.disabled=false}};
  if(prefill)setTimeout(()=>overlay.querySelector('#profitModelCost')?.focus(),50);
 }

 document.addEventListener('click',async e=>{const manage=e.target.closest('#profitModelsBtn');if(manage){openManager();return}const define=e.target.closest('.profit-define-model');if(define){openManager(decodeURIComponent(define.dataset.model||''));return}const ignore=e.target.closest('.profit-ignore-model');if(!ignore)return;const phrase=decodeURIComponent(ignore.dataset.model||'');ignore.disabled=true;try{await api('/profit-models',{method:'POST',body:JSON.stringify({action:'ignore',phrase})});await window.CORVEX_PRODUCT_RULES?.loadRemote?.(true);document.dispatchEvent(new CustomEvent('corvex:profits-rendered'));toast('تم تجاهل العبارة لأنها ليست موديلًا')}catch(error){toast(error.message||'تعذر تجاهل العبارة');ignore.disabled=false}});
 window.CORVEX_OPEN_PROFIT_MODELS=openManager;
})();
