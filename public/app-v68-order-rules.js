(()=>{
  const previousApi=api;
  function qtyForLycra(text=''){
    const s=String(text||'').replace(/[٠١٢٣٤٥٦٧٨٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const m=s.match(/(?:بلوز[هة]|بلوزه)\s*ليكرا[^\n]{0,35}?(?:عدد|العدد|كمية|كميه)?\s*[:=]?\s*(\d+)/i)
      ||s.match(/(\d+)\s*(?:قطعة|قطع|حبة|حبات)?\s*(?:بلوز[هة]|بلوزه)\s*ليكرا/i);
    if(m&&Number(m[1])>0)return Number(m[1]);
    if(/(?:بلوز[هة]|بلوزه)\s*ليكرا[^\n]{0,35}(?:ثلاث[هة]?\s*الوان|3\s*الوان|العرض)/i.test(s))return 3;
    if(/(?:بلوز[هة]|بلوزه)\s*ليكرا[^\n]{0,35}لونين/i.test(s))return 2;
    return 1;
  }
  api=async function(path,opts={}){
    const result=await previousApi(path,opts);
    if(path==='/ai-parse-order'&&String(opts.method||'GET').toUpperCase()==='POST'&&result?.parsed){
      let text='';try{text=JSON.parse(opts.body||'{}').text||''}catch{}
      if(/(?:بلوز[هة]|بلوزه)\s*ليكرا/i.test(text)){
        const qty=qtyForLycra(text),unit=2.5;
        const items=Array.isArray(result.parsed.items)?result.parsed.items:[];
        const idx=items.findIndex(x=>/(?:بلوز[هة]|بلوزه)\s*ليكرا/i.test(String(x.name||'')));
        if(idx>=0)items[idx]={...items[idx],name:'بلوزة ليكرا',quantity:qty,unit_cost:unit,total_cost:qty*unit};
        else items.push({name:'بلوزة ليكرا',quantity:qty,unit_cost:unit,total_cost:qty*unit});
        result.parsed.items=items;
        result.parsed.cost_of_goods=items.reduce((s,x)=>s+Math.max(0,Number(x.total_cost||0)),0);
      }
    }
    return result;
  };
})();
