export function normalizedSettlementDate(value=''){
  const date=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date?'':date;
}

export function dominantSettlementDate(rows=[]){
  const counts=new Map();
  for(const row of rows){
    const date=normalizedSettlementDate(row?.shipment_date||row?.raw_date||'');
    if(date)counts.set(date,(counts.get(date)||0)+1);
  }
  return [...counts.entries()]
    .sort((a,b)=>b[1]-a[1]||b[0].localeCompare(a[0]))[0]?.[0]||'';
}

let settlementDateReadyPromise=null;
export async function ensureSettlementDateColumn(env){
  if(!settlementDateReadyPromise){
    settlementDateReadyPromise=(async()=>{
      const info=await env.DB.prepare('PRAGMA table_info(delivery_company_settlements)').all();
      const columns=new Set((info.results||[]).map(row=>row.name));
      if(columns.has('statement_date'))return;
      try{
        await env.DB.prepare('ALTER TABLE delivery_company_settlements ADD COLUMN statement_date TEXT').run();
      }catch(error){
        if(!/duplicate column name/i.test(String(error?.message||error)))throw error;
      }
    })();
  }
  try{
    await settlementDateReadyPromise;
  }catch(error){
    settlementDateReadyPromise=null;
    throw error;
  }
}
