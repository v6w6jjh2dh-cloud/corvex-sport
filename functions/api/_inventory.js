const STOCK_STATUSES=new Set(['delivered','delivered_adjusted','partial']);

const normalizeDigits=value=>String(value||'')
 .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
 .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// WhatsApp/Excel text often carries invisible direction marks (RLM/LRM, ZWJ, BOM) and
// non-breaking spaces between words; strip them so "جاكيت\u200f جوخ" still matches.
const normalize=value=>normalizeDigits(value).replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/[\u00a0\u202f]/g,' ').toLowerCase()
 .replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه')
 .replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();

const COLORS=new Set(['اسود','ابيض','بني','زيتي','سكني','رمادي','سماوي','ازرق','كحلي','برتقالي','احمر','اخضر','بيج','رصاصي','نهدي','زهري','وردي','موف','بنفسجي']);
const STOP_CONTEXT=/(?:وزن|كيلو|كغم|كغ|kg|مقاس|قياس|طول|تواصل|توصيل|شامل|السعر|سعر|دينار|هاتف|تلفون|موبايل|رقم|عنوان|ملاحظه|موعد|بعد|يوم|ايام|استرجاع|ارجاع|مرتجع|استبدال|تبديل|بدل)/i;
const OPERATION_CONTEXT=/(?:^|\s)و?(?:استرجاع|ارجاع|مرتجع|استبدال|تبديل|بدل)(?=\s|$)/i;
const QUANTITY_LABEL=/(?:عدد|العدد|كميه|الكميه|تفصيل)\s*[:=\-]?\s*(\d{1,3})(?=\s|$)/i;
const QUANTITY_UNIT=/(?:^|\s)(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)(?=\s|$)/i;
const COLOR_QUANTITY=/(?:^|\s)(\d{1,3})\s*(?:اسود|ابيض|بني|زيتي|سكني|رمادي|سماوي|ازرق|كحلي|برتقالي|احمر|اخضر|بيج|رصاصي|نهدي|زهري|وردي|موف|بنفسجي)(?=\s|$)/gi;
// Merchant-approved spellings of the single model «جاكيت فرو» (2026-11-24). One list for
// inventory, cost, profit, returns and model performance (public/app-v73 mirrors it).
export const FUR_ALIASES=['جاكيت فرو','جكيت فرو','جاكيت الفرو','جكيت الفرو','جاكت فرو','فرو جاكيت','جاكيت فروه','فرو','الفرو'];
export const CASUAL_ALIASES=["جاكيت جوخ رجالي","جاكيت رجالي جوخ","جاكيت كاجول جوخ","جاكيت كاجوال جوخ","جاكيت جوخ كاجول","جاكيت جوخ كاجوال","جكيت جوخ رجالي","جكيت رجالي جوخ","جكيت كاجول جوخ","جكيت كاجوال جوخ","جكيت جوخ كاجول","جكيت جوخ كاجوال","جاكت جوخ رجالي","جاكت رجالي جوخ","جاكت كاجول جوخ","جاكت كاجوال جوخ","جاكت جوخ كاجول","جاكت جوخ كاجوال"];
const BARE_FUR=new Set(['فرو','الفرو']);
// "مبطن فرو" / "بطانة فرو" / "ياقة فرو" describe another garment's lining, not a fur jacket.
const FUR_LINING_BEFORE=/(?:مبطن|مبطنه|بطانه|بطانته|ياقه|كبوس|كابيشن|قبعه|مع|فيه|فيها|داخل|داخله|داخلي)\s*$/;
const isFurModel=row=>String(row.model_key||'')==='fur_jacket'||/^(?:جاكيت|جكيت|جاكت)\s*(?:ال)?فرو$/.test(normalize(row.name));
const WORD_NUMBERS={واحد:1,واحده:1,اثنين:2,اتنين:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10};

let schemaPromise=null;
// Tests use a fresh database per case; production keeps one schema check per isolate.
export function resetInventorySchemaCache(){schemaPromise=null}
export async function ensureInventorySchema(env){
 if(schemaPromise)return schemaPromise;
 schemaPromise=(async()=>{
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_balances (
  model_id INTEGER PRIMARY KEY,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(model_id) REFERENCES profit_models(id)
 )`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_order_items (
  order_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(order_id,model_id),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(model_id) REFERENCES profit_models(id)
 )`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_order_tracking (
  order_id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
 )`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  order_id INTEGER,
  quantity_delta INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(model_id) REFERENCES profit_models(id),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
 )`).run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_movements_model_date ON inventory_movements(model_id,id DESC)').run();
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id)').run();
 // ref: unique id of one restock movement (the balance update only runs if it exists);
 // source_ref: which closing produced it (e.g. cargo_report:12) — proof shown in the UI.
 for(const col of ['ref TEXT','source_ref TEXT']){try{await env.DB.prepare('ALTER TABLE inventory_movements ADD COLUMN '+col).run()}catch(e){if(!/duplicate column/i.test(String(e?.message||e)))throw e}}
 await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON inventory_movements(ref)').run();
 })();
 try{return await schemaPromise}catch(error){schemaPromise=null;throw error}
}

function parseAliases(row){
 let aliases=[];try{aliases=JSON.parse(row.aliases_json||'[]')}catch{}
 const names=[row.name,...aliases];
 // "ايبوكسي" and "سي ايبوكسي" are the same merchandise model.
 // Resolve both spellings to the existing model id and stored unit cost.
 if(names.some(name=>/^(?:سي\s+)?(?:ايبوكسي|ايوبكسي)$/.test(normalize(name))))names.push('ايبوكسي','سي ايبوكسي','ايوبكسي');
 if(isFurModel(row))names.push(...FUR_ALIASES);
 if(row.model_key==='jokh_casual'||normalize(row.name)==='جاكيت جوخ كاجوال')names.push(...CASUAL_ALIASES);
 return [...new Set(names.map(normalize).filter(x=>x.length>1))].sort((a,b)=>b.length-a.length);
}

function boundaryMatch(text,needle,from=0){
 let index=text.indexOf(needle,from);
 while(index!==-1){
  const before=text[index-1]||'',after=text[index+needle.length]||'';
  if(!/[\p{L}\p{N}]/u.test(before)&&!/[\p{L}\p{N}]/u.test(after))return index;
  index=text.indexOf(needle,index+1);
 }
 return -1;
}

function matchesInLine(models,line){
 const value=normalize(line),candidates=[];
 for(const model of models){
  let best=null;
  for(const alias of model.aliases){
   let index=boundaryMatch(value,alias);
   if(BARE_FUR.has(alias))while(index!==-1&&FUR_LINING_BEFORE.test(value.slice(0,index)))index=boundaryMatch(value,alias,index+1);
   if(index!==-1&&(!best||alias.length>best.length))best={model,index,length:alias.length}
  }
  if(best)candidates.push(best);
 }
 candidates.sort((a,b)=>b.length-a.length||a.index-b.index);
 const accepted=[];
 for(const item of candidates){const end=item.index+item.length;if(!accepted.some(x=>item.index<x.index+x.length&&end>x.index))accepted.push(item)}
 return accepted.sort((a,b)=>a.index-b.index);
}

function saleLine(value=''){
 const line=normalize(value),operation=OPERATION_CONTEXT.exec(line);if(!operation)return line;
 const before=line.slice(0,operation.index).replace(/\s+و\s*$/,'').trim();
 return /^طلب\s+جديد(?:\s+و)?$/.test(before)?'':before;
}

function standaloneQuantity(text){
 const value=normalize(text);if(STOP_CONTEXT.test(value))return 0;
 let match=value.match(/^(?:عدد|العدد|كميه|الكميه|تفصيل)\s*[:=\-]?\s*(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)?$/)||value.match(/^(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)$/);
 if(match)return Math.max(1,Number(match[1]));
 if(/^(?:قطعتين|حبتين|لونين)$/.test(value))return 2;
 match=value.match(/^(?:عدد|العدد|كميه|الكميه|تفصيل)?\s*(واحد|واحده|اثنين|اتنين|ثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره)\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)$/);
 return match?WORD_NUMBERS[match[1]]||0:0;
}

const colorQuantityCount=text=>[...normalize(text).matchAll(COLOR_QUANTITY)].reduce((sum,m)=>sum+Number(m[1]||0),0);
function colorCount(text){return normalize(text).split(/[^\p{L}]+/u).filter(Boolean).reduce((n,word)=>{const color=word.startsWith('و')&&COLORS.has(word.slice(1))?word.slice(1):word;return n+(COLORS.has(color)?1:0)},0)}

function quantityFor(lines,index,match,lineMatches,allMatches){
 const value=normalize(lines[index]),previous=[...lineMatches].reverse().find(x=>x.index<match.index),next=lineMatches.find(x=>x.index>match.index);
 const before=value.slice(previous?previous.index+previous.length:0,match.index),after=value.slice(match.index+match.length,next?next.index:value.length);
 let count=colorQuantityCount(before);if(count)return count;
 let found=before.match(/(?:^|\s)(?:عدد|العدد|كميه|الكميه|تفصيل)\s*[:=\-]?\s*(\d{1,3})\s*$/i)||before.match(/(?:^|\s)(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)\s*$/i);
 if(found)return Math.max(1,Number(found[1]));
 count=colorQuantityCount(after);if(count)return count;
 // A bare number right after the model is a quantity only when it is small and not a
 // price ("جاكيت جوخ كاجوال 20 دينار شامل التوصيل" is 20 JOD, not 20 pieces).
 found=after.match(QUANTITY_LABEL)||after.match(QUANTITY_UNIT)||after.match(/^\s*(?:[+،,:=\-x×*]\s*)?([1-9]|1[0-9]|20)(?=\s|$)(?!\s*(?:دينار|دنانير|د(?:\s|$)|jd|jod|شامل|مع\s|بالتوصيل|توصيل|سعر))/i);
 if(found)return Math.max(1,Number(found[1]));
 if(index>0&&!allMatches[index-1].length){const q=standaloneQuantity(lines[index-1]);if(q&&!(index>1&&allMatches[index-2].length))return q}
 let end=index+1,colors=colorCount(lines[index]);
 for(;end<lines.length;end++){
  if(allMatches[end].length)break;
  const q=standaloneQuantity(lines[end]);if(q)return q;
  const qMatch=normalize(lines[end]).match(QUANTITY_LABEL)||normalize(lines[end]).match(QUANTITY_UNIT);if(qMatch)return Math.max(1,Number(qMatch[1]));
  if(!STOP_CONTEXT.test(normalize(lines[end])))colors+=colorCount(lines[end]);
 }
 return colors||1;
}

export async function loadInventoryModels(env){
 let rows=[];try{rows=(await env.DB.prepare('SELECT id,model_key,name,aliases_json FROM profit_models WHERE active=1').all()).results||[]}catch{return[]}
 return rows.map(row=>({id:Number(row.id),key:String(row.model_key),name:String(row.name),aliases:parseAliases(row)}));
}

export async function classifyInventoryItems(env,text='',loadedModels=null){
 const models=loadedModels||await loadInventoryModels(env),lines=String(text||'').split(/\n+/).map(saleLine).filter(Boolean),allMatches=lines.map(line=>matchesInLine(models,line)),totals=new Map();
 for(let index=0;index<lines.length;index++)for(const match of allMatches[index]){
  const qty=quantityFor(lines,index,match,allMatches[index],allMatches);
  totals.set(match.model.id,(totals.get(match.model.id)||0)+qty);
 }
 return [...totals].map(([model_id,quantity])=>({model_id,quantity}));
}

// Inventory policy V2: only the first shipping-label print reserves physical stock.
// Existing historical allocations are never migrated or deducted again automatically.
export async function deductOnFirstPrint(env,order,userId=null,loadedModels=null){
 await ensureInventorySchema(env);
 const orderId=Number(order?.id||0);
 if(!orderId||order.first_printed_at)return{changed:false,reason:'already_printed'};
 const existing=(await env.DB.prepare('SELECT model_id,quantity FROM inventory_order_items WHERE order_id=?').bind(orderId).all()).results||[];
 const tracked=await env.DB.prepare('SELECT order_id FROM inventory_order_tracking WHERE order_id=?').bind(orderId).first();
 if(existing.length||tracked)return{changed:false,reason:'historically_allocated'};
 const items=await classifyInventoryItems(env,order.raw_text||order.order_notes||'',loadedModels);
 if(!items.length)return{changed:false,reason:'unrecognized_model'};
 const statements=[env.DB.prepare('INSERT OR IGNORE INTO inventory_order_tracking(order_id) VALUES(?)').bind(orderId)];
 for(const item of items){
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO inventory_balances(model_id,quantity,updated_by) VALUES(?,0,?)').bind(item.model_id,userId));
  statements.push(env.DB.prepare("UPDATE inventory_balances SET quantity=quantity-?,updated_by=?,updated_at=datetime('now') WHERE model_id=?").bind(item.quantity,userId,item.model_id));
  statements.push(env.DB.prepare("INSERT INTO inventory_movements(model_id,order_id,quantity_delta,movement_type,note,created_by) VALUES(?,?,?,'order',?,?)").bind(item.model_id,orderId,-item.quantity,'خصم أول طباعة بوليصة',userId));
  statements.push(env.DB.prepare('INSERT INTO inventory_order_items(order_id,model_id,quantity) VALUES(?,?,?)').bind(orderId,item.model_id,item.quantity));
 }
 await env.DB.batch(statements);
 return{changed:true,items};
}

// Status updates must never restock a cancelled shipment automatically:
// it may still be physically held by the courier. Restocking requires
// a separate confirmed warehouse receipt operation.
export async function syncOrderInventory(env,beforeOrder,afterOrder,userId=null,loadedModels=null){
 return{changed:false,reason:'print_based_inventory'};
}

// ---------------------------------------------------------------- return restock
// Goods come back into stock only when a returns statement is closed (the shipment is
// physically in the warehouse) or a return receipt is confirmed — never from a status change.
// Quantities come from the original deduction (inventory_order_items), minus what the
// customer kept in a partial delivery, minus what was already added back for the order.
export const RESTOCK_TYPES=['cargo_return'];
const FULL_RETURN=new Set(['pending','returned','refused_fee_paid','refused_no_fee','canceled_before_arrival']);
const PARTIAL=new Set(['partial','delivered_adjusted']);

async function receivedByModel(env,order,models){
 const raw=String(order.partial_received_items||'').trim();if(!raw)return null;
 let parsed=null;try{parsed=JSON.parse(raw)}catch{}
 const map=new Map();
 if(Array.isArray(parsed)){
  for(const x of parsed){const id=Number(x.model_id),q=Number(x.received??x.quantity);if(!id||!Number.isFinite(q)||q<0)return null;map.set(id,(map.get(id)||0)+q)}
  return map;
 }
 const items=await classifyInventoryItems(env,raw,models);
 if(!items.length)return null;
 for(const i of items)map.set(i.model_id,(map.get(i.model_id)||0)+i.quantity);
 return map;
}

export async function returnRestockPlan(env,order,loadedModels=null){
 await ensureInventorySchema(env);
 const orderId=Number(order?.id||0),status=order?.delivery_status||'pending';
 const allocated=(await env.DB.prepare('SELECT model_id,quantity FROM inventory_order_items WHERE order_id=?').bind(orderId).all()).results||[];
 const already=new Map(((await env.DB.prepare(`SELECT model_id,SUM(quantity_delta) q FROM inventory_movements WHERE order_id=? AND quantity_delta>0 AND movement_type IN (${RESTOCK_TYPES.map(()=>'?').join(',')}) GROUP BY model_id`).bind(orderId,...RESTOCK_TYPES).all()).results||[]).map(r=>[Number(r.model_id),Number(r.q||0)]));
 const base={order_id:orderId,allocated:allocated.map(a=>({model_id:Number(a.model_id),quantity:Number(a.quantity)})),already:[...already].map(([model_id,quantity])=>({model_id,quantity}))};
 if(!allocated.length)return {...base,ok:false,reason:'لا يوجد خصم مسجل لهذا الطلب عند الطباعة؛ لا تتم إضافة للمخزون',items:[]};
 let expected;
 if(PARTIAL.has(status)){
  const received=await receivedByModel(env,order,loadedModels);
  if(!received)return {...base,ok:false,reason:'تسليم جزئي بدون تفصيل القطع المستلمة؛ يحتاج مراجعة قبل الإضافة للمخزون',items:[]};
  expected=allocated.map(a=>({model_id:Number(a.model_id),quantity:Math.max(0,Number(a.quantity)-(received.get(Number(a.model_id))||0))}));
 }else if(FULL_RETURN.has(status)){
  expected=allocated.map(a=>({model_id:Number(a.model_id),quantity:Number(a.quantity)}));
 }else return {...base,ok:false,reason:'الطلب مسجل كمستلم بالكامل؛ لا يُضاف شيء للمخزون',items:[]};
 const items=expected.map(e=>({model_id:e.model_id,expected:e.quantity,limit:e.quantity,already:already.get(e.model_id)||0,quantity:Math.max(0,e.quantity-(already.get(e.model_id)||0))}));
 const toAdd=items.filter(i=>i.quantity>0);
 return {...base,ok:true,expected:items,items:toAdd,reason:toAdd.length?'':'تمت إضافة هذا المرتجع للمخزون سابقًا'};
}

export function restockStatements(env,orderId,items,userId,note,{sourceRef=null,sourceRefSql=null}={}){
 // Atomic and idempotent: the movement row is inserted only while the total already added
 // back for this order/model stays within the limit (what was deducted / returned), and the
 // balance moves only if that exact movement row exists. Run inside one D1 batch.
 const out=[];
 for(const item of items){
  const ref='ret:'+orderId+':'+item.model_id+':'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now());
  const limit=Number.isFinite(Number(item.limit))?Number(item.limit):Number(item.quantity);
  out.push(env.DB.prepare(`INSERT INTO inventory_movements(model_id,order_id,quantity_delta,movement_type,note,created_by,ref,source_ref)
   SELECT ?,?,?,'cargo_return',?,?,?,${sourceRefSql||'?'}
   WHERE (SELECT COALESCE(SUM(quantity_delta),0) FROM inventory_movements WHERE order_id=? AND model_id=? AND movement_type='cargo_return' AND quantity_delta>0)+?<=?`)
   .bind(...[item.model_id,orderId,item.quantity,note,userId,ref,...(sourceRefSql?[]:[sourceRef]),orderId,item.model_id,item.quantity,limit]));
  out.push(env.DB.prepare('INSERT OR IGNORE INTO inventory_balances(model_id,quantity,updated_by) VALUES(?,0,?)').bind(item.model_id,userId));
  out.push(env.DB.prepare("UPDATE inventory_balances SET quantity=quantity+?,updated_by=?,updated_at=datetime('now') WHERE model_id=? AND EXISTS(SELECT 1 FROM inventory_movements WHERE ref=?)").bind(item.quantity,userId,item.model_id,ref));
 }
 return out;
}
