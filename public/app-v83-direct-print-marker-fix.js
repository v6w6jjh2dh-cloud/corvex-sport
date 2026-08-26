(()=>{
 const originalOpen=window.open;
 window.open=function(){
  const w=originalOpen.apply(this,arguments);
  if(!w)return w;
  try{
   const originalWrite=w.document.write.bind(w.document);
   w.document.write=function(html){
    let s=String(html);
    if(s.includes('طباعة مباشر')&&s.includes('.direct-mark')){
      s=s.replace(/\.direct-mark\{position:absolute;left:\s*3mm;/g,'.direct-mark{position:absolute;left:8mm;');
    }
    return originalWrite(s);
   };
  }catch{}
  return w;
 };
})();