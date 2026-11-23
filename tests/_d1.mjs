// Minimal Cloudflare D1 shim on node:sqlite for endpoint tests.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const conv=v=>v===undefined?null:typeof v==='boolean'?(v?1:0):v;
export function createD1(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 class Stmt{constructor(sql,args=[]){this.sql=sql;this.args=args}
  bind(...a){return new Stmt(this.sql,a.map(conv))}
  async first(col){const r=db.prepare(this.sql).get(...this.args);if(!r)return null;return col?r[col]:{...r}}
  async all(){return {results:db.prepare(this.sql).all(...this.args).map(r=>({...r}))}}
  async run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}}}
  sync(){const st=db.prepare(this.sql);if(st.columns().length)return {results:st.all(...this.args)};const r=st.run(...this.args);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}}}
 }
 return {db,env:{DB:{prepare:sql=>new Stmt(sql),batch:async list=>{db.exec('BEGIN');try{const out=list.map(s=>s.sync());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}}};
}
