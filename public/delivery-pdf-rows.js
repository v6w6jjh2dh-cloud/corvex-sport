// Delivery-company PDF statement -> shipment rows.
// A shipment row is anchored on a phone number sitting alone in the statement's PHONE COLUMN
// (the x-position shared by most phone cells). Phone numbers written inside notes, or any phone
// outside that column, never create a row. Rows are never merged or dropped because two rows
// share a phone number. The statement head/footer totals are read so the extracted rows can be
// checked against them before anything is committed.
// Pure functions: used by app-v62.js in the browser and by tests in Node.
(function(root){
  const DIGITS={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
  const digits=v=>String(v??'').replace(/[٠-٩۰-۹]/g,d=>DIGITS[d]||d);
  const PHONE=/^(?:00962|962|0)?7\d{8}$/;
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  // The whole cell is a phone (spaces, +, -, brackets allowed) — not a phone inside a sentence.
  const purePhone=text=>{
    const t=digits(text).trim();
    if(!t||/[^\d\s+\-()]/.test(t))return '';
    const d=t.replace(/\D/g,'');
    return PHONE.test(d)?d:'';
  };
  const textOf=(band,width,from,to)=>{
    const lines=[];
    for(const item of band.filter(x=>x.x>=width*from&&x.x<width*to).sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:b.x-a.x)){
      let line=lines.find(x=>Math.abs(x.y-item.y)<=2);
      if(!line){line={y:item.y,parts:[]};lines.push(line)}
      line.parts.push(item);
    }
    return lines.sort((a,b)=>b.y-a.y).map(l=>l.parts.sort((a,b)=>b.x-a.x).map(x=>x.text).join(' ').trim()).filter(Boolean).join(' ').trim();
  };
  const numberOf=v=>{const m=digits(String(v||'')).replace(/,/g,'.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0};
  const dateOf=v=>{
    const c=digits(String(v||'')).replace(/\s+/g,'').replace(/[\/.]/g,'-');
    let m=c.match(/(20\d{2})-(\d{1,2})-+(\d{1,2})/);if(!m)m=c.match(/(\d{1,2})-(\d{1,2})-(20\d{2})/);if(!m)return '';
    const [y,mo,d]=m[1].length===4?[m[1],m[2],m[3]]:[m[3],m[2],m[1]];
    return y+'-'+String(Number(mo)).padStart(2,'0')+'-'+String(Number(d)).padStart(2,'0');
  };
  const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};

  // Column layout of the delivery company's statement (fractions of page width, RTL table).
  const COLS={date:[0,.07],cash:[.07,.145],fee:[.145,.205],price:[.205,.265],status:[.265,.385],note:[.62,.75]};

  // Phone column = the largest group of pure-phone cells sharing an x position.
  function phoneColumn(pages){
    const all=[];for(const p of pages)for(const it of p.items)if(purePhone(it.text))all.push({...it,width:p.width});
    if(!all.length)return null;
    const tol=it=>Math.max(6,it.width*.035);
    let best=null;
    for(const a of all){
      const members=all.filter(b=>Math.abs((b.x/b.width)-(a.x/a.width))*a.width<=tol(a));
      if(!best||members.length>best.length)best=members;
    }
    const xs=best.map(b=>b.x/b.width);
    return {from:Math.min(...xs),to:Math.max(...xs),center:median(xs)};
  }

  function pageRows(page,col,pageNumber){
    const {items,width}=page,ignored=[];
    const inCol=it=>{const f=it.x/width;return f>=col.from-.02&&f<=col.to+.02};
    let anchors=items.filter(it=>purePhone(it.text)&&inCol(it)).sort((a,b)=>b.y-a.y);
    for(const it of items){
      const d=digits(it.text).replace(/\D/g,'');
      if(/7\d{8}/.test(d)&&!anchors.includes(it))ignored.push({page:pageNumber,text:it.text,reason:purePhone(it.text)?'رقم هاتف خارج عمود الهاتف (ملاحظات)':'رقم هاتف داخل نص/ملاحظة'});
    }
    const build=list=>{
      const gaps=list.slice(1).map((a,i)=>list[i].y-a.y).filter(g=>g>2),typical=median(gaps)||24;
      const rows=list.map((a,i)=>{
        const next=list[i+1],bottom=next?next.y+4:a.y-Math.max(typical*1.6,18);
        const band=items.filter(it=>it.y<=a.y+4&&it.y>bottom);
        const t=k=>textOf(band,width,COLS[k][0],COLS[k][1]);
        return {page:pageNumber,y:a.y,phone:purePhone(a.text),shipment_date:dateOf(t('date')),status_text:t('status'),note:t('note'),
          cash:numberOf(t('cash')),fee:numberOf(t('fee')),price:numberOf(t('price')),
          // Shipment code (e.g. BS05AUTOOUT) for display only; matching does not use it.
          code:(band.map(it=>digits(it.text).trim()).find(x=>/^[A-Za-z]{2,}[A-Za-z0-9]*\d[A-Za-z0-9]*$/.test(x)&&x.length>=6)||''),__anchor:a,__bottom:bottom};
      });
      return rows;
    };
    // A second phone stacked in the same phone cell is not a shipment: it has no date, no status
    // and no money of its own (real shipments always carry a date). Drop such anchors, then
    // rebuild the bands so the real row keeps its full height (notes included).
    let rows=build(anchors);
    const fake=new Set(rows.filter((r,i)=>i>0&&!r.shipment_date&&!r.status_text&&!r.cash&&!r.fee&&!r.price).map(r=>r.__anchor));
    if(fake.size){
      for(const a of fake)ignored.push({page:pageNumber,text:a.text,reason:'رقم هاتف إضافي بلا تاريخ ولا مبلغ ولا حالة — ليس شحنة'});
      anchors=anchors.filter(a=>!fake.has(a));rows=build(anchors);
    }
    const last=rows[rows.length-1];
    rows=rows.map(({__anchor,__bottom,...r})=>r);
    return {rows,ignored,top:anchors.length?anchors[0].y:null,bottom:last?last.__bottom:null};
  }

  // ---- statement head / footer totals
  const norm=s=>digits(s).replace(/[ً-ْـ]/g,'').replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
  const KINDS=[
    ['count',/عدد/],
    ['fee',/اجور|اجره|توصيل/],
    ['net',/صافي|المستحق|للتاجر|للعميل/],
    ['total',/اجمالي|مجموع|المبلغ|قيمه|المحصل/]
  ];
  // Some PDFs give Arabic in visual (reversed) order, so the label is tried both ways.
  const kindOf=text=>{const t=norm(text);if(t.length>40)return '';for(const v of [t,[...t].reverse().join('')])for(const [k,re] of KINDS)if(re.test(v))return k;return ''};
  const pureNumber=text=>{const t=digits(text).replace(/,/g,'').replace(/\s/g,'');return /^-?\d+(?:\.\d+)?$/.test(t)?Number(t):null};
  function totalsFrom(items){
    const found={};
    const labels=items.filter(it=>kindOf(it.text));
    const nums=items.map(it=>({it,v:pureNumber(it.text)})).filter(x=>x.v!==null);
    for(const l of labels){
      const kind=kindOf(l.text);if(found[kind]!==undefined)continue;
      const inline=digits(l.text).match(/(-?\d+(?:[.,]\d+)?)/);
      if(inline){found[kind]=Number(inline[1].replace(',','.'));continue}
      let best=null;
      for(const n of nums){
        const dy=l.y-n.it.y,dx=Math.abs(l.x-n.it.x);
        let cost=null;
        if(Math.abs(dy)<=3&&dx<=160)cost=dx;        // same line: value beside the label
        else if(dy>3&&dy<=30&&dx<=45)cost=200+dy+dx; // value printed under the label
        if(cost!==null&&(!best||cost<best.cost))best={cost,v:n.v};
      }
      if(best)found[kind]=best.v;
    }
    return Object.keys(found).length?found:null;
  }

  function parseStatement(pages){
    const col=phoneColumn(pages);
    if(!col)return {rows:[],ignored:[],header:null,extracted:{count:0,price:0,fee:0,cash:0}};
    let rows=[],ignored=[];const regions=[];
    pages.forEach((p,i)=>{
      const r=pageRows(p,col,i+1);rows=rows.concat(r.rows);ignored=ignored.concat(r.ignored);
      if(i===0&&r.top!==null)regions.push(p.items.filter(it=>it.y>r.top+6));
      if(i===pages.length-1&&r.bottom!==null)regions.push(p.items.filter(it=>it.y<=r.bottom));
    });
    let header=null;for(const reg of regions){const t=totalsFrom(reg);if(t){header={...(header||{}),...Object.fromEntries(Object.entries(t).filter(([k])=>header?.[k]===undefined))}}}
    const extracted={count:rows.length,price:round2(rows.reduce((s,r)=>s+r.price,0)),fee:round2(rows.reduce((s,r)=>s+r.fee,0)),cash:round2(rows.reduce((s,r)=>s+r.cash,0))};
    return {rows,ignored,header,extracted,phone_column:col};
  }

  // Compare extracted rows with the statement head. ok=true only when every total that the head
  // states matches and at least the shipment count was read.
  function checkTotals(extracted,header){
    if(!header)return {ok:false,found:false,checks:[]};
    const map=[['count','عدد الشحنات','count'],['total','إجمالي المبالغ','price'],['fee','أجور التوصيل','fee'],['net','صافي الكاش','cash']];
    const checks=map.filter(([k])=>header[k]!==undefined).map(([k,label,e])=>({key:k,label,header:header[k],extracted:extracted[e],ok:Math.abs(Number(header[k])-Number(extracted[e]))<.01}));
    return {ok:checks.length>0&&checks.some(c=>c.key==='count')&&checks.every(c=>c.ok),found:checks.length>0,checks};
  }

  const api={parseStatement,checkTotals,purePhone,phoneColumn,totalsFrom,dateOf,numberOf};
  root.CorvexDeliveryPdf=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
