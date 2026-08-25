(()=>{
  // باركود قصير داخل حدود البوليصة مع Quiet Zone واضحة من الطرفين.
  // النص الظاهر يبقى CV-رقم الطلب، لكن جهاز المسح يقرأ رقم الطلب فقط.
  code128Svg=function(value){
    const displayText=String(value||'').toUpperCase();
    const encodedText=displayText.replace(/^CV-/,'').replace(/\D/g,'')||displayText;
    const data=[...encodedText].map(ch=>ch.charCodeAt(0)-32).filter(code=>code>=0&&code<=94);
    let checksum=104;
    data.forEach((code,index)=>checksum+=code*(index+1));
    const codes=[104,...data,checksum%103,106];

    // هامش أبيض آمن على الجهتين مهم جدًا لقارئ الباركود.
    let x=18,bars='';
    for(const code of codes){
      const pattern=CODE128_PATTERNS[code];
      [...pattern].forEach((width,index)=>{
        const w=Number(width);
        if(index%2===0)bars+=`<rect x="${x}" y="4" width="${w}" height="46"/>`;
        x+=w;
      });
    }
    const total=x+18;
    return `<svg class="barcode-svg" viewBox="0 0 ${total} 68" role="img" aria-label="باركود الطلب ${esc(displayText)}" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="#fff"/>${bars}<text x="${total/2}" y="64" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700">${esc(displayText)}</text></svg>`;
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
      .label-head{display:grid;grid-template-columns:24mm minmax(0,1fr) 40mm;gap:2mm;align-items:center;border-bottom:1px solid #999;padding-bottom:1.5mm;margin-bottom:1mm;font-size:12pt;direction:rtl;overflow:hidden}
      .label-code{justify-self:start;font-weight:900;white-space:nowrap}
      .label-brand{justify-self:center;text-align:center;white-space:nowrap;min-width:0}
      .label-barcode{width:40mm;max-width:40mm;height:13mm;display:block;direction:ltr;justify-self:end;padding:0 2mm;overflow:hidden}
      .barcode-svg{display:block;width:100%;height:100%;overflow:hidden}
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
