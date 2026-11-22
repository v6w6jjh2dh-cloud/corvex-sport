const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const phone=x=>{let s=String(x??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');if(s.startsWith('00962'))s=s.slice(2);if(s.startsWith('962'))s='0'+s.slice(3);if(s.length===9&&s.startsWith('7'))s='0'+s;return s};
export async function onRequest({request,env}){
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const user=token&&await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1 AND u.role='admin'").bind(token).first();
 if(!user)return json({error:'admin_required'},403);
 const ensureReports=async()=>env.DB.prepare("CREATE TABLE IF NOT EXISTS cargo_return_close_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by INTEGER NOT NULL, source_name TEXT NOT NULL DEFAULT '', matched_count INTEGER NOT NULL DEFAULT 0, closed_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, details_json TEXT NOT NULL DEFAULT '{}')").run();
 await ensureReports();
 if(request.method==='GET'){
  const result=await env.DB.prepare("SELECT id,created_at,source_name,matched_count,closed_count,skipped_count,details_json FROM cargo_return_close_reports ORDER BY id DESC LIMIT 80").all();
  return json({reports:(result.results||[]).map(r=>({...r,details:JSON.parse(r.details_json||'{}'),details_json:undefined}))});
 }
 let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
 const rows=body.rows;
 if(!Array.isArray(rows)||!rows.length||rows.length>500)return json({error:'invalid_rows'},400);
 const unique=new Set(),accepted=[],skipped=[];
 for(const row of rows){
  const id=Number(row.order_id),code=String(row.shipment_code||'').trim(),p=phone(row.phone);
  if(!Number.isSafeInteger(id)||id<=0||!code||!p||unique.has(id)){skipped.push({order_id:id,reason:'بيانات ناقصة أو طلب مكرر'});continue}
  unique.add(id);
  const o=await env.DB.prepare("SELECT id,order_code,phone,delivery_status FROM orders WHERE id=?").bind(id).first();
  if(!o||phone(o.phone)!==p){skipped.push({order_id:id,shipment_code:code,reason:'رقم الهاتف لا يطابق الطلب'});continue}
  if(o.delivery_status==='partial'||o.delivery_status==='delivered_adjusted'){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'تسليم جزئي يحتاج مراجعة منفصلة'});continue}
  if(o.delivery_status==='returned'){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'مرتجع مسبقًا'});continue}
  if(o.delivery_status!=='pending'){skipped.push({order_id:id,order_code:o.order_code,shipment_code:code,current_status:o.delivery_status,reason:'الطلب ليس قيد التوصيل؛ يحتاج مراجعة ولا يتم تغييره تلقائيًا'});continue}
  accepted.push({id,code,phone:p,order_code:o.order_code,previous_status:o.delivery_status});
 }
 if(!accepted.length)return json({ok:true,updated:0,skipped,report_id:null});
 // Only update status: never alter settlement, inventory, or collected cash.
 const sourceName=String(body.source_name||'').slice(0,180);
 const pendingRows=Array.isArray(body.pending_rows)?body.pending_rows.slice(0,500):[];
 for(const row of pendingRows){skipped.push({order_id:Number(row.order_id)||null,order_code:String(row.order_code||''),shipment_code:String(row.shipment_code||''),current_status:String(row.order_status||''),reason:String(row.reason||'شحنة معلّقة تحتاج مراجعة')})}
 const closed=accepted.map(x=>({order_id:x.id,order_code:x.order_code,shipment_code:x.code,phone:x.phone,previous_status:x.previous_status,new_status:'returned'}));
 const details=JSON.stringify({closed,skipped});
 // Record the report in the same D1 batch as status updates.
 const statements=accepted.map(x=>env.DB.prepare("UPDATE orders SET delivery_status='returned',updated_at=datetime('now') WHERE id=? AND delivery_status='pending'").bind(x.id));
 statements.push(env.DB.prepare("INSERT INTO cargo_return_close_reports(created_by,source_name,matched_count,closed_count,skipped_count,details_json) VALUES(?,?,?,?,?,?)").bind(user.id,sourceName,accepted.length,accepted.length,skipped.length,details));
 const result=await env.DB.batch(statements);
 const updated=result.slice(0,-1).reduce((n,x)=>n+Number(x.meta?.changes||0),0);
 const reportId=result[result.length-1]?.meta?.last_row_id||null;
 return json({ok:true,updated,skipped,report_id:reportId});
}
