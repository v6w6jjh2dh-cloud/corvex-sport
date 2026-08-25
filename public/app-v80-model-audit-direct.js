(()=>{
 function ql(q){q=Number(q||1);return q===1?'قطعة':q===2?'قطعتين':q+' قطع'}
 function openAudit(row){
   const name=row.querySelector('.model-rank-name')?.textContent.trim();
   if(!name)return;
   const old=row.querySelector('.model-direct-audit');
   if(old){old.remove();return}
   const data=(window.__modelPerformanceRows||[]).find(x=>x.name===name);
   const box=document.createElement('div');
   box.className='model-direct-audit';
   box.style.cssText='display:block;padding:12px 14px;border-top:2px solid #ddd;background:#fff';
   if(!data){
     box.innerHTML='<div class="empty">تفاصيل الموديل غير جاهزة. اضغط عرض مرة واحدة ثم جرّب.</div>';
   }else{
     const items=(data.items||[]).slice().sort((a,b)=>Number(b.code)-Number(a.code));
     box.innerHTML=`<div style="font-size:16px;font-weight:900;margin-bottom:10px">كل الطلبات المحسوبة على ${esc(name)}: ${items.length} طلب</div>${items.map(it=>`<div style="display:grid;grid-template-columns:80px 75px 1fr;gap:8px;align-items:center;padding:9px 0;border-bottom:1px dashed #ccc"><button type="button" class="btn btn-soft direct-audit-order" data-id="${it.id}" style="padding:5px 7px">#${esc(it.code)}</button><b>${ql(it.qty)}</b><span>${esc(it.store||'')}</span></div>`).join('')||'<div class="empty">لا توجد طلبات محسوبة لهذا الموديل</div>'}`;
   }
   row.appendChild(box);
 }
 document.addEventListener('click',e=>{
   if(state?.view!=='model-performance')return;
   const ob=e.target.closest('.direct-audit-order');
   if(ob){e.preventDefault();e.stopImmediatePropagation();editOrder(Number(ob.dataset.id));return}
   const main=e.target.closest('.model-rank-main');
   if(main){e.preventDefault();e.stopImmediatePropagation();openAudit(main.closest('.model-rank'))}
 },true);
})();