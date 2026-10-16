(() => {
  const $=id=>document.getElementById(id);
  let current=null,busy=false;
  const labels={apply:'محفوظ',superseded:'استُبدل بتحديث أحدث',local_deleted:'الطلب محذوف من كورفكس',closed:'الطلب أُلغي سابقًا',store_changed:'نُقل الطلب إلى متجر آخر',dispatched:'دخل الطباعة أو التوصيل أو التسوية',inventory_review:'مرتبط بحركة مخزون',manual_change:'تغيرت بياناته يدويًا في كورفكس',duplicate_phone:'رقم الهاتف موجود لهذا المتجر خلال ٤٨ ساعة',queued:'بانتظار المعالجة'};
  function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'error':'';$('notice').style.display=text?'block':'none'}
  async function api(body){
    const token=localStorage.getItem('corvex_token');
    if(!token)throw new Error('افتح كورفكس وسجّل الدخول بحساب المدير، ثم ارجع لهذه الصفحة.');
    const response=await fetch('/api/cepoxy-connect',{method:body?'POST':'GET',cache:'no-store',
      headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json()}catch{throw new Error('تعذر قراءة الرد. حدّث الصفحة وحاول مجددًا.')}
    if(!response.ok)throw new Error(data.error==='review_required'?`ما زال الطلب يحتاج مراجعة: ${labels[data.outcome]||data.outcome}`:data.error||'تعذر إكمال العملية.');
    return data;
  }
  function date(value){return value?new Date(value.replace(' ','T')+'Z').toLocaleString('ar-JO',{timeZone:'Asia/Amman'}):'—'}
  function render(data){
    current=data;
    $('status').textContent=!data.configured?'لم يُفعّل الربط بعد. ابدأ بالخطوة ١ أدناه.':
      !data.available?'الربط يحتاج مراجعة: المتجر أو حساب المدير المسؤول عنه متوقف.':
      !data.enabled?'النقل متوقف مؤقتًا.':!data.verified?'ملف الربط جاهز؛ بانتظار وصول فحص الاتصال من قاعدة الواتساب.':
      `تم التحقق من الاتصال.\nآخر اتصال: ${date(data.last_seen_at)}\n${data.counts?.total?`طلبات محفوظة: ${data.counts.saved||0} · تحتاج مراجعة: ${data.counts.review||0}`:'أنشئ طلبًا تجريبيًا جديدًا من الواتساب للتحقق من النقل.'}`;
    $('toggle').hidden=!data.configured;$('toggle').textContent=data.enabled?'إيقاف النقل مؤقتًا':'استئناف النقل';
    $('setup').hidden=!!data.verified;
    $('counts').textContent=data.configured?`المحفوظة: ${data.counts?.saved||0} | بحاجة للمراجعة: ${data.counts?.review||0}`:'';
    $('events').replaceChildren();
    if(!data.events?.length){$('events').textContent='لا توجد طلبات واردة من الربط حتى الآن.';return}
    // Unresolved events stay above successful imports. All customer text is textContent.
    const events=[...data.events].sort((a,b)=>Number(a.decision==='apply')-Number(b.decision==='apply')||b.event_id-a.event_id);
    for(const e of events){
      const row=document.createElement('article');row.className='event';
      const title=document.createElement('strong');title.textContent=`${e.source_id}${e.order_code?` ← كورفكس #${e.order_code}`:''}`;
      const state=document.createElement('span');state.className=`pill ${e.decision==='apply'?'good':'warn'}`;
      state.textContent=e.decision==='apply'?(e.order.status==='cancelled'?'تم تسجيل الإلغاء':'تم الحفظ في كورفكس'):`تحتاج مراجعة: ${labels[e.decision]||e.decision}`;
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='عرض بيانات الواتساب';
      const text=document.createElement('pre');text.textContent=`الاسم: ${e.order.name}\nالرقم: ${e.order.contact_phone}\nالعنوان: ${e.order.city} - ${e.order.address}\nالكمية: ${e.order.packs} عبوات\nالإجمالي: ${e.order.total_jod} دنانير شامل التوصيل\nحالة الواتساب: ${e.order.status==='cancelled'?'ملغي':'مؤكد'}\nوصل: ${date(e.received_at)}`;
      details.append(summary,text);row.append(title,state,details);
      if(e.decision!=='apply'){
        const help=document.createElement('p');help.className='muted';help.textContent='راجع الطلب في كورفكس أولًا. إعادة الفحص لا تتجاوز قفل الطباعة أو التكرار ولا تستبدل التعديل اليدوي.';
        const retry=document.createElement('button');retry.className='secondary';retry.textContent='إعادة فحص النقل';
        retry.onclick=()=>run(async()=>{await api({action:'retry',event_id:e.event_id});notice('اكتملت إعادة الفحص؛ راجع الحالة المحدثة.');await refresh()});
        row.append(help,retry);
      }
      $('events').append(row);
    }
  }
  async function refresh(){render(await api())}
  async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn()}catch(e){notice(e.message,true)}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
  $('refresh').onclick=()=>run(async()=>{notice('');await refresh()});
  $('download').onclick=()=>run(async()=>{
    const data=await api({action:'setup'});
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([data.sql],{type:'text/plain;charset=utf-8'}));
    link.href=url;link.download='cepoxy-corvex-setup.sql';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    notice('تم تجهيز الملف. شغّله في محرر SQL من الخطوة ٢، ثم حدّث الحالة هنا.');await refresh();
  });
  $('toggle').onclick=()=>run(async()=>{await api({action:'enabled',enabled:!current.enabled});notice('');await refresh()});
  run(refresh);
})();
