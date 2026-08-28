(()=>{
 let returnState=null;
 function bind(){
   if(state?.view!=='daily-profits')return;
   document.querySelectorAll('.profit-order-card').forEach(card=>{
     if(card.dataset.profitLinkBound==='1')return;
     const head=card.querySelector('.section-head b');
     const id=Number(card.dataset.id||0);
     if(!head||!id)return;
     card.dataset.profitLinkBound='1';
     head.style.cursor='pointer';head.style.textDecoration='underline';head.title='فتح معلومات الطلب';
     head.onclick=async e=>{
       e.stopPropagation();
       returnState={date:document.querySelector('#profitDate')?.value||'',store:document.querySelector('#profitStore')?.value||''};
       await window.editOrder(id);
       setTimeout(()=>{
         const back=document.querySelector('#backToOrders');
         if(!back)return;
         back.textContent='العودة للأرباح اليومية';
         back.onclick=async()=>{
           await window.dailyProfitsView();
           setTimeout(()=>{
             const d=document.querySelector('#profitDate'),s=document.querySelector('#profitStore'),load=document.querySelector('#loadProfits');
             if(d&&returnState?.date)d.value=returnState.date;
             if(s&&returnState?.store)s.value=returnState.store;
             load?.click();
           },80);
         };
       },50);
     };
   });
 }
 document.addEventListener('corvex:profits-rendered',bind);bind();
})();
