(()=>{
  // قارئات الليزر الرخيصة تقرأ Code 128 بشكل أثبت عندما تكون البيانات أقصر.
  // الباركود يحمل رقم الطلب فقط، بينما النص الظاهر يبقى CV-XXXX للمستخدم.
  const oldCode128Svg=code128Svg;
  code128Svg=function(value){
    const raw=String(value||'');
    const match=raw.match(/(\d+)\s*$/);
    const scanValue=match?match[1]:raw;
    const svg=oldCode128Svg(scanValue);
    const visible=match?`CV-${match[1]}`:raw;
    return svg.replace(/(<text[^>]*>)[^<]*(<\/text>)/,`$1${esc(visible)}$2`);
  };
})();
