(()=>{
  const COLORS=[
    /(?:^|\s|و)(?:اسود|أسود|سود)(?=\s|$)/i,/\bبني\b/i,/\bبيج\b/i,/(?:ابيض|أبيض)/i,/\bسكني\b/i,/\bرصاصي\b/i,/\bكحلي\b/i,/\bزيتي\b/i,/\bخمري\b/i,/(?:احمر|أحمر)/i,/(?:ازرق|أزرق)/i,/(?:اخضر|أخضر)/i,/\bرمادي\b/i,/\bسكري\b/i,/\bنهدي\b/i,/\bموف\b/i,/\bكريمي\b/i
  ];
  const WORD_NUM={واحد:1,واحده:1,واحدة:1,وحده:1,وحدة:1,اثنين:2,اتنين:2,ثنتين:2,اثنان:2,ثلاث:3,ثلاثه:3,ثلاثة:3,اربعه:4,اربعة:4,أربعة:4,خمس:5,خمسه:5,خمسة:5,سته:6,ستة:6};
  function digits(v=''){return String(v).replace(/[٠١٢٣٤٥٦٧٨٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))}
  function wordNumber(v=''){const x=digits(v).trim();return /^\d+$/.test(x)?Number(x):(WORD_NUM[x]||0)}
  function pieceCount(text=''){
    const s=digits(String(text||'')).replace(/\r/g,'\n');
    const explicit=[];
    const re=/(?:عدد|العدد|كمية|كميه)\s*[:=\-]?\s*(\d+|واحده?|واحدة|وحده|وحدة|اثنين|اتنين|ثنتين|اثنان|ثلاث(?:ه|ة)?|ارب(?:ع|عه|عة)|أربعة|خمس(?:ه|ة)?|ست(?:ه|ة)?)/gi;
    let m;while((m=re.exec(s))){const q=wordNumber(m[1]);if(q>0&&q<=50)explicit.push(q)}
    if(explicit.length)return explicit.reduce((a,b)=>a+b,0);
    const pieces=[];const pr=/(\d+)\s*(?:قطعة|قطعه|قطع|حبة|حبه|حبات)\b/gi;while((m=pr.exec(s))){const q=Number(m[1]);if(q>0&&q<=50)pieces.push(q)}
    if(pieces.length)return pieces.reduce((a,b)=>a+b,0);
    if(/(?:ثلاث(?:ه|ة)?|3)\s*(?:ال)?وان|ثلاثة\s*ألوان/i.test(s))return 3;
    if(/لونين|لونان|2\s*(?:ال)?وان/i.test(s))return 2;
    if(/\bالعرض\b/i.test(s))return 3;
    const found=COLORS.filter(r=>r.test(s)).length;
    if(found>0)return found;
    if(/(?:^|\s)لون(?:\s|$)/i.test(s))return 1;
    return 1;
  }
  function noteColumns(text=''){
    let lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length)return {count:1,html:''};
    const count=Math.min(3,lines.length);
    const cols=Array.from({length:count},()=>[]);
    lines.forEach((line,i)=>cols[i%count].push(line));
    return {count,html:cols.map(c=>`<div class="note-column">${c.map(x=>`<div class="note-line">${esc(x)}</div>`).join('')}</div>`).join('')};
  }
  function label(o){
    const notes=noteColumns(o.order_notes||'');
    return `<div class="label"><div class="direct-mark">مباشر</div><div class="label-head"><span class="label-code">D-${o.direct_code}</span><b class="label-brand">CORVEX SPORT</b><span class="label-barcode">${typeof code128Svg==='function'?code128Svg(`D-${o.direct_code}`):''}</span></div><div class="label-store">اسم المتجر: ${esc(o.store_name||'—')}</div><div class="recipient-date-row"><div><strong>المستلم:</strong> ${esc(o.recipient_name||'')}</div><strong class="delivery-date">${typeof nextDeliveryDateLabel==='function'?nextDeliveryDateLabel():new Date().toISOString().slice(0,10)}</strong></div><div><strong>الهاتف:</strong> ${esc(o.phone||'')}</div><div><strong>العنوان:</strong> ${esc(o.area||'')} ${esc(o.detailed_address||'')}</div><div><strong>القيمة:</strong> ${money(o.amount)} د.أ</div><div class="note" style="--note-cols:${notes.count}">${notes.html}</div></div>`;
  }
  async function printRows(rows){
    rows=(rows||[]).filter(Boolean);if(!rows.length)return toast('لا يوجد طلب للطباعة');
    try{await api('/direct-orders?action=print',{method:'POST',body:JSON.stringify({ids:rows.map(x=>x.id)})})}catch{}
    const w=window.open('','_blank');if(!w)return toast('اسمح بالنوافذ المنبثقة');
    const pages=[];for(let i=0;i<rows.length;i+=8)pages.push(rows.slice(i,i+8));
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>طباعة مباشر</title><style>@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif}.page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:3mm;page-break-after:always}.page:last-child{page-break-after:auto}.label{position:relative;border:1px solid #555;padding:3mm 4mm;font-size:10.5pt;overflow:hidden}.direct-mark{position:absolute;left:3mm;top:13mm;border:1px solid #111;padding:.5mm 2mm;font-size:9pt;font-weight:900}.label-head{display:grid;grid-template-columns:32mm 1fr 34mm;gap:2mm;align-items:center;border-bottom:1px solid #999;padding-bottom:1mm;margin-bottom:1mm;font-size:12pt;direction:rtl}.label-code{justify-self:start;font-weight:900}.label-brand{justify-self:center;text-align:center;white-space:nowrap}.label-barcode{width:34mm;height:10mm;display:block;direction:ltr}.barcode-svg{display:block;width:100%;height:100%}.label-store{text-align:center;font-size:12pt;font-weight:900;margin:0 0 1mm;padding-bottom:1mm;border-bottom:1px solid #777}.recipient-date-row{display:flex;align-items:center;justify-content:space-between;gap:3mm}.delivery-date{direction:ltr;white-space:nowrap}.note{margin-top:1mm;border-top:1px dashed #aaa;padding-top:1mm;font-weight:700;display:grid;grid-template-columns:repeat(var(--note-cols),minmax(0,1fr));gap:2mm;line-height:1.18;word-break:break-word}.note-column{min-width:0}.note-column+.note-column{border-right:1px dotted #bbb;padding-right:2mm}.note-line{margin:0 0 .45mm}</style></head><body>${pages.map(pg=>`<section class="page">${pg.map(label).join('')}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();
  }
  async function fetchOrder(id){try{return (await api('/direct-orders?id='+id)).order}catch{return null}}
  function patch(){
    const parse=document.querySelector('#doParse');
    if(parse&&!parse.dataset.piecesFix){parse.dataset.piecesFix='1';parse.addEventListener('click',()=>setTimeout(()=>{const raw=document.querySelector('#doRaw')?.value||'';const input=document.querySelector('#doPieces');if(input)input.value=pieceCount(raw)},0))}
    document.querySelectorAll('[data-print]').forEach(b=>{if(b.dataset.printFix)return;b.dataset.printFix='1';b.onclick=async()=>{const o=await fetchOrder(b.dataset.print);if(o)printRows([o])}});
    const selected=document.querySelector('#doPrintSelected');if(selected&&!selected.dataset.printFix){selected.dataset.printFix='1';selected.onclick=async()=>{const ids=[...document.querySelectorAll('.doCheck:checked')].map(x=>x.dataset.id);if(!ids.length)return toast('حدد طلبات للطباعة');const rows=(await Promise.all(ids.map(fetchOrder))).filter(Boolean);printRows(rows)}}
    const savePrint=document.querySelector('#doSavePrint');if(savePrint&&!savePrint.dataset.printFix){savePrint.dataset.printFix='1';savePrint.onclick=async()=>{try{const payload={store_id:Number(document.querySelector('#doStore')?.value||0),recipient_name:document.querySelector('#doName')?.value||'',phone:document.querySelector('#doPhone')?.value||'',area:document.querySelector('#doArea')?.value||'',detailed_address:document.querySelector('#doAddress')?.value||'',pieces:pieceCount(document.querySelector('#doRaw')?.value||document.querySelector('#doNotes')?.value||''),weight:Number(document.querySelector('#doWeight')?.value||0),amount:Number(document.querySelector('#doAmount')?.value||0),order_notes:document.querySelector('#doNotes')?.value||''};const d=await api('/direct-orders',{method:'POST',body:JSON.stringify(payload)});toast('تم حفظ مباشر D-'+d.order.direct_code);printRows([d.order]);setTimeout(()=>window.directOrdersView&&window.directOrdersView(),250)}catch(e){toast(e.message)}}}
  }
  new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});
  patch();
  window.__directPieceCount=pieceCount;
})();
