#!/usr/bin/env node
// Project guard (runs in CI and locally): `node scripts/check-project.mjs [base-ref]`
//  1. every JavaScript file of the Cloudflare Functions and of public/ parses (node --check);
//  2. every script referenced by public/index.html exists, carries a ?v= cache-busting version
//     and is referenced only once;
//  3. cache busting: a public script that changed since <base-ref> must also have a new ?v= in
//     index.html (otherwise phones keep the old cached file — see REGRESSION_TESTS.md R-CACHE-1).
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';

const root=new URL('..',import.meta.url).pathname;
const fail=[];
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?(n==='node_modules'?[]:walk(p)):[p]});

// 1. syntax
const files=[...walk(join(root,'functions')),...walk(join(root,'public')),...walk(join(root,'scripts'))].filter(f=>/\.(m?js)$/.test(f));
for(const f of files){
 try{execFileSync(process.execPath,['--check',f],{stdio:'pipe'})}
 catch(e){fail.push(`syntax: ${relative(root,f)}\n${String(e.stderr||e.message).split('\n').slice(0,4).join('\n')}`)}
}

// 2. index.html references
const index=readFileSync(join(root,'public/index.html'),'utf8');
const refs=[...index.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="\/([^"?#]+)(\?v=([^"]*))?"/g)].map(m=>({file:m[1],version:m[3]||''}));
const seen=new Set();
for(const r of refs){
 if(!existsSync(join(root,'public',r.file)))fail.push(`index.html references a missing file: ${r.file}`);
 if(/\.(js|css)$/.test(r.file)&&!r.version)fail.push(`index.html: ${r.file} has no ?v= cache-busting version`);
 if(seen.has(r.file))fail.push(`index.html references ${r.file} twice`);
 seen.add(r.file);
}

// 3. cache busting against a base revision
const base=process.argv[2]||process.env.BASE_REF||'';
if(base&&!/^0+$/.test(base)){
 let changed=[],oldIndex='';
 try{
  changed=execFileSync('git',['diff','--name-only',base,'HEAD','--','public'],{cwd:root}).toString().trim().split('\n').filter(Boolean);
  oldIndex=execFileSync('git',['show',`${base}:public/index.html`],{cwd:root}).toString();
 }catch(e){console.log(`(cache-busting check skipped: base ${base} not available)`)}
 const ver=(html,file)=>(html.match(new RegExp(`/${file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\?v=([^"]*)"`))||[])[1]||null;
 for(const f of changed){
  const file=f.replace(/^public\//,'');
  if(!seen.has(file))continue; // not loaded by index.html
  const before=ver(oldIndex,file),after=ver(index,file);
  if(before!==null&&before===after)fail.push(`cache busting: public/${file} changed but its ?v= in index.html is still "${after}" — bump it`);
 }
}

if(fail.length){console.error('✗ project check failed:\n- '+fail.join('\n- '));process.exit(1)}
console.log(`✓ project check: ${files.length} JS files parse, ${refs.length} index.html assets verified${base?`, cache busting vs ${base.slice(0,7)}`:''}`);
