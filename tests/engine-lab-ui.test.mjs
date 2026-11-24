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
 for(const c of calls){assert.match(c,/^[`']\/product-engine\?view=/,c);assert.doesNotMatch(c,/method|POST|token/i,c)}
 assert.doesNotMatch(src,/fetch\(|localStorage|state\.token|\?token=/,'no own fetch / token handling');
 for(const v of ['compare','unknown','knowledge','lexicon'])assert.match(src,new RegExp('view='+v));
 assert.match(src,/window\.editOrder\(Number\(b\.dataset\.order\)\)/,'order number opens the original order');
});
