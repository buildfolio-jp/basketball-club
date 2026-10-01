importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
let runtime,bridge;
const sync=populate=>new Promise((resolve,reject)=>runtime.FS.syncfs(populate,e=>e?reject(e):resolve()));
async function initialize(config){
 runtime=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
 await runtime.loadPackage(['sqlite3','ssl','hashlib']);
 runtime.unpackArchive(await (await fetch('python.zip?v='+config.version)).arrayBuffer(),'zip',{extractDir:'/app'});
 runtime.FS.mkdirTree('/app/data');runtime.FS.mount(runtime.FS.filesystems.IDBFS,{},'/app/data');await sync(true);
 let previous='';try{previous=runtime.FS.readFile('/app/data/demo-version',{encoding:'utf8'});}catch{}
 if(previous!==config.version){
  const erase=path=>{for(const name of runtime.FS.readdir(path)){if(name==='.'||name==='..')continue;const child=path+'/'+name;if(runtime.FS.isDir(runtime.FS.stat(child).mode)){erase(child);runtime.FS.rmdir(child);}else runtime.FS.unlink(child);}};
  erase('/app/data');runtime.FS.writeFile('/app/data/club.sqlite3',new Uint8Array(await(await fetch('seed.sqlite3?v='+config.version)).arrayBuffer()));runtime.FS.writeFile('/app/data/demo-version',config.version);
 }
 runtime.FS.mkdirTree('/app/public');runtime.FS.mkdirTree('/app/data/uploads');runtime.FS.symlink('/app/data/uploads','/app/public/uploads');
 await runtime.runPythonAsync("import sys, os\nsys.path.insert(0, '/app')\nos.chdir('/app')\nimport bridge");bridge=runtime.pyimport('bridge');await sync(false);
 return {ready:true};
}
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{try{const result=data.init?await initialize(data.init):JSON.parse(bridge.request(JSON.stringify(data.request)));if(!data.init)await sync(false);self.postMessage({id:data.id,result});}catch(e){self.postMessage({id:data.id,error:String(e)});}});};
