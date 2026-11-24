// Shipments/orders already physically received through a closed returns statement
// (or a confirmed per-shipment receipt). Used by preview and commit so a received return
// is never offered or closed again. A "returned" status alone does NOT count as received.
export const normCode=c=>String(c??'').trim().replace(/\s+/g,'').toUpperCase();

export async function loadClosedIndex(env){
 const orders=new Map(),codes=new Map();
 try{
  const rows=(await env.DB.prepare("SELECT id,strftime('%d/%m/%Y %H:%M',created_at,'+3 hours') closed_at,source_name,details_json FROM cargo_return_close_reports ORDER BY id").all()).results||[];
  for(const r of rows){
   let d={};try{d=JSON.parse(r.details_json||'{}')}catch{}
   for(const c of d.closed||[]){
    const info={kind:'report',report_id:Number(r.id),closed_at:r.closed_at,source_name:r.source_name||'',order_id:Number(c.order_id)||null,order_code:c.order_code??null,shipment_code:c.shipment_code||''};
    if(info.order_id&&!orders.has(info.order_id))orders.set(info.order_id,info);
    const k=normCode(c.shipment_code);if(k&&!codes.has(k))codes.set(k,info);
   }
   // Older statements skipped orders that were already "returned" («مرتجع مسبقًا») instead of
   // closing them, although the shipment was in the returns statement: it is received too.
   for(const c of d.skipped||[]){
    if(!Number(c.order_id)||!/مرتجع مسبق/.test(String(c.reason||'')))continue;
    const info={kind:'report',report_id:Number(r.id),closed_at:r.closed_at,source_name:r.source_name||'',order_id:Number(c.order_id),order_code:c.order_code??null,shipment_code:c.shipment_code||'',prior_returned:true};
    if(!orders.has(info.order_id))orders.set(info.order_id,info);
    const k=normCode(c.shipment_code);if(k&&!codes.has(k))codes.set(k,info);
   }
  }
 }catch{}
 try{
  const rows=(await env.DB.prepare("SELECT r.shipment_code,r.order_id,strftime('%d/%m/%Y %H:%M',r.received_at,'+3 hours') closed_at,o.order_code FROM cargo_return_receipts r LEFT JOIN orders o ON o.id=r.order_id").all()).results||[];
  for(const r of rows){
   const info={kind:'receipt',report_id:null,closed_at:r.closed_at,order_id:Number(r.order_id)||null,order_code:r.order_code??null,shipment_code:r.shipment_code||''};
   if(info.order_id&&!orders.has(info.order_id))orders.set(info.order_id,info);
   const k=normCode(r.shipment_code);if(k&&!codes.has(k))codes.set(k,info);
  }
 }catch{}
 return {orders,codes};
}
export const closedText=i=>i.kind==='receipt'?`تأكيد استلام بتاريخ ${i.closed_at}`:`كشف المرتجعات #${i.report_id} بتاريخ ${i.closed_at}`;
