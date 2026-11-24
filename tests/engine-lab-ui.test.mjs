// «مختبر المحرك الذكي»: admin-only, uses the app's existing authentication, read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../public/app-v117-engine-lab.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('engine lab page: loaded, admin-only, existing auth, read-only (no POST, no token in URLs)',()=>{
 assert.match(html,/app-v117-engine-lab\.js\?v=/);
 assert.match(src,/const isAdmin=\(\)=>S\(\)\.user\?\.role==='admin'/);
 assert.match(src,/function nav\(\)\{\s*if\(!isAdmin\(\)\)return;/);
 assert.match(src,/async function view\(\)\{\s*if\(!isAdmin\(\)\)return;/);
 const calls=[...src.matchAll(/window\.api\(([^;]*?)\)/g)].map(m=>m[1]);
 assert.ok(calls.length>=4);
 for(const c of calls){assert.match(c,/^[`'](?:\/product-engine\?view=|\/order-drafts['`]$)/,c);assert.doesNotMatch(c,/method|POST|token/i,c)}
 assert.doesNotMatch(src,/localStorage|state\.token|\?token=/,'no token handling');
 assert.deepEqual([...src.matchAll(/fetch\(([^,)]*)/g)].map(m=>m[1]),["'/index.html'"],'only the public page is fetched directly (update check)');
 for(const v of ['compare','unknown','knowledge','lexicon'])assert.match(src,new RegExp('view='+v));
 assert.match(src,/window\.editOrder\(Number\(b\.dataset\.order\)\)/,'order number opens the original order');
});

test('employee guard: only the new-order form, only when no product name; never blocks on a failed check',()=>{
 const g=readFileSync(new URL('../public/app-v118-order-product-guard.js',import.meta.url),'utf8');
 assert.match(html,/app-v118-order-product-guard\.js\?v=/);
 assert.match(g,/if\(!fromNewOrderForm\(body\)\)return previousApi\(path,opts\)/);
 assert.match(g,/check\.status!=='missing_product'\)return send\(opts\)/);
 assert.match(g,/catch\{check=null\}/,'a failed check never blocks saving');
 assert.doesNotMatch(g,/localStorage|state\.token/);
});

// Production bug 2026-11-24: 17–21 Nov showed «334 checked of 184» and order #10415 of 22 Nov. Cause: the page
// merged a late answer of the previous scan (default range 22–24) and repeated batches into the new scan.
import vm from 'node:vm';
function loadScan(){
 const stub={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,documentElement:{},addEventListener(){}};
 const ctx={console,document:stub,MutationObserver:class{observe(){}},state:{user:{role:'admin'}}};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.__engineLabScan;
}
const batch=(from,to,ids,total,next=null,extra={})=>({from,to,total,batch:{next_cursor:next},
 checked:ids.map(id=>({id,flags:id%10===0?['central_unrecognised']:[]})),
 rows:ids.filter(id=>id%10===0).map(id=>({id})),completeness:{known:{orders:ids.filter(id=>id%10).map(id=>({id}))},missing:{orders:ids.filter(id=>!(id%10)).map(id=>({id}))}},...extra});

test('scan accuracy: new scan resets, late answers of an old scan or another range are ignored, an order is counted once',()=>{
 const Scan=loadScan();
 const old=Scan.start('compare','2026-11-22','2026-11-24');          // default range, answer still pending
 const s=Scan.start('compare','2026-11-17','2026-11-21');            // the user changes the range and scans again
 assert.equal(Scan.accept(old,batch('2026-11-22','2026-11-24',[10415,10416],2)),false,'late answer of the old scan');
 assert.equal(Scan.checked(s),0);
 const ids=Array.from({length:184},(_,i)=>i+1);
 assert.equal(Scan.accept(s,batch('2026-11-17','2026-11-21',ids.slice(0,150),184,150)),true);
 assert.equal(Scan.accept(s,batch('2026-11-17','2026-11-21',ids.slice(0,150),184,150)),true,'same batch twice (double tap)');
 assert.equal(Scan.checked(s),150,'not 300');
 assert.equal(Scan.accept(s,batch('2026-11-22','2026-11-24',[10415],1)),false,'another range never merges');
 Scan.accept(s,batch('2026-11-17','2026-11-21',ids.slice(140),184,null));  // overlapping last batch
 assert.equal(Scan.checked(s),184);assert.equal(s.total,184);assert.equal(s.next,null);
 assert.ok(Scan.checked(s)<=s.total,'checked never exceeds the total');
 assert.equal(Scan.counts(s).central_unrecognised,18,'counters rebuilt per order id');
 assert.equal(s.classes.known.size+s.classes.missing.size,184);assert.ok(!s.rows.has(10415)&&!s.classes.known.has(10415),'no order of another period');
 // starting again from scratch clears everything
 const again=Scan.start('compare','2026-11-17','2026-11-21');assert.equal(Scan.checked(again),0);assert.equal(Scan.accept(s,batch('2026-11-17','2026-11-21',[1],184)),false,'the previous scan is dead');
 // unknown tab: groups count distinct orders across overlapping batches
 const u=Scan.start('unknown','2026-11-17','2026-11-21');
 const g={from:'2026-11-17',to:'2026-11-21',total:3,batch:{next_cursor:2},checked_ids:[3,2],products:[{key:'بيسك',label:'بيسك',order_ids:[3,2],variants:[{phrase:'بيسك',n:2}],examples:[]}]};
 Scan.accept(u,g);Scan.accept(u,g);Scan.accept(u,{...g,batch:{next_cursor:null},checked_ids:[2,1],products:[{key:'بيسك',label:'بيسك',order_ids:[2,1],variants:[{phrase:'بيسك',n:2}],examples:[]}]});
 assert.equal(Scan.checked(u),3);assert.equal(u.groups.products.get('بيسك').orders.size,3);
});

test('the five completeness classes are rendered, and stale pages are offered a reload',()=>{
 for(const k of ['known','missing','learn','failure','unclear'])assert.match(src,new RegExp(`'${k}'`));
 assert.match(src,/\['known','missing','learn','failure','unclear'\]\.map\(card\)/);
 assert.match(src,/function checkFresh\(\)/);
});
