// Read-only details of one delivery-company settlement (statement): header + every order it
// settled, with what the statement said (imported status/amount) and what was applied.
// Nothing here writes to the database.
import {json,auth} from '../_partial-delivery.js';

export async function onRequestGet({request,env}){
 if(!await auth(request,env))return json({error:'غير مصرح'},401);
 const url=new URL(request.url);
 const id=Number(url.searchParams.get('id')||0),code=String(url.searchParams.get('code')||'').trim();
 if(!id&&!code)return json({error:'رقم الكشف مطلوب'},400);
 const s=await env.DB.prepare(`SELECT d.*,st.name store_name,u.display_name created_by_name FROM delivery_company_settlements d
   LEFT JOIN stores st ON st.id=d.store_id LEFT JOIN users u ON u.id=d.created_by
   WHERE ${id?'d.id=?':'d.settlement_code=?'}`).bind(id||code).first();
 if(!s)return json({error:'الكشف غير موجود'},404);
 const rows=(await env.DB.prepare(`SELECT so.order_id,so.phone,so.imported_status,so.applied_status,so.imported_amount,so.note,so.match_type,
   o.order_code,o.recipient_name,o.amount order_amount,o.delivery_status current_status,o.delivered_amount,o.cash_collected,o.delivery_fee,
   COALESCE(o.delivery_company_settled,0) delivery_company_settled,o.delivery_company_settlement_id,
   CASE WHEN o.first_printed_at IS NULL THEN NULL ELSE date(o.first_printed_at,'+3 hours') END first_print_date
   FROM delivery_company_settlement_orders so LEFT JOIN orders o ON o.id=so.order_id
   WHERE so.settlement_id=? ORDER BY so.rowid`).bind(s.id).all()).results||[];
 return json({settlement:s,orders:rows.map(r=>({...r,still_linked:Number(r.delivery_company_settlement_id||0)===Number(s.id)}))});
}
