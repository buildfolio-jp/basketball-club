(async()=>{
 const status=document.getElementById('demo-loading-status');let counter=0;const waiting=new Map();const worker=new Worker('demo-worker.js?v='+window.DEMO_VERSION);
 const call=payload=>new Promise((resolve,reject)=>{const id=++counter;waiting.set(id,{resolve,reject});worker.postMessage({id,...payload});});
 worker.onmessage=({data})=>{const p=waiting.get(data.id);if(p){waiting.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);}};
 worker.onerror=e=>{for(const p of waiting.values())p.reject(Error(e.message));waiting.clear();};
 const ready=(async()=>{const config=await(await fetch('demo-manifest.json',{cache:'no-store'})).json();await call({init:config});})();
 navigator.serviceWorker.addEventListener('message',async e=>{if(e.data.type==='demo-request'){try{await ready;const result=await call({request:e.data.request});e.ports[0].postMessage({result});}catch(error){e.ports[0].postMessage({error:error.message});}}});
 try{
  await navigator.serviceWorker.register('demo-sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  await ready;
  for(const src of window.DEMO_SCRIPTS){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src+(src.includes('?')?'&':'?')+'release='+window.DEMO_VERSION;script.onload=resolve;script.onerror=reject;document.body.append(script);});}
  document.getElementById('demo-loading')?.remove();
 }catch(e){status.textContent='読み込めませんでした。通信状態を確認して再読み込みしてください。 '+e.message;console.error(e);}
})();
