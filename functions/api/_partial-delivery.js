// Shared rules for closing delivery-company statements (تسكير كشف شركة التوصيل).
// Used by /api/delivery-reconcile/preview, /api/delivery-reconcile/commit and
// /api/partial-delivery-items so the browser and the server always agree on
// which order a statement line belongs to and how partial-delivery cost is built.
import {classifyInventoryItems,loadInventoryModels} from './_inventory.js';
import {runSchemaMigrationOnce} from './_schema-migrations.js';

export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

// Orders shipped before this date belong to statements that were closed with
// the previous workflow; they are never touched by the reconcile endpoints.
export const RECONCILE_CUTOFF='2026-11-17';
export const RETURN_STATUSES=new Set(['refused_fee_paid','refused_no_fee','canceled_before_arrival']);
export const PARTIAL_STATUSES=new Set(['partial','delivered_adjusted']);

const DIGITS={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
export const normalizeDigits=value=>String(value??'').replace(/[٠-٩۰-۹]/g,d=>DIGITS[d]||d);
export function normalizePhone(value=''){
 let digits=normalizeDigits(value).replace(/\D/g,'');
 if(digits.startsWith('00962'))digits=digits.slice(2);
 if(digits.startsWith('962')&&digits.length>=12)digits='0'+digits.slice(3);
 else if(digits.length===9&&digits.startsWith('7'))digits='0'+digits;
 return digits;
}
export const normalizeArabic=value=>normalizeDigits(value).toLowerCase()
 .replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه')
 .replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();
export const round2=n=>Math.round((Number(n)||0)*100)/100;

export async function auth(request,env){
 const header=request.headers.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';
 if(!token)return null;
 return env.DB.prepare(`SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.is_active=1`).bind(token).first();
}

// ---------------------------------------------------------------- order codes
// "رقم الشحنة" printed on the label is the order code (barcode). Cargo Box also
// writes "ORD-xxxx" / "رقم الطلب: xxxx" inside its notes.
export function statementCodes(row={}){
 const out=new Set();
 const direct=normalizeDigits(row.shipment_code||'').replace(/^\s*(?:ord|#)\s*[-:]?\s*/i,'').replace(/[^0-9a-z]/gi,'').toLowerCase();
 if(direct)out.add(direct);
 const text=normalizeDigits(row.note||'').replace(/\s+/g,' ');
 for(const m of text.matchAll(/(?:ORD\s*[-:#]?\s*|(?:رقم\s*)?(?:الطلب|الشحنه|الشحنة)\s*[:：#]?\s*|#)([a-z0-9-]{3,50})/gi)){
  const code=m[1].replace(/[^0-9a-z]/gi,'').toLowerCase();if(code)out.add(code);
 }
 return [...out];
}
export const normalizeCode=code=>normalizeDigits(code).toLowerCase().replace(/^ord[-:\s]*/,'').replace(/[^a-z0-9]/g,'');

// ------------------------------------------------------------------- dates
export function dayNumber(value){
 const s=String(value||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const t=Date.parse(s+'T00:00:00Z');return Number.isNaN(t)?null:Math.round(t/86400000);
}
// A shipment leaves on (or a day or two after) the day its label was first
// printed. Anything further away is a different shipment for the same customer.
export function shipmentDateFit(order,shipmentDate){
 const ship=dayNumber(shipmentDate);
 if(ship===null)return {known:false,ok:null,gap:null};
 const printed=dayNumber(order.first_print_date||order.created_date);
 const delivery=dayNumber(order.delivery_date);
 const gaps=[printed,delivery].filter(x=>x!==null).map(x=>ship-x);
 if(!gaps.length)return {known:true,ok:false,gap:null};
 const ok=(printed!==null&&ship-printed>=-1&&ship-printed<=3)||(delivery!==null&&Math.abs(ship-delivery)<=2);
 return {known:true,ok,gap:Math.min(...gaps.map(Math.abs))};
}

// ---------------------------------------------------------- approved costs
// After normalizeArabic: ستأتي→ستاتي, ستائتي→ستايتي, ستاتى→ستاتي.
export const STATI_NORMALIZED=/(?:جاكيت|جكيت|جاكت|جوخ)\s*(?:جوخ\s*)?ستا?[يء]?ت(?:يه|ي|ه)(?![\u0600-\u06FF])/;
export const STATI_ALIASES=['جاكيت جوخ ستاتي','جكيت جوخ ستاتي','جاكيت جوخ ستأتي','جكيت جوخ ستأتي','جاكيت جوخ ستائتي','جاكيت جوخ ستايتي','جاكيت جوخ ستاتيه','جوخ ستاتي','جوخ ستأتي','جوخ ستائتي','جوخ ستاتيه','جاكيت ستاتي','جكيت ستاتي','جاكيت ستأتي','جاكيت ستائتي','جاكيت ستاتيه'];
export const canonicalModelName=name=>approvedCost({name})===7.55?'جاكيت جوخ سكايفو':String(name||'');
// Approved per-piece costs (JOD) for the jacket season. They override whatever
// is stored in profit_models when the cost of delivered pieces is computed.
const APPROVED=[
 {key:'fur_jacket',cost:4.00,test:n=>/فرو/.test(n)&&/(جاكيت|جكيت|جاكت)/.test(n)},
 {key:'jokh_casual',cost:5.20,test:n=>/جوخ/.test(n)&&/كاجو/.test(n)},
 // «ستاتي» and all its spellings are the same model as «سكايفو» (merchant decision 2026-11-24).
 {key:'jokh_scarfo',cost:7.55,test:n=>/(سكايفو|سكارفو)/.test(n)||STATI_NORMALIZED.test(n)},
 {key:'gap_filler',cost:1.00,test:n=>/(مال[ياءى]?\s*ال?فراغات|ملا?ء?\s*ال?فراغات|ايبوكسي|ايوبكسي|epoxy)/.test(n)}
];
export function approvedCost(model){
 if(!model)return null;
 const byKey=APPROVED.find(x=>x.key===String(model.model_key||model.key||''));
 if(byKey)return byKey.cost;
 const name=normalizeArabic(model.name||'');
 const hit=APPROVED.find(x=>x.test(name));
 return hit?hit.cost:null;
}
export const FILLER_ALIASES=['مالئ الفراغات','مالئ فراغات','ايبوكسي','إيبوكسي','أيبوكسي','سي ايبوكسي','سي إيبوكسي','سى ايبوكسي','ايوبكسي','أيوبكسي','إيوبكسي','سي ايوبكسي','C epoxy','epoxy'];
const FUR_ALIASES=['جاكيت فرو','جكيت فرو','جاكيت الفرو','جاكيت فروه','جاكيت فروة','فرو جاكيت'];

// One-time catalogue alignment: approved costs, filler spellings, fur jacket.
// Orders already settled keep their stored cost_of_goods; nothing historical is rewritten.
export async function ensureApprovedCatalogue(env){
 await runSchemaMigrationOnce(env,'2026-11-23-approved-jacket-costs-v1',async()=>{
  const rows=(await env.DB.prepare('SELECT id,model_key,name,cost,aliases_json,active FROM profit_models').all()).results||[];
  const statements=[];
  for(const row of rows){
   const approved=approvedCost(row);
   if(approved!==null&&Number(row.active)===1&&Math.abs(Number(row.cost||0)-approved)>.0001){
    statements.push(env.DB.prepare("UPDATE profit_models SET cost=?,updated_at=datetime('now') WHERE id=?").bind(approved,row.id));
    statements.push(env.DB.prepare("INSERT INTO profit_model_audit(model_id,action,before_json,after_json) VALUES(?,?,?,?)").bind(row.id,'approved_cost',JSON.stringify({cost:Number(row.cost||0)}),JSON.stringify({cost:approved})));
   }
  }
  const filler=rows.find(r=>r.model_key==='gap_filler')||rows.find(r=>/فراغات/.test(normalizeArabic(r.name)));
  if(filler){
   let aliases=[];try{aliases=JSON.parse(filler.aliases_json||'[]')}catch{}
   const next=[...new Set([...aliases,...FILLER_ALIASES])];
   if(next.length!==aliases.length)statements.push(env.DB.prepare("UPDATE profit_models SET aliases_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(next),filler.id));
  }else{
   statements.push(env.DB.prepare("INSERT OR IGNORE INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('gap_filler','مالئ الفراغات',1,?,'{}',0,1)").bind(JSON.stringify(FILLER_ALIASES)));
  }
  const hasFur=rows.some(r=>Number(r.active)===1&&approvedCost(r)===4);
  if(!hasFur)statements.push(env.DB.prepare("INSERT OR IGNORE INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('fur_jacket','جاكيت فرو',4,?,'{}',0,1)").bind(JSON.stringify(FUR_ALIASES)));
  if(statements.length)await env.DB.batch(statements);
 });
}

// Merges «جاكيت جوخ ستاتي» into «جاكيت جوخ سكايفو»: its spellings become aliases of the
// single scarfo model. A separately created stati model (if any) is deactivated so the same
// order line can never be counted under two models.
export async function ensureStatiMerged(env){
 await runSchemaMigrationOnce(env,'2026-11-24-merge-stati-into-scarfo-v1',async()=>{
  const rows=(await env.DB.prepare('SELECT id,model_key,name,aliases_json,active FROM profit_models').all()).results||[];
  const scarfo=rows.find(r=>r.model_key==='jokh_scarfo')||rows.find(r=>Number(r.active)===1&&/(سكايفو|سكارفو)/.test(normalizeArabic(r.name)));
  const statements=[];
  if(scarfo){
   let aliases=[];try{aliases=JSON.parse(scarfo.aliases_json||'[]')}catch{}
   const extra=[];
   for(const r of rows)if(r.id!==scarfo.id&&STATI_NORMALIZED.test(normalizeArabic(r.name))){try{extra.push(r.name,...JSON.parse(r.aliases_json||'[]'))}catch{extra.push(r.name)}}
   const next=[...new Set([...aliases,...STATI_ALIASES,...extra])];
   statements.push(env.DB.prepare("UPDATE profit_models SET aliases_json=?,cost=7.55,active=1,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(next),scarfo.id));
  }else{
   statements.push(env.DB.prepare("INSERT OR IGNORE INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('jokh_scarfo','جاكيت جوخ سكايفو',7.55,?,'{}',0,1)").bind(JSON.stringify(['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت جوخ سكارفو','جاكيت سكايفو','جاكيت نسائي','جوخ شتائي',...STATI_ALIASES])));
  }
  for(const r of rows)if((!scarfo||r.id!==scarfo.id)&&Number(r.active)===1&&STATI_NORMALIZED.test(normalizeArabic(r.name))){
   statements.push(env.DB.prepare("UPDATE profit_models SET active=0,updated_at=datetime('now') WHERE id=?").bind(r.id));
   statements.push(env.DB.prepare("INSERT INTO profit_model_audit(model_id,action,before_json,after_json) VALUES(?,?,?,?)").bind(r.id,'merged_into_scarfo',JSON.stringify({name:r.name}),JSON.stringify({merged_into:scarfo?.id||'jokh_scarfo'})));
  }
  await env.DB.batch(statements);
 });
}

export async function loadCostedModels(env){
 await ensureApprovedCatalogue(env);
 await ensureStatiMerged(env);
 const models=await loadInventoryModels(env);
 const rows=(await env.DB.prepare('SELECT id,model_key,name,cost FROM profit_models WHERE active=1').all()).results||[];
 const byId=new Map(rows.map(r=>[Number(r.id),r]));
 return models.map(m=>{const r=byId.get(m.id)||{};const approved=approvedCost({model_key:r.model_key,name:r.name||m.name});return{...m,unit_cost:approved??Number(r.cost||0),approved_cost:approved!==null}});
}

// Models and quantities that physically left in this order's shipment.
export async function shippedItems(env,order,models){
 const list=models||await loadCostedModels(env);
 const items=await classifyInventoryItems(env,order.raw_text||order.order_notes||'',list);
 return items.map(item=>{const m=list.find(x=>x.id===item.model_id)||{};return{model_id:item.model_id,model_name:m.name||'',quantity:item.quantity,unit_cost:round2(m.unit_cost||0),approved_cost:Boolean(m.approved_cost)}});
}

// Validates the received/returned split for a partial delivery and prices the
// received pieces only. Returns {ok:false,reason} when the split is not exact.
export function pricePartialDelivery(shipped,submitted){
 if(!shipped.length)return {ok:false,reason:'لم يتم التعرف على موديلات الطلب من نصه؛ لا يمكن تحديد القطع'};
 const list=Array.isArray(submitted)?submitted:[];
 const byModel=new Map();
 for(const x of list){
  const id=Number(x.model_id);
  if(byModel.has(id))return {ok:false,reason:'الموديل مكرر في تفاصيل التسليم'};
  byModel.set(id,x);
 }
 for(const id of byModel.keys())if(!shipped.some(s=>s.model_id===id))return {ok:false,reason:'تم إرسال موديل غير موجود في هذا الطلب'};
 const items=[];
 for(const s of shipped){
  const x=byModel.get(s.model_id);
  if(!x)return {ok:false,reason:`حدد المستلم والمرتجع لموديل ${s.model_name}`};
  const received=Number(x.received??x.quantity),returned=Number(x.returned??(s.quantity-received));
  if(!Number.isInteger(received)||!Number.isInteger(returned)||received<0||returned<0)return {ok:false,reason:`كميات غير صحيحة لموديل ${s.model_name}`};
  if(received+returned!==s.quantity)return {ok:false,reason:`موديل ${s.model_name}: المستلم (${received}) + المرتجع (${returned}) يجب أن يساوي المشحون (${s.quantity})`};
  items.push({model_id:s.model_id,model_name:s.model_name,shipped:s.quantity,quantity:received,received,returned,unit_cost:s.unit_cost,cost:round2(received*s.unit_cost)});
 }
 const received=items.reduce((n,x)=>n+x.received,0),returned=items.reduce((n,x)=>n+x.returned,0);
 if(received<1)return {ok:false,reason:'لم يُستلم أي قطعة؛ هذا رفض/مرتجع كامل وليس تسليمًا جزئيًا'};
 if(returned<1)return {ok:false,reason:'كل القطع مستلمة؛ اختر حالة «تم التسليم» بدل التسليم الجزئي'};
 return {ok:true,items,received,returned,cost:round2(items.reduce((n,x)=>n+x.cost,0))};
}
