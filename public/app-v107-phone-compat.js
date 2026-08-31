(()=>{
  if(typeof window.canonicalJordanPhone==='function') return;
  window.canonicalJordanPhone=function(value=''){
    let raw=String(value||'').trim();
    if(!raw) return '';
    const hasPlus=/^\s*\+/.test(raw);
    let digits=raw.replace(/\D/g,'');
    if(!digits) return '';
    // Jordan local/mobile forms -> canonical local 07XXXXXXXX.
    if(digits.startsWith('00962')) digits=digits.slice(5);
    else if(digits.startsWith('962')) digits=digits.slice(3);
    if(/^7\d{8}$/.test(digits)) return '0'+digits;
    if(/^07\d{8}$/.test(digits)) return digits;
    // Keep all non-Jordan/international numbers intact instead of forcing Jordan format.
    if(hasPlus) return '+'+digits;
    if(raw.replace(/\s/g,'').startsWith('00')) return '00'+digits.replace(/^00/, '');
    return digits;
  };
})();