// Before a NEW manual order is saved (owner request 2026-11-24): is a product named in the order?
// Read-only. Any signed-in active user. Corvex store only (other stores → not_applicable).
// Uses the central engine (shadow) only to DETECT a missing product name — it never picks a product,
// never changes the order, the cost, the profit or the stock.
//  POST {store_id, order_notes, raw_text, product_ref?}
//   → {status:'known'|'new_name'|'missing_product'|'not_applicable', products:[names], names:[new phrases], catalogue:[{ref,name}]}
//  A valid product_ref (e.g. a landing-page order carrying a product id) counts as known — no typing needed.
import {json,auth} from './_partial-delivery.js';
import {corvexStore} from './_corvex-store.js';
import {loadCatalogue,resolveOrderItems,productRef} from './_product-engine.js';
import {analyzeOrder} from './_order-language.js';

export async function onRequestPost({request,env}){
 const me=await auth(request,env);if(!me)return json({error:'غير مصرح'},401);
 const b=await request.json().catch(()=>({}));
 const store=await corvexStore(env);
 if(!store||Number(b.store_id)!==Number(store.id))return json({status:'not_applicable'});
 const cat=await loadCatalogue(env,{storeId:store.id});
 // only products of the active catalogue (read by the stock and profit engines today)
 const catalogue=cat.primaryModels.filter(m=>Number(m.id)>0).map(m=>({ref:productRef(m),name:m.name}));
 if(b.product_ref&&catalogue.some(p=>p.ref===String(b.product_ref)))return json({status:'known',by:'product_ref',products:[catalogue.find(p=>p.ref===String(b.product_ref)).name]});
 const o={order_notes:String(b.order_notes||'').slice(0,4000),raw_text:String(b.raw_text||'').slice(0,8000)};
 const read=await resolveOrderItems(env,o,cat),a=analyzeOrder(o,cat.models,cat.lexicon);
 if(read.items.length)return json({status:'known',products:read.items.map(i=>i.name)});
 // a name is written but not known yet (new product / new spelling): never block the employee
 if(a.candidates.length)return json({status:'new_name',names:a.candidates.map(c=>c.phrase)});
 // T-11: a known name in an uncertain context still counts as written (no extra step for the employee)
 if((read.uncertain||[]).length)return json({status:'known',products:[],uncertain:true});
 return json({status:'missing_product',catalogue:catalogue.sort((x,y)=>x.name.localeCompare(y.name,'ar'))});
}
