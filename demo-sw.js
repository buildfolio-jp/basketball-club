self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),base=new URL(self.registration.scope).pathname,path=url.pathname.slice(base.length);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(base)||!(/^(api\/|staff-photo|uploads\/)/.test(path)))return;
 event.respondWith((async()=>{
  if(path.startsWith('uploads/')){const staticResponse=await fetch(event.request);if(staticResponse.ok)return staticResponse;}
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=clients.find(c=>c.id===event.clientId)||clients[0];
  if(!client)return new Response('デモ画面から開いてください。',{status:503});
  const payload={method:event.request.method,path:'/'+path+url.search,headers:Object.fromEntries(event.request.headers),body:event.request.method==='POST'?await event.request.text():''};
  const result=await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('デモの読み込みがタイムアウトしました。画面を再読み込みしてください。')),120000);channel.port1.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};client.postMessage({type:'demo-request',request:payload},[channel.port2]);});
  const raw=Uint8Array.from(atob(result.body),c=>c.charCodeAt(0));const headers=new Headers(result.headers);headers.delete('Content-Length');headers.delete('Set-Cookie');headers.set('Cache-Control','no-store');return new Response(raw,{status:result.status,headers});
 })().catch(e=>new Response(JSON.stringify({error:e.message}),{status:503,headers:{'Content-Type':'application/json'}})));
});
