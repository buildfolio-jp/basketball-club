// Keep disclosure choices through refreshes, scoped to the signed-in account and page.
(() => {
 const storageKey='cheetahs-disclosures-v1';
 let states={};
 try { states=JSON.parse(sessionStorage.getItem(storageKey)||'{}'); } catch (_) {}
 const keys=new WeakMap();
 const label=text=>String(text||'').replace(/[（(][^）)]*[）)]/g,'').replace(/\s+/g,' ').trim();
 function context(){return [typeof user==='undefined'?'public':user?.login_id||user?.id||'public',location.hash.split('?')[0]||'#home'].join('|');}
 function save(){try{sessionStorage.setItem(storageKey,JSON.stringify(states));}catch(_){}}
 function restore(){
  const counts=new Map();
  document.querySelectorAll('details').forEach(el=>{
   if(el.matches('.mobile-route')||el.closest('nav,#public-menu-dialog'))return;
   const summary=el.querySelector(':scope > summary');if(!summary)return;
   const parents=[];for(let p=el.parentElement?.closest('details');p;p=p.parentElement?.closest('details'))parents.unshift(label(p.querySelector(':scope > summary')?.textContent));
   const card=el.parentElement?.closest('article,.card,section');
   const title=card?.querySelector(':scope > h2,:scope > h3,:scope > b,:scope > strong')?.textContent||'';
   const base=[context(),el.closest('dialog')?'dialog':'page',...parents,label(title),el.id||label(summary.textContent)].join('|');
   const n=counts.get(base)||0;counts.set(base,n+1);
   const key=base+'|'+n;keys.set(el,key);
   if(Object.prototype.hasOwnProperty.call(states,key))el.open=states[key];
   else states[key]=el.open;
  });
 }
 document.addEventListener('click',event=>{
  const summary=event.target.closest?.('summary');
  if(!summary||event.target.closest('a,button,input,select,textarea'))return;
  const el=summary.parentElement;if(el.tagName!=='DETAILS')return;
  if(el.matches('.mobile-route')||el.closest('nav,#public-menu-dialog'))return;
  if(!keys.has(el))restore();
  states[keys.get(el)]=!el.open;save();
 },true);
 new MutationObserver(restore).observe(document.documentElement,{childList:true,subtree:true});
 restore();
})();

// Navigation is transient; page disclosures above deliberately remain persistent.
function closeNavigationMenus(){
 document.querySelectorAll('details.mobile-route[open]').forEach(el=>el.open=false);
 const dialog=document.getElementById('public-menu-dialog');if(dialog?.open)dialog.close();
}
document.addEventListener('click',event=>{if(event.target.closest?.('.mobile-nav-options a,.sidebar nav a,#public-menu-dialog a'))closeNavigationMenus();},true);
window.addEventListener('hashchange',closeNavigationMenus);
