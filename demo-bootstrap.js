(async()=>{
 const originalFetch=window.fetch.bind(window),demoRole=new URLSearchParams(location.search).get('view')||'';
 const fastPublic=!demoRole&&['','home','login','philosophy','trial','trial-list','location','faq','staff-introduction','other-activities','all-staff'].includes(location.hash.slice(1));let runtimeReady=false;
 const publicSnapshot=fastPublic?originalFetch('public-snapshot.json?v='+window.DEMO_VERSION).then(r=>{if(!r.ok)throw Error('公開ページを読み込めません。');return r.json();}):null;
 const roleLabel={member:'会員',coach:'コーチ',admin:'管理者'}[demoRole];
 if(roleLabel){const title=()=>{if(!document.title.startsWith('【'+roleLabel+'】'))document.title='【'+roleLabel+'】'+document.title.replace(/^【[^】]+】/,'');};new MutationObserver(title).observe(document.querySelector('title'),{childList:true,subtree:true});title();}
 const status=document.getElementById('demo-loading-status');let counter=0;const waiting=new Map();const worker=new Worker('demo-worker.js?v='+window.DEMO_VERSION);
 const call=payload=>new Promise((resolve,reject)=>{const id=++counter;waiting.set(id,{resolve,reject});worker.postMessage({id,...payload});});
 worker.onmessage=({data})=>{const p=waiting.get(data.id);if(p){waiting.delete(data.id);if(data.result?.session!==undefined)sessionStorage.setItem('basketball-demo-session',data.result.session);data.error?p.reject(Error(data.error)):p.resolve(data.result);}};
 worker.onerror=e=>{for(const p of waiting.values())p.reject(Error(e.message));waiting.clear();};
 const ready=(async()=>{const config=await(await originalFetch('demo-manifest.json',{cache:'no-store'})).json();await call({init:{...config,session:sessionStorage.getItem('basketball-demo-session')||'',demoRole}});runtimeReady=true;})();
 window.fetch=async(input,options)=>{const request=new Request(new URL(typeof input==='string'?input:input.url,location.href),options||(input instanceof Request?input:undefined));const url=new URL(request.url);if(url.origin!==location.origin||!url.pathname.startsWith('/basketball-club/api/'))return originalFetch(input,options);if(fastPublic&&!runtimeReady&&request.method==='GET'){if(url.pathname.endsWith('/api/public'))return new Response(JSON.stringify(await publicSnapshot),{headers:{'Content-Type':'application/json'}});if(url.pathname.endsWith('/api/me'))return new Response('{"user":null}',{headers:{'Content-Type':'application/json'}});}await ready;const result=await call({request:{method:request.method,path:url.pathname.slice('/basketball-club'.length)+url.search,headers:Object.fromEntries(request.headers),body:request.method==='POST'?await request.text():''}});const headers=new Headers(result.headers);headers.delete('Content-Length');headers.delete('Set-Cookie');return new Response(Uint8Array.from(atob(result.body),c=>c.charCodeAt(0)),{status:result.status,headers});};
 navigator.serviceWorker.addEventListener('message',async e=>{if(e.data.type==='demo-request'){try{await ready;const result=await call({request:e.data.request});e.ports[0].postMessage({result});}catch(error){e.ports[0].postMessage({error:error.message});}}});
 try{
  await navigator.serviceWorker.register('demo-sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  if(!fastPublic)await ready;
  await Promise.all(window.DEMO_SCRIPTS.map(src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.async=false;script.src=src+(src.includes('?')?'&':'?')+'release='+window.DEMO_VERSION;script.onload=resolve;script.onerror=reject;document.body.append(script);})));
  ready.catch(e=>console.error('デモ機能の初期化:',e));
  document.getElementById('demo-loading')?.remove();
 }catch(e){status.textContent='読み込めませんでした。通信状態を確認して再読み込みしてください。 '+e.message;console.error(e);}
})();
