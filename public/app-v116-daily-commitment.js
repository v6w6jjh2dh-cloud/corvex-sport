// «الالتزام اليومي»: page (main menu) + the panel shown in both profit sections.
// Corvex store only. The commitment is per calendar day (monthly ÷ 30), never per statement.
(function(){
  if(window.CorvexCommitment)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>(Math.round((Number(n)||0)*100)/100).toFixed(2);
  const GOLD='#e8b94a',GREEN='#35d07f',RED='#ef7777';
  const today=()=>new Date(Date.now()+3*3600e3).toISOString().slice(0,10);
  const cache=new Map();
  async function get(date,store){
    const key=date+'|'+(store||0);
    if(!cache.has(key))cache.set(key,window.api('/daily-commitment?date='+encodeURIComponent(date)+'&store_id='+encodeURIComponent(store||0)).catch(e=>{cache.delete(key);throw e}));
    return cache.get(key);
  }
  // profit = result after goods cost and delivery fees (before ads); null when incomplete
  function panel(cm,{profit,ads,label}){
    ensureStyle();
    if(!cm)return '<div class="pf-panel dc-panel"><h3>الالتزام اليومي</h3><div class="pf-muted">تعذر تحميل الالتزامات</div></div>';
    const daily=cm.applies?Number(cm.daily||0):0,adv=Number(ads||0);
    const real=profit===null||profit===undefined?null:Math.round((Number(profit)-adv-daily)*100)/100;
    const row=(l,v,c='')=>'<div class="pf-row"><span>'+l+'</span><strong'+(c?' style="color:'+c+'"':'')+'>'+v+'</strong></div>';
    return '<div class="pf-panel dc-panel"><h3>الالتزام اليومي</h3>'+
      row(esc(label||'الربح بعد الكوست والتوصيل'),profit===null||profit===undefined?'—':money(profit)+' د.أ')+
      row('الإعلانات',adv?'− '+money(adv)+' د.أ':'0.00 د.أ')+
      row('الالتزام اليومي',cm.applies?'− '+money(daily)+' د.أ':'لا ينطبق',GOLD)+
      '<div class="dc-real"><span>صافي الربح الحقيقي</span><b style="color:'+(real===null?'#cbd5e1':real<0?RED:GREEN)+'">'+(real===null?'—':money(real)+' د.أ')+'</b></div>'+
      '<div class="pf-muted dc-note">'+(cm.applies?'التزام '+esc(cm.store?.name||'كورفكس')+' الشهري '+money(cm.monthly_total)+' ÷ 30 يومًا • يُخصم مرة واحدة لهذا اليوم':'الالتزام خاص بمتجر '+esc(cm.store?.name||'كورفكس')+' ولا يُخصم من هذا المتجر')+(real===null?' • صافي الربح يظهر عند اكتمال الكوست':'')+'</div></div>';
  }
  function ensureStyle(){
    if(document.getElementById('dcStyle'))return;
    const st=document.createElement('style');st.id='dcStyle';
    st.textContent=`
    .dc-panel{background:#1c1c1e;color:#f5f5f5;border:1px solid #38383a;border-radius:16px;padding:16px;direction:rtl;box-sizing:border-box;min-width:0}
    .dc-panel h3{font-size:19px!important;color:${GOLD}!important;margin:0 0 6px!important}
    .dc-panel .pf-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;font-size:17px;line-height:1.5}
    .dc-panel .pf-row strong{white-space:nowrap;direction:ltr;font-size:19px;font-variant-numeric:tabular-nums}
    .dc-real{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px;padding-top:12px;border-top:1px solid #38383a}
    .dc-real span{font-size:18px;font-weight:700}.dc-real b{font-size:clamp(24px,7vw,32px);font-weight:800;direction:ltr;white-space:nowrap;font-variant-numeric:tabular-nums}
    .dc-note{margin-top:8px;font-size:13px;color:#b6b6bb;line-height:1.6}
    .dc-page{display:grid;gap:12px;max-width:760px}
    .dc-page .pf-panel,.dc-page .dc-panel{background:#1c1c1e;color:#f5f5f5;border:1px solid #38383a;border-radius:16px;padding:16px}
    .dc-sum{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .dc-sum div{background:#252528;border-radius:12px;padding:12px;text-align:center}.dc-sum small{display:block;color:#b6b6bb;font-size:14px}
    .dc-sum b{display:block;font-size:clamp(22px,6vw,30px);margin-top:4px;direction:ltr;font-variant-numeric:tabular-nums}
    .dc-item{border-top:1px solid #38383a;padding:12px 0;display:grid;gap:8px}
    .dc-item:first-of-type{border-top:0}
    .dc-item-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:17px}
    .dc-item-head b{font-size:19px;direction:ltr;white-space:nowrap}.dc-off{opacity:.55}
    .dc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .dc-form label{display:grid;gap:3px;font-size:13px;color:#b6b6bb;min-width:0}
    .dc-form input{width:100%;box-sizing:border-box;font-size:16px;padding:9px 10px;border-radius:10px;border:1px solid #48484c;background:#2a2a2d;color:#f5f5f5}
    .dc-form .dc-wide{grid-column:1/-1}
    .dc-btn{height:42px;border-radius:12px;border:0;background:#f5f5f5;color:#1c1c1e;font:inherit;font-weight:700;padding:0 14px}
    .dc-btn.ghost{background:transparent;color:#f5f5f5;border:1px solid #48484c}
    .dc-retro[hidden]{display:none!important}.dc-retro{display:flex;gap:8px;align-items:flex-start;color:${GOLD};font-size:13px}
    .dc-hist{font-size:13px;color:#b6b6bb;line-height:1.8}
    @media(max-width:360px){.dc-form{grid-template-columns:1fr}.dc-panel .pf-row{font-size:15px}}`;
    document.head.appendChild(st);
  }

  // ---------------- page ----------------
  async function view(){
    try{state.view='daily-commitment'}catch{}
    const c=document.querySelector('#content');if(!c)return;
    ensureStyle();
    c.innerHTML='<div class="page-title"><div><h1>الالتزام اليومي</h1><div class="sub">المصاريف الشهرية الثابتة لمتجر كورفكس • الالتزام اليومي = الإجمالي الشهري ÷ 30</div></div></div><div class="dc-page" id="dcPage"><div class="pf-muted">جارٍ التحميل…</div></div>';
    await load();
  }
  async function load(){
    const box=document.getElementById('dcPage');if(!box)return;
    let admin=false;try{admin=state.user?.role==='admin'}catch{}
    try{
      cache.clear();
      const d=await window.api('/daily-commitment?date='+today()+(admin?'&manage=1':''));
      const sched=new Map();(d.scheduled||[]).forEach(v=>{if(!sched.has(v.item_id))sched.set(v.item_id,v)});
      box.innerHTML=
        '<div class="pf-panel"><div class="dc-sum"><div><small>إجمالي الالتزام الشهري</small><b>'+money(d.monthly_total)+'</b></div><div><small>الالتزام اليومي</small><b style="color:'+GOLD+'">'+money(d.daily)+'</b></div></div><div class="pf-muted dc-note">متجر '+esc(d.store.name)+' فقط • الأرقام السارية اليوم '+esc(d.date)+'</div></div>'+
        '<div class="pf-panel"><h3 style="margin:0 0 4px;font-size:19px">البنود</h3>'+d.items.map(i=>{
          const s=sched.get(i.id);
          return '<div class="dc-item'+(!i.active&&i.effective_from?' dc-off':'')+'"><div class="dc-item-head"><span>'+esc(i.name)+(!i.active&&i.effective_from?' • معطّل':'')+'</span><b>'+money(i.monthly)+' د.أ/شهر</b></div>'+
            '<div class="pf-muted">يوميًا '+money(i.active?i.monthly/30:0)+' د.أ'+(i.effective_from?' • ساري من '+esc(i.effective_from):' • لم يُحدد مبلغ بعد')+(s?' • مجدول: '+money(s.monthly_amount)+(Number(s.active)?'':' (تعطيل)')+' من '+esc(s.effective_from):'')+'</div>'+
            (admin?'<div class="dc-form" data-item="'+i.id+'"><label>الاسم<input class="dc-name" value="'+esc(i.name)+'"></label><label>المبلغ الشهري<input class="dc-amount" inputmode="decimal" value="'+(i.monthly||'')+'"></label><label>يسري من<input class="dc-date" type="date" value="'+today()+'"></label><label>الحالة<select class="dc-active" style="width:100%;font-size:16px;padding:9px;border-radius:10px;background:#2a2a2d;color:#f5f5f5;border:1px solid #48484c"><option value="1"'+(i.active||!i.effective_from?' selected':'')+'>مفعّل</option><option value="0"'+(!i.active&&i.effective_from?' selected':'')+'>معطّل</option></select></label><label class="dc-retro dc-wide" hidden><input type="checkbox" class="dc-retro-ok"> أوافق على تطبيق هذا التعديل بأثر رجعي (يغيّر أرباح الأيام السابقة)</label><button type="button" class="dc-btn dc-save dc-wide">حفظ التعديل</button></div>':'')+'</div>';
        }).join('')+'</div>'+
        (admin?'<div class="pf-panel"><h3 style="margin:0 0 8px;font-size:19px">إضافة بند مصاريف</h3><div class="dc-form" data-item="new"><label>اسم البند<input class="dc-name" placeholder="مثال: اشتراكات"></label><label>المبلغ الشهري<input class="dc-amount" inputmode="decimal"></label><label class="dc-wide">يسري من<input class="dc-date" type="date" value="'+today()+'"></label><label class="dc-retro dc-wide" hidden><input type="checkbox" class="dc-retro-ok"> أوافق على تطبيق هذا البند بأثر رجعي</label><button type="button" class="dc-btn dc-save dc-wide">إضافة البند</button></div></div>':'<div class="pf-muted">التعديل متاح للمدير فقط.</div>')+
        (admin&&(d.versions||[]).length?'<div class="pf-panel"><h3 style="margin:0 0 8px;font-size:19px">سجل التعديلات</h3><div class="dc-hist">'+d.versions.map(v=>esc(v.at)+' • '+esc(v.name)+': '+money(v.monthly_amount)+(Number(v.active)?'':' (تعطيل)')+' يسري من '+esc(v.effective_from)+(Number(v.retroactive)?' • بأثر رجعي':'')+(v.by_name?' • '+esc(v.by_name):'')).join('<br>')+'</div></div>':'');
    }catch(e){box.innerHTML='<div class="pf-panel">'+esc(e.message)+'</div>'}
  }
  document.addEventListener('input',e=>{
    const f=e.target.closest?.('.dc-form');if(!f||!e.target.classList.contains('dc-date'))return;
    const r=f.querySelector('.dc-retro');if(r)r.hidden=!(e.target.value&&e.target.value<today());
  });
  document.addEventListener('change',e=>{const f=e.target.closest?.('.dc-form');if(f&&e.target.classList.contains('dc-date')){const r=f.querySelector('.dc-retro');if(r)r.hidden=!(e.target.value&&e.target.value<today())}});
  document.addEventListener('click',async e=>{
    const b=e.target.closest?.('.dc-save');if(!b)return;
    const f=b.closest('.dc-form'),id=f.dataset.item,q=s=>f.querySelector(s);
    const body={effective_from:q('.dc-date').value,monthly_amount:q('.dc-amount').value===''?undefined:Number(q('.dc-amount').value),confirm_retroactive:Boolean(q('.dc-retro-ok')?.checked),name:q('.dc-name')?.value||''};
    if(id==='new')body.action='add';else{body.action='set';body.item_id=Number(id);body.active=q('.dc-active').value==='1'}
    b.disabled=true;
    try{await window.api('/daily-commitment',{method:'POST',body:JSON.stringify(body)});(window.toast||alert)('تم الحفظ — يسري من '+body.effective_from);cache.clear();await load()}
    catch(err){(window.toast||alert)(err.message);if(/أثر رجعي|رجعي/.test(err.message)){const r=q('.dc-retro');if(r)r.hidden=false}}
    finally{b.disabled=false}
  });
  function nav(){
    const n=document.querySelector('.sidebar .nav');if(!n||document.getElementById('dailyCommitmentNav'))return;
    const b=document.createElement('button');b.id='dailyCommitmentNav';b.type='button';b.textContent='📅 الالتزام اليومي';
    b.onclick=()=>{view();document.querySelector('.sidebar')?.classList.remove('open');document.querySelector('#sidebarOverlay')?.classList.remove('show')};
    const anchor=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('الأرباح'));
    anchor?anchor.after(b):n.appendChild(b);
  }
  new MutationObserver(nav).observe(document.documentElement,{childList:true,subtree:true});nav();
  window.CorvexCommitment={get,panel,view,clear:()=>cache.clear()};
  window.dailyCommitmentView=view;
})();
