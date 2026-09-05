(async()=>{
  const jobKey=new URLSearchParams(location.search).get('job')||'';
  const finish=(payload={})=>{
    try{
      localStorage.removeItem(jobKey);
      localStorage.setItem('corvex_print_result',JSON.stringify({job_key:jobKey,at:Date.now(),...payload}));
    }catch{}
  };
  const fail=message=>{
    const text=String(message||'تعذر تجهيز الطباعة');
    finish({error:text});
    document.title='خطأ في الطباعة';
    document.body.innerHTML=`<div dir="rtl" style="font-family:Tahoma,Arial;text-align:center;padding:60px 20px"><h2 style="color:#b42318">لم تكتمل الطباعة</h2><p>${esc(text)}</p><button onclick="window.close()" style="padding:12px 24px;border:0;border-radius:10px;background:#102f4a;color:white;font-size:17px">إغلاق</button></div>`;
  };
  try{
    if(!jobKey)throw new Error('بيانات مهمة الطباعة غير موجودة');
    const raw=localStorage.getItem(jobKey);
    if(!raw)throw new Error('انتهت صلاحية مهمة الطباعة، أعد الضغط على زر الطباعة');
    const job=JSON.parse(raw);
    if(!state.token)throw new Error('انتهت جلسة الدخول، سجل الدخول ثم أعد الطباعة');
    let data;
    if(job.kind==='create'){
      data=await api('/print-batches',{method:'POST',body:JSON.stringify({order_ids:job.order_ids||[]})});
    }else if(job.kind==='batch'){
      data=await api('/print-batches/'+Number(job.batch_id||0));
    }else{
      throw new Error('نوع مهمة الطباعة غير معروف');
    }
    let orders=data.orders||[];
    let title=job.kind==='create'?`دفعة ${data.batch?.store_name||''} - ${data.batch?.batch_code||''}`:`إعادة ${data.batch?.batch_code||''}`;
    if(job.mode==='page'){
      const max=Math.max(1,Math.ceil(orders.length/8));
      const page=Number(prompt(`رقم الصفحة من 1 إلى ${max}`,'1'));
      if(!(page>=1&&page<=max)){
        finish({canceled:true});
        document.body.innerHTML='<div dir="rtl" style="font-family:Tahoma,Arial;text-align:center;padding:60px"><h2>تم إلغاء الطباعة</h2><button onclick="window.close()">إغلاق</button></div>';
        return;
      }
      orders=orders.slice((page-1)*8,page*8);
      title=`صفحة ${page} - ${data.batch?.batch_code||''}`;
    }
    if(!orders.length)throw new Error('لا توجد طلبات للطباعة');
    finish({ok:true,batch_id:data.batch?.id||null});
    openPrintWindow(orders,title,window);
  }catch(error){fail(error?.message||error)}
})();
