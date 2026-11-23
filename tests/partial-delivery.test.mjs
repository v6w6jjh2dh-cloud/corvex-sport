import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedCost,pricePartialDelivery,shipmentDateFit,statementCodes,normalizePhone} from '../functions/api/_partial-delivery.js';

test('approved per-piece costs',()=>{
 assert.equal(approvedCost({name:'جاكيت فرو'}),4);
 assert.equal(approvedCost({name:'جاكيت جوخ كاجوال'}),5.2);
 assert.equal(approvedCost({model_key:'jokh_scarfo',name:'جاكيت جوخ سكايفو'}),7.55);
 assert.equal(approvedCost({name:'جاكيت جوخ سكارفو'}),7.55);
 assert.equal(approvedCost({name:'مالئ الفراغات'}),1);
 assert.equal(approvedCost({name:'سي إيبوكسي'}),1);
 assert.equal(approvedCost({name:'أيوبكسي'}),1);
 assert.equal(approvedCost({name:'بنطلون تركي'}),null);
});

test('partial delivery: cost of received pieces only',()=>{
 const shipped=[{model_id:1,model_name:'جاكيت فرو',quantity:2,unit_cost:4},{model_id:2,model_name:'جاكيت جوخ سكايفو',quantity:1,unit_cost:7.55}];
 const ok=pricePartialDelivery(shipped,[{model_id:1,received:2,returned:0},{model_id:2,received:0,returned:1}]);
 assert.equal(ok.ok,true);assert.equal(ok.cost,8);assert.equal(ok.received,2);assert.equal(ok.returned,1);
 assert.equal(pricePartialDelivery(shipped,[{model_id:1,received:2,returned:1},{model_id:2,received:0,returned:1}]).ok,false);
 assert.equal(pricePartialDelivery(shipped,[{model_id:1,received:2,returned:0}]).ok,false);
 assert.equal(pricePartialDelivery(shipped,[{model_id:1,received:2,returned:0},{model_id:2,received:1,returned:0}]).ok,false);
 assert.equal(pricePartialDelivery([], []).ok,false);
});

test('shipment date window rejects older shipments to the same phone',()=>{
 assert.equal(shipmentDateFit({first_print_date:'2026-11-21',delivery_date:'2026-11-22'},'2026-11-22').ok,true);
 assert.equal(shipmentDateFit({first_print_date:'2026-11-17',delivery_date:'2026-11-18'},'2026-11-22').ok,false);
 assert.equal(shipmentDateFit({first_print_date:'2026-11-21'},'').known,false);
});

test('codes and phones',()=>{
 assert.deepEqual(statementCodes({shipment_code:'ORD-10611'}),['10611']);
 assert.ok(statementCodes({note:'رقم الطلب: 10611'}).includes('10611'));
 assert.equal(normalizePhone('+962 79 090 9797'),'0790909797');
 assert.equal(normalizePhone('٠٧٩٠٩٠٩٧٩٧'),'0790909797');
});

test('stati spellings are the scarfo model at 7.55',async()=>{
 const {canonicalModelName}=await import('../functions/api/_partial-delivery.js');
 for(const t of ['جاكيت جوخ ستاتي','جاكيت جوخ ستأتي','جوخ ستائتي','جاكيت ستاتيه']){assert.equal(approvedCost({name:t}),7.55);assert.equal(canonicalModelName(t),'جاكيت جوخ سكايفو')}
 assert.equal(approvedCost({name:'جاكيت جوخ كاجوال'}),5.2);
});
