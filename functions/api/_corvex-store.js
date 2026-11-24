// The Corvex store (owner rule: smart-engine features are for Corvex only). Found by name, never hard-coded id.
export async function corvexStore(env){
 const rows=(await env.DB.prepare('SELECT id,name FROM stores ORDER BY id').all()).results||[];
 return rows.find(s=>/corvex|كورفكس/i.test(String(s.name||'')))||null;
}
