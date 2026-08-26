(()=>{
 // قاعدة موحدة للمستودع: لا خصم عند الإدخال أو الطباعة، الخصم فقط حسب النتيجة النهائية.
 // تنطبق على الطلبات العادية والمباشر بنفس الطريقة.
 window.CORVEX_WAREHOUSE_STATUS_RULE={
   soldPieces(order={},models=[]){
     const status=String(order.delivery_status||order.status||'pending');
     if(status==='delivered'||status==='delivered_adjusted'){
       return models.map(m=>({...m,sold_qty:Math.max(0,Number(m.qty||0))}));
     }
     if(status==='partial'){
       // في الجزئي نعتمد القطع المستلمة/المسلّمة المسجلة فعليًا، ولا نفترض كامل الطلب.
       let remaining=Math.max(0,Number(order.delivered_pieces||0));
       return models.map(m=>{
         const q=Math.min(Math.max(0,Number(m.qty||0)),remaining);
         remaining-=q;
         return {...m,sold_qty:q};
       }).filter(x=>x.sold_qty>0);
     }
     return [];
   },
   countsAsSale(order={}){
     return ['delivered','delivered_adjusted','partial'].includes(String(order.delivery_status||order.status||'pending'));
   }
 };
})();