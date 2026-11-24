// Delivery statement PDF reader: rows come from the phone column only (statement 4292, row 5
// BS05AUTOOUT has its phone repeated in the notes) and are checked against the statement head.
// Fixture = text items extracted by pdf.js from tests/fixtures/stmt-4292-synthetic.pdf, a
// rebuilt copy of the layout (the real PDF is not in the repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../public/delivery-pdf-rows.js');
const pages=()=>JSON.parse(readFileSync(new URL('./fixtures/delivery-4292-synthetic.items.json',import.meta.url),'utf8'));

test('statement 4292: 29 shipments, 312 / 55 / 257, matches its head',()=>{
 const st=P.parseStatement(pages());
 assert.deepEqual(st.extracted,{count:29,price:312,fee:55,cash:257});
 assert.deepEqual(st.header,{count:29,total:312,fee:55,net:257});
 assert.equal(P.checkTotals(st.extracted,st.header).ok,true);
});

test('phone repeated inside the notes of BS05AUTOOUT is not a shipment row',()=>{
 const st=P.parseStatement(pages());
 assert.equal(st.rows.filter(r=>r.phone==='0778593270').length,1);
 const r5=st.rows[4];
 assert.equal(r5.phone,'0778593270');assert.equal(r5.shipment_date,'2026-11-22');assert.ok(r5.price>0);
 assert.ok(st.ignored.some(x=>x.text==='0778593270'));
 assert.ok(st.rows.every(r=>r.shipment_date),'no row without a date');
});

test('two real shipments to the same phone are both kept',()=>{
 const st=P.parseStatement(pages());
 assert.equal(st.rows.filter(r=>r.phone==='0795550001').length,2);
});

test('phone inside a sentence never creates a row',()=>{
 const st=P.parseStatement(pages());
 assert.ok(!st.rows.some(r=>r.phone==='0791112223'));
});

test('head mismatch blocks: extracted totals differing from the head are not ok',()=>{
 const st=P.parseStatement(pages());
 const bad=P.checkTotals({...st.extracted,count:30},st.header);
 assert.equal(bad.ok,false);
 assert.equal(bad.checks.find(c=>c.key==='count').ok,false);
 assert.equal(P.checkTotals(st.extracted,null).ok,false,'no head read -> manual confirmation required');
});

test('a second phone stacked in the phone cell (no date, no money) is not a shipment',()=>{
 const pg=pages();const p1=pg[0];
 const first=p1.items.find(i=>i.text==='0778593270'&&i.x/p1.width>.7);
 p1.items.push({text:'0799990000',x:first.x,y:first.y-9});
 const st=P.parseStatement(pg);
 assert.equal(st.extracted.count,29);
 assert.ok(st.ignored.some(x=>x.text==='0799990000'));
 assert.equal(st.rows[4].note,'0778593270','real row keeps its note');
});
