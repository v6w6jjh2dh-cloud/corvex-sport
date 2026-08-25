(()=>{
  // أوضح وأكبر حتى يقرأه جهاز الباركود بسهولة ويظهر الكود كاملًا أسفله.
  code128Svg=function(value){
    const text=String(value||'').toUpperCase();
    const data=[...text].map(ch=>ch.charCodeAt(0)-32).filter(code=>code>=0&&code<=94);
    let checksum=104;
    data.forEach((code,index)=>checksum+=code*(index+1));
    const codes=[104,...data,checksum%103,106];
    let x=14,bars='';
    for(const code of codes){
      const pattern=CODE128_PATTERNS[code];
      [...pattern].forEach((width,index)=>{
        const w=Number(width)*1.15;
        if(index%2===0)bars+=`<rect x="${x}" y="3" width="${w}" height="52"/>`;
        x+=w;
      });
    }
    const total=x+14;
    return `<svg class="barcode-svg" viewBox="0 0 ${total} 74" role="img" aria-label="باركود الطلب ${esc(text)}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#fff"/>${bars}<text x="${total/2}" y="70" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700">${esc(text)}</text></svg>`;
  };

  openPrintWindow=function(orders,title='طباعة'){
    const w=window.open('','_blank');
    const pages=[];
    for(let i=0;i<orders.length;i+=8)pages.push(orders.slice(i,i+8));
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4 portrait;margin:5mm}
      *{box-sizing:border-box}
      body{margin:0;font-family:Tahoma,Arial,sans-serif}
      .page{width:200mm;height:287mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:3mm;page-break-after:always}
      .page:last-child{page-break-after:auto}
      .label{border:1px solid #555;padding:3mm 4mm;font-size:10.5pt;overflow:hidden}
      .label-head{display:grid;grid-template-columns:25mm 1fr 46mm;gap:2mm;align-items:center;border-bottom:1px solid #999;padding-bottom:1.5mm;margin-bottom:1mm;font-size:12pt;direction:rtl}
      .label-code{justify-self:start;font-weight:900}
      .label-brand{justify-self:center;text-align:center;white-space:nowrap}
      .label-barcode{width:46mm;height:14mm;display:block;direction:ltr;justify-self:end;padding:0 1.5mm}
      .barcode-svg{display:block;width:100%;height:100%;overflow:visible}
      .label-store{text-align:center;font-size:12pt;font-weight:900;margin:0 0 1mm;padding-bottom:1mm;border-bottom:1px solid #777}
      .recipient-date-row{display:flex;align-items:center;justify-content:space-between;gap:3mm}
      .delivery-date{direction:ltr;white-space:nowrap}
      .note{margin-top:1mm;border-top:1px dashed #aaa;padding-top:1mm;font-weight:700;display:grid;grid-template-columns:repeat(var(--note-cols),minmax(0,1fr));gap:2mm;line-height:1.18;word-break:break-word}
      .note-column{min-width:0}.note-column+.note-column{border-right:1px dotted #bbb;padding-right:2mm}.note-line{margin:0 0 .45mm}
      .return-alert{margin-top:1mm;padding:.8mm 1.5mm;border:2px solid #000;text-align:center;font-size:13pt;font-weight:900;background:#fff}
    </style></head><body>${pages.map(pg=>`<section class="page">${pg.map(labelHtml).join('')}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
    w.document.close();
  };
})();
