// T-12 (owner decision 2026-11-24): every OpenAI request is sent with store:false and without personal
// data the task does not need. The existing functions keep working (phones restored locally).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1} from './_d1.mjs';
import {redactForAI,restorePlaceholders,privateAIRequest} from '../functions/api/_ai-privacy.js';
import {onRequest as core} from '../functions/api/[[path]].js';
import {onRequestPost as interpret} from '../functions/api/profit-interpret.js';

const ORDER='الاسم: أم أحمد العلي\nالعنوان: عمان - طبربور قرب مسجد\n0791234567\n+962 78 555 4433\nبنطلون تركي عدد 2\n17 شامل التوصيل\nali@example.com https://x.y/z';

test('redaction: phones, e-mail, links always; labelled name/address lines for product-only tasks',()=>{
 const p=redactForAI(ORDER,{purpose:'products'});
 assert.doesNotMatch(p.text,/0791234567|555|ali@|https?:|أم أحمد|طبربور/);
 assert.match(p.text,/بنطلون تركي عدد 2/);assert.match(p.text,/17 شامل التوصيل/);
 const o=redactForAI(ORDER,{purpose:'order'});
 assert.doesNotMatch(o.text,/0791234567|555 4433|ali@/);assert.match(o.text,/أم أحمد/,'name kept: the order parser extracts it');
 assert.deepEqual(o.phones,['0791234567','+962785554433']);
 assert.deepEqual(restorePlaceholders({phone:'[هاتف1]',notes:['اتصل [هاتف2]']},o.phones),{phone:'0791234567',notes:['اتصل +962785554433']});
 assert.equal(redactForAI('بنطلون تركي عدد 2 السعر 17').text,'بنطلون تركي عدد 2 السعر 17','product text unchanged');
 assert.equal(privateAIRequest({model:'m'}).store,false);
});

function db(){
 const {db,env}=createD1();
 db.exec(`INSERT INTO users(id,username,display_name,password_hash,role) VALUES(1,'admin','M','x','admin');
  INSERT INTO sessions(token,user_id,expires_at) VALUES('t',1,datetime('now','+1 day'));`);
 return {db,env};
}
function mockOpenAI(reply){
 const sent=[];const real=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{sent.push({url:String(url),body:JSON.parse(opts.body)});return new Response(JSON.stringify({output_text:JSON.stringify(reply),model:'test'}),{status:200})};
 return {sent,restore:()=>{globalThis.fetch=real}};
}

test('/ai-parse-order: store:false, no phone sent, phone restored and normalised in the result',async()=>{
 const {env}=db();env.OPENAI_API_KEY='k';
 const m=mockOpenAI({recipient_name:'أم أحمد العلي',phone:'[هاتف2]',governorate:'عمان',detailed_address:'طبربور',amount:17,notes:'',items:[],cost_of_goods:0,confidence:0.9});
 try{
  const r=await core({env,params:{path:['ai-parse-order']},request:new Request('https://x/api/ai-parse-order',{method:'POST',headers:{authorization:'Bearer t','content-type':'application/json'},body:JSON.stringify({text:ORDER})})});
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
  assert.equal(m.sent.length,1);assert.equal(m.sent[0].body.store,false);
  assert.doesNotMatch(m.sent[0].body.input,/0791234567|555|ali@example/);
  assert.equal(body.parsed.phone,'0785554433');assert.equal(body.parsed.recipient_name,'أم أحمد العلي');
 }finally{m.restore()}
});

test('profit-interpret: store:false, only goods text sent (no phone, name or address lines)',async()=>{
 const {db:d,env}=db();env.OPENAI_API_KEY='k';
 d.prepare("INSERT INTO profit_models(model_key,name,cost,aliases_json,offers_json,delivery_included,active) VALUES('turkish','بنطلون تركي',2.7,'[]','{}',0,1)").run();
 const m=mockOpenAI({items:[{model_key:'turkish',quantity:2,evidence:'بنطلون تركي عدد 2',confidence:0.95}],unresolved_models:[]});
 try{
  const r=await interpret({env,request:new Request('https://x/api/profit-interpret',{method:'POST',headers:{authorization:'Bearer t','content-type':'application/json'},body:JSON.stringify({scope:'profits',text:ORDER})})});
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
  assert.equal(m.sent[0].body.store,false);
  assert.doesNotMatch(m.sent[0].body.input,/0791234567|555|أم أحمد|طبربور|ali@/);
  assert.match(m.sent[0].body.input,/بنطلون تركي عدد 2/);
  assert.equal(body.result.items[0].qty,2);
 }finally{m.restore()}
});

test('guard: every file that calls OpenAI uses privateAIRequest and redactForAI',async()=>{
 const {readdirSync,readFileSync,statSync}=await import('node:fs');const {join}=await import('node:path');
 const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p):p.endsWith('.js')?[p]:[]});
 const files=[...walk('functions'),...walk('public')].filter(f=>readFileSync(f,'utf8').includes('api.openai.com'));
 assert.ok(files.length>=3,files.join());
 for(const f of files){const s=readFileSync(f,'utf8');assert.match(s,/privateAIRequest\(/,f);assert.match(s,/redactForAI\(/,f)}
});
