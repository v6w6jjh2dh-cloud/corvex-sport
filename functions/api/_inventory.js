const STOCK_STATUSES=new Set(['delivered','delivered_adjusted','partial']);

const normalizeDigits=value=>String(value||'')
 .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
 .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

const normalize=value=>normalizeDigits(value).toLowerCase()
 .replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه')
 .replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();

const COLORS=new Set(['اسود','ابيض','بني','زيتي','سكني','رمادي','سماوي','ازرق','كحلي','برتقالي','احمر','اخضر','بيج','رصاصي','نهدي','زهري','وردي','موف','بنفسجي']);
const STOP_CONTEXT=/(?:وزن|كيلو|كغم|كغ|kg|مقاس|قياس|طول|تواصل|توصيل|شامل|السعر|سعر|دينار|هاتف|تلفون|موبايل|رقم|عنوان|ملاحظه|موعد|بعد|يوم|ايام|استرجاع|ارجاع|مرتجع|استبدال|تبديل|بدل)/i;
const OPERATION_CONTEXT=/(?:^|\s)و?(?:استرجاع|ارجاع|مرتجع|استبدال|تبديل|بدل)(?=\s|$)/i;
const QUANTITY_LABEL=/(?:عدد|العدد|كميه|الكميه|تفصيل)\s*[:=\-]?\s*(\d{1,3})(?=\s|$)/i;
const QUANTITY_UNIT=/(?:^|\s)(\d{1,3})\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)(?=\s|$)/i;
const COLOR_QUANTITY=/(?:^|\s)(\d{1,3})\s*(?:اسود|ابيض|بني|زيتي|سكني|رمادي|سماوي|ازرق|كحلي|برتقالي|احمر|اخضر|بيج|رصاصي|نهدي|زهري|وردي|موف|بنفسجي)(?=\s|$)/gi;
const WORD_NUMBERS={واحد:1,واحده:1,اثنين:2,اتنين:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10};

let schemaPromise=null;
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
 })();
 try{return await schemaPromise}catch(error){schemaPromise=null;throw error}
}

function parseAliases(row){
 let aliases=[];try{aliases=JSON.parse(row.aliases_json||'[]')}catch{}
 return [...new Set([row.name,...aliases].map(normalize).filter(x=>x.length>1))].sort((a,b)=>b.length-a.length);
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
  for(const alias of model.aliases){const index=boundaryMatch(value,alias);if(index!==-1&&(!best||alias.length>best.length))best={model,index,length:alias.length}}
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
 found=after.match(QUANTITY_LABEL)||after.match(QUANTITY_UNIT)||after.match(/^\s*(?:[+،,:=\-]\s*)?(\d{1,3})(?=\s|$)/);
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

async function desiredItems(env,order,models){
 const status=String(order?.delivery_status||'pending');
 if(status==='delivered')return classifyInventoryItems(env,order.raw_text||order.order_notes||'',models);
 if(status!=='partial'&&status!=='delivered_adjusted')return[];
 let items=await classifyInventoryItems(env,order.partial_received_items||'',models);
 if(items.length)return items;
 const deliveredPieces=Math.max(0,Number(order.delivered_pieces||0));if(!deliveredPieces)return[];
 const full=await classifyInventoryItems(env,order.raw_text||order.order_notes||'',models);let left=deliveredPieces;items=[];
 for(const item of full){const quantity=Math.min(left,item.quantity);if(quantity>0)items.push({...item,quantity});left-=quantity;if(left<=0)break}
 return items;
}

export async function syncOrderInventory(env,beforeOrder,afterOrder,userId=null,loadedModels=null){
 await ensureInventorySchema(env);
 const orderId=Number(afterOrder?.id||beforeOrder?.id||0);if(!orderId)return{changed:false,items:[]};
  const existingRows=(await env.DB.prepare('SELECT model_id,quantity FROM inventory_order_items WHERE order_id=?').bind(orderId).all()).results||[];
  const existing=new Map(existingRows.map(row=>[Number(row.model_id),Number(row.quantity||0)]));
  const beforeStock=STOCK_STATUSES.has(String(beforeOrder?.delivery_status||'pending')),afterStock=STOCK_STATUSES.has(String(afterOrder?.delivery_status||'pending'));
 const tracked=await env.DB.prepare('SELECT order_id FROM inventory_order_tracking WHERE order_id=?').bind(orderId).first();
  // A delivered order that predates inventory has no allocation. Editing it must never create a surprise deduction.
 if(beforeStock&&afterStock&&!existing.size&&!tracked)return{changed:false,legacy:true,items:[]};
 if(!beforeStock&&afterStock&&!tracked)await env.DB.prepare('INSERT OR IGNORE INTO inventory_order_tracking(order_id) VALUES(?)').bind(orderId).run();
 let wanted=[];
 if(afterStock)wanted=await desiredItems(env,afterOrder,loadedModels);
 const desired=new Map(wanted.map(item=>[Number(item.model_id),Number(item.quantity||0)]));
 const modelIds=[...new Set([...existing.keys(),...desired.keys()])],statements=[],changes=[];
 for(const modelId of modelIds){
  const oldQty=existing.get(modelId)||0,newQty=desired.get(modelId)||0,allocationDelta=newQty-oldQty;
  if(!allocationDelta)continue;
  const stockDelta=-allocationDelta;
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO inventory_balances(model_id,quantity,updated_by) VALUES(?,0,?)').bind(modelId,userId));
  statements.push(env.DB.prepare("UPDATE inventory_balances SET quantity=quantity+?,updated_by=?,updated_at=datetime('now') WHERE model_id=?").bind(stockDelta,userId,modelId));
  statements.push(env.DB.prepare("INSERT INTO inventory_movements(model_id,order_id,quantity_delta,movement_type,note,created_by) VALUES(?,?,?,'order',?,?)").bind(modelId,orderId,stockDelta,stockDelta<0?'خصم تسليم طلب':'إرجاع كمية طلب',userId));
  if(newQty>0)statements.push(env.DB.prepare("INSERT INTO inventory_order_items(order_id,model_id,quantity) VALUES(?,?,?) ON CONFLICT(order_id,model_id) DO UPDATE SET quantity=excluded.quantity,updated_at=datetime('now')").bind(orderId,modelId,newQty));
  else statements.push(env.DB.prepare('DELETE FROM inventory_order_items WHERE order_id=? AND model_id=?').bind(orderId,modelId));
  changes.push({model_id:modelId,quantity_delta:stockDelta});
 }
 if(statements.length)for(let i=0;i<statements.length;i+=40)await env.DB.batch(statements.slice(i,i+40));
 return{changed:changes.length>0,items:changes};
}
