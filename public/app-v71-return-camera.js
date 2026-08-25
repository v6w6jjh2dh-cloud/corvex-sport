(()=>{
 let stream=null,raf=0,detector=null,busy=false;
 function stopCamera(){if(raf)cancelAnimationFrame(raf);raf=0;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;document.querySelector('#corvexCameraOverlay')?.remove();busy=false}
 window.__corvexStopReturnCamera=stopCamera;
 async function startCamera(onCode){
  if(busy)return;busy=true;
  if(!navigator.mediaDevices?.getUserMedia){busy=false;return toast('الكاميرا غير مدعومة على هذا الجهاز')}
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   const ov=document.createElement('div');ov.id='corvexCameraOverlay';ov.className='modal-backdrop';ov.innerHTML=`<div class="modal-card" style="max-width:520px"><div class="modal-head"><h3>📷 مسح الباركود بالكاميرا</h3><button id="closeReturnCamera" class="btn btn-soft">✕</button></div><div style="position:relative;background:#000;border-radius:14px;overflow:hidden"><video id="returnCameraVideo" autoplay playsinline muted style="display:block;width:100%;max-height:65vh;object-fit:cover"></video><div style="position:absolute;left:8%;right:8%;top:40%;height:20%;border:3px solid #fff;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.25)"></div></div><div id="returnCameraHint" class="sub" style="margin-top:10px">وجّه الباركود داخل الإطار — سيتم تسجيله تلقائيًا.</div></div>`;document.body.appendChild(ov);const video=ov.querySelector('#returnCameraVideo');video.srcObject=stream;ov.querySelector('#closeReturnCamera').onclick=stopCamera;ov.onclick=e=>{if(e.target===ov)stopCamera()};
   if(!('BarcodeDetector' in window)){ov.querySelector('#returnCameraHint').textContent='متصفحك لا يدعم قراءة الباركود المباشرة بالكاميرا. جرّب Chrome/Edge على الهاتف.';return}
   const supported=await BarcodeDetector.getSupportedFormats().catch(()=>[]);const formats=['code_128','code_39','ean_13','ean_8','qr_code'].filter(x=>!supported.length||supported.includes(x));detector=new BarcodeDetector(formats.length?{formats}:undefined);
   let last='',lastAt=0;
   const tick=async()=>{if(!stream||!document.body.contains(video))return;try{if(video.readyState>=2){const codes=await detector.detect(video);if(codes?.length){const raw=String(codes[0].rawValue||'').trim(),now=Date.now();if(raw&&(raw!==last||now-lastAt>2500)){last=raw;lastAt=now;ov.querySelector('#returnCameraHint').textContent='✓ تم قراءة: '+raw;stopCamera();await onCode(raw);return}}}}catch{}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
  }catch(e){busy=false;toast(e.name==='NotAllowedError'?'اسمح للموقع باستخدام الكاميرا':'تعذر تشغيل الكاميرا')}
 }
 function addButton(input,handler,id){if(!input||document.getElementById(id))return;const b=document.createElement('button');b.id=id;b.type='button';b.className='btn btn-accent';b.textContent='📷 كاميرا';b.onclick=()=>startCamera(handler);input.parentElement?.appendChild(b)}
 function wire(){
  const normal=document.querySelector('#fastReturnInput');if(normal)addButton(normal,async code=>{normal.value=code;normal.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))},'fastReturnCameraBtn');
  const legacy=document.querySelector('#returnCodeInput');if(legacy)addButton(legacy,async code=>{legacy.value=code;legacy.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))},'returnCenterCameraBtn');
  const direct=document.querySelector('#directReturnScan');if(direct)addButton(direct,async code=>{direct.value=code;direct.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))},'directReturnCameraBtn');
 }
 new MutationObserver(wire).observe(document.documentElement,{childList:true,subtree:true});wire();
 window.addEventListener('pagehide',stopCamera);
})();
