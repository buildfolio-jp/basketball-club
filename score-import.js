let scoreImportSession=null,scoreOcrLoader=null;
const scoreColumnLabels={user_id:'会員ID',name:'氏名',number:'背番号',points:'得点',fouls:'ファウル',rebounds:'リバウンド',assists:'アシスト',steals:'スティール',blocks:'ブロック',turnovers:'ターンオーバー',participation:'出場状況',result_id:'試合ID'};
const scoreAliases={user_id:['会員id','選手id','user_id','playerid'],name:['氏名','選手名','名前','選手','name','player'],number:['背番号','番号','no','number','#'],points:['得点','総得点','pts','points'],fouls:['ファウル','pf','fouls'],rebounds:['リバウンド','reb','rebounds','trb'],assists:['アシスト','ast','assists'],steals:['スティール','スチール','stl','steals'],blocks:['ブロック','blk','blocks'],turnovers:['ターンオーバー','to','tov','turnovers'],participation:['出場状況','participation'],result_id:['試合id','result_id']};
const normalizeScoreName=s=>String(s||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
function scoreHeaderKey(s){const n=normalizeScoreName(s).replace(/[.：:]/g,'');return Object.keys(scoreAliases).find(k=>scoreAliases[k].some(a=>normalizeScoreName(a)===n))||'';}
function parseScoreCsv(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}if(quoted)throw Error('CSVの引用符が閉じられていません。');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;}
function scoreImportForm(id){
 const result=data.results.find(r=>r.id===id);if(!result)return;
 scoreImportSession={id,result,rows:[],readFiles:new Set(),active:true,worker:null};const state=scoreImportSession;
 modal('PDF・写真・CSVからスコアを読み込む',`<p><b>${esc(result.date)} ／ vs ${esc(result.opponent)}</b><br>${esc(result.group_name)}のこの試合に取り込みます。</p><form id="score-read-form" onsubmit="readScoreFile(event)"><label class="field">スコアのファイル<input type="file" name="scorefile" multiple accept=".pdf,.csv,.jpg,.jpeg,.png,.webp,application/pdf,text/csv,image/jpeg,image/png,image/webp" required></label><p class="hint">PDF・JPG・PNG・WebP・CSVに対応（最大30件・1件10MBまで、PDFは5ページまで）。タブレットではファイルや写真を選択してください。</p><p class="hint">PDF・写真は文字と表を読み取ります。手書きや公式用紙のランニングスコアなど、複雑な配置は正しく数値化できない場合があります。読み取り結果を必ず確認してください。</p><div class="dialog-actions"><button class="lime">ファイルを読み込む</button><button type="button" class="outline" id="score-open-records" onclick="openScoreRecords('${id}')">記録を確認</button></div><p class="hint">読み込み後は下書き保存されます。「記録を確認」から内容を編集・公開できます。</p><div class="error" role="alert"></div><p id="score-read-status" role="status"></p></form><div id="score-source-preview"></div><div id="score-import-review"></div>`);
 $('#modal').addEventListener('close',()=>{state.active=false;if(state.worker)state.worker.terminate().catch(()=>{});},{once:true});
}
function scoreReadStatus(text){const el=$('#score-read-status');if(el)el.textContent=text;}
async function loadScoreOcr(){
 if(window.Tesseract)return window.Tesseract;
 if(!scoreOcrLoader)scoreOcrLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/basketball-club/vendor/score-import/tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{scoreOcrLoader=null;reject(Error('文字認識を読み込めません。再読み込みしてください。'));};document.head.append(script);});return scoreOcrLoader;
}
async function scoreRecognize(canvas,state){
 if(!state.active)throw Error('読み込みを中止しました。');
 if(!state.worker){const T=await loadScoreOcr();state.worker=await T.createWorker('jpn+eng',1,{workerPath:'/basketball-club/vendor/score-import/worker.min.js',corePath:'/basketball-club/vendor/score-import/core',langPath:'/basketball-club/vendor/score-import/lang',cacheMethod:'none',logger:p=>{if(state.active&&p.status==='recognizing text')scoreReadStatus('文字を読み取り中… '+Math.round(p.progress*100)+'%');}});}
 const answer=await state.worker.recognize(canvas);return answer.data.text;
}
function pdfScoreLines(items){const lines=[];for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5],x=item.transform[4];let line=lines.find(l=>Math.abs(l.y-y)<3);if(!line){line={y,items:[]};lines.push(line);}line.items.push({x,text:item.str});}return lines.sort((a,b)=>b.y-a.y).map(l=>l.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join('\t')).join('\n');}
async function readScoreFileOne(ev){
 ev.preventDefault();const state=scoreImportSession,form=ev.target,button=ev.submitter,file=ev.uploadFile;if(!file||!state)return;button.disabled=true;$('#score-open-records').disabled=true;form.querySelector('.error').textContent='';
 try{
  if(file.size>10*1024*1024)throw Error('10MB以下のファイルを選択してください。');
  const ext=file.name.split('.').pop().toLowerCase();let text='',matrix=null;scoreReadStatus('ファイルを読み込んでいます…');
  if(ext==='csv'){
   const buffer=await file.arrayBuffer();try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('shift-jis',{fatal:true}).decode(buffer);}
   matrix=parseScoreCsv(text.replace(/^\uFEFF/,''));
  }else if(ext==='pdf'){
   const pdfjs=await import('/basketball-club/vendor/score-import/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/basketball-club/vendor/score-import/pdf.worker.mjs';
   const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:'/basketball-club/vendor/score-import/cmaps/',cMapPacked:true,standardFontDataUrl:'/basketball-club/vendor/score-import/standard_fonts/',wasmUrl:'/basketball-club/vendor/score-import/wasm/'});
   task.onPassword=()=>task.destroy();const pdf=await task.promise;
   try{if(pdf.numPages>5)throw Error('PDFは5ページ以内に分けてください。');
    for(let n=1;n<=pdf.numPages;n++){
     if(!state.active)return;scoreReadStatus(`PDF ${n} / ${pdf.numPages}ページを読み込み中…`);const page=await pdf.getPage(n),content=await page.getTextContent();let pageText=pdfScoreLines(content.items);
     const base=page.getViewport({scale:1}),scale=Math.min(2,2400/Math.max(base.width,base.height)),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
     if(!state.active)return;canvas.className='score-source-image';canvas.setAttribute('aria-label',`元のPDF ${n}ページ`);$('#score-source-preview').append(canvas);
     if(pageText.replace(/\s/g,'').length<20)pageText=await scoreRecognize(canvas,state);
     text+=pageText+'\n';page.cleanup();
    }
   }finally{await pdf.destroy();}
  }else if(['jpg','jpeg','png','webp'].includes(ext)){
   const url=URL.createObjectURL(file),image=new Image();try{image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>40000000)throw Error('画像が大きすぎます。縮小してから選択してください。');const scale=Math.min(1,2600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);canvas.className='score-source-image';canvas.setAttribute('aria-label','読み込んだ写真');$('#score-source-preview').append(canvas);text=await scoreRecognize(canvas,state);}finally{URL.revokeObjectURL(url);}
  }else throw Error('PDF・CSV・JPG・PNG・WebPを選択してください。');
  if(!state.active)return;
  state.text=text;state.matrix=matrix;state.rows.push(...(matrix?scoreRowsFromMatrix(matrix,state.id):scoreRowsFromText(text)));state.readFiles.add(uploadFileKey(file));
  renderScoreReview(state);
  try{await autoSaveScoreImport(state);scoreReadStatus('読み込んだ記録を下書き保存しました。「記録を確認」から編集できます。');}
  catch(error){scoreReadStatus('自動保存できませんでした：'+error.message+' 下の確認・修正欄で直して保存してください。');}
 }catch(e){if(state.active){form.querySelector('.error').textContent=e.message||'読み込みに失敗しました。';scoreReadStatus('');}}finally{button.disabled=false;const next=$('#score-open-records');if(next)next.disabled=false;if(state.worker){await state.worker.terminate().catch(()=>{});state.worker=null;}}
}
function matchScoreMember(id,name){const people=(data.users||[]).filter(m=>m.role==='member');if(id){const found=people.find(m=>m.id===String(id).trim());if(found)return found.id;}const matches=people.filter(m=>normalizeScoreName(m.name)===normalizeScoreName(name));return matches.length===1?matches[0].id:'';}
function scoreRowsFromMatrix(matrix,rid){
 const header=matrix.findIndex(row=>row.some(c=>['name','user_id'].includes(scoreHeaderKey(c)))&&row.some(c=>scoreFields.some(([k])=>k===scoreHeaderKey(c))));
 if(header<0)throw Error('列見出しを確認してください。「氏名」または「会員ID」と「得点」などの見出しが必要です。');
 const keys=matrix[header].map(scoreHeaderKey),used=keys.filter(Boolean);if(new Set(used).size!==used.length)throw Error('同じ記録の見出しが複数あります。列名を確認してください。');
 const rows=[];for(const line of matrix.slice(header+1)){if(!line.some(v=>String(v).trim()))continue;const record={};keys.forEach((key,i)=>{if(key)record[key]=String(line[i]??'').trim();});if(record.result_id&&record.result_id!==rid)throw Error('別の試合IDの行が含まれています。この試合の行だけのCSVを選択してください。');if(!record.name&&!record.user_id)continue;if(record.participation==='出場なし')record.participation='ベンチ（出場なし）';rows.push({...record,user_id:matchScoreMember(record.user_id,record.name),source:line.join(' ／ '),include:true});}
 if(rows.length>50)throw Error('1試合につき50名まで読み込めます。');return rows;
}
function scoreRowsFromText(text){
 const people=(data.users||[]).filter(m=>m.role==='member'),lines=text.normalize('NFKC').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let order=null;const rows=[];
 for(const line of lines){
  const cells=line.split(/[\t,\s]+/).filter(Boolean),keys=cells.map(scoreHeaderKey),numericKeys=keys.filter(k=>k==='number'||scoreFields.some(([f])=>f===k));
  if(numericKeys.length>=2){order=numericKeys;continue;}
  const compact=normalizeScoreName(line),matches=people.filter(m=>compact.includes(normalizeScoreName(m.id))||compact.includes(normalizeScoreName(m.name)));
  if(!matches.length)continue;const member=matches.length===1?matches[0]:null;let remainder=line;
  if(member){const tokens=member.name.normalize('NFKC').split(/\s+/).filter(Boolean);for(const token of [member.id,...tokens])remainder=remainder.replace(token,'');}
  const numbers=remainder.match(/\b\d{1,3}\b/g)||[];
  const row={user_id:member?.id||'',name:member?.name||line,source:line,include:true,participation:line.includes('出場なし')?'ベンチ（出場なし）':'未確認'};
  if(order&&numbers.length===order.length){order.forEach((key,i)=>row[key]=numbers[i]);row.caution='文字認識の数値を元資料と照合してください。';}
  else {row.caution='列や数値の位置を特定できませんでした。元資料を確認してください。';}
  if(!rows.some(r=>r.source===line))rows.push(row);
 }
 if(rows.length>50)throw Error('読み取った候補が50行を超えています。選手の表だけに画像を切り取ってください。');return rows;
}
function renderScoreReview(state){
 const members=(data.users||[]).filter(m=>m.role==='member');
 $('#score-import-review').innerHTML=`<details><summary>読み取った元の文字を確認</summary><pre class="score-extracted-text">${esc(state.text||'文字を読み取れませんでした。')}</pre></details>${!state.rows.length?'<p class="error">選手の行を特定できませんでした。写真を鮮明に撮り直すか、氏名・得点などの見出しがあるCSVで書き出してください。</p>':`<h3>確認・修正（${state.rows.length}名）</h3><p class="hint">氏名と数値を元資料と照合してください。空欄は既存の値を保持します。ファイルにない選手の記録も残します。</p><form onsubmit="saveImportedScore(event)">${state.rows.map((r,i)=>{const old=(data.game_stats?.rows||[]).find(x=>x.result_id===state.id&&x.user_id===r.user_id);return `<fieldset class="card score-import-player"><legend><label><input type="checkbox" name="include_${i}" checked> この行を取り込む</label></legend><p class="hint">元の行：${esc(r.source)}</p>${r.caution?`<p class="hint">${esc(r.caution)}</p>`:''}<label class="field">対応する会員<select name="user_${i}"><option value="">選手を選択してください</option>${members.map(m=>`<option value="${esc(m.id)}" ${r.user_id===m.id?'selected':''}>${esc(m.name)}（${esc(m.id)}）</option>`).join('')}</select></label><div class="form-grid">${field('背番号','number_'+i,r.number||'','text',false)}${selectField('出場状況','participation_'+i,['未確認','出場',['ベンチ（出場なし）','出場なし']],(r.participation&&r.participation!=='未確認'?r.participation:old?.participation)||'未確認')}${scoreFields.map(([k,label])=>`${scoreNumberControl(label,k+'_'+i,r[k])}`).join('')}</div></fieldset>`;}).join('')}<label class="check-row"><input type="checkbox" required> 選手・試合・数値を元資料と照合しました</label><p class="hint">保存すると、この試合の個人記録は下書きになります。確認後に「記録を確認・公開」から公開範囲を設定してください。試合の最終得点は変更しません。</p><div class="error" role="alert"></div><button class="lime">確認した内容を下書き保存</button></form>`}`;
}
async function saveImportedScore(ev){
 ev.preventDefault();const state=scoreImportSession;if(!state?.active)return;const f=new FormData(ev.target),old=(data.game_stats?.rows||[]).filter(r=>r.result_id===state.id),byid=new Map(old.map(r=>[r.user_id,{...r}])),seen=new Set();
 try{
  state.rows.forEach((r,i)=>{if(!f.has('include_'+i))return;const uid=f.get('user_'+i);if(!uid)throw Error('取り込む行の会員を選択してください。');if(seen.has(uid))throw Error('同じ選手が複数行あります。重複する行のチェックを外してください。');seen.add(uid);const existing=byid.get(uid)||{},entry={...existing,user_id:uid,participation:f.get('participation_'+i),starter:existing.starter||false};for(const key of ['number',...scoreFields.map(([k])=>k)]){const value=f.get(key+'_'+i);if(value!=='')entry[key]=value;}byid.set(uid,entry);});
  if(!seen.size)throw Error('取り込む行を1件以上選んでください。');
  await submit(ev,'game_stats',{result_id:state.id,visibility:'draft',entries:[...byid.values()]},'スコアを下書き保存し、Excelを更新しました。');
 }catch(e){ev.target.querySelector('.error').textContent=e.message;}
}

async function autoSaveScoreImport(state){
 if(!state.rows.length)throw Error('選手の記録を読み取れませんでした。');
 const byid=new Map((data.game_stats?.rows||[]).filter(r=>r.result_id===state.id).map(r=>[r.user_id,{...r}])),seen=new Set();
 for(const r of state.rows){
  if(!r.user_id)throw Error('対応する会員を選択してください。');
  if(seen.has(r.user_id))throw Error('同じ選手の行が重複しています。');seen.add(r.user_id);
  const old=byid.get(r.user_id)||{},entry={...old,user_id:r.user_id,starter:old.starter||false,participation:r.participation||old.participation||'未確認'};
  if(entry.participation==='出場なし')entry.participation='ベンチ（出場なし）';
  if(entry.starter&&entry.participation==='未確認')entry.participation='出場';
  for(const key of ['number',...scoreFields.map(([k])=>k)])if(r[key]!=null&&r[key]!=='')entry[key]=r[key];
  byid.set(r.user_id,entry);
 }
 await api('game_stats',{result_id:state.id,visibility:'draft',entries:[...byid.values()]});
 data=await api('data');$('#modal').dataset.editToken=data.edit_token||'';state.saved=true;
}

async function readScoreFile(ev){ev.preventDefault();const input=ev.target.elements.scorefile,files=[...input.files],state=scoreImportSession;if(files.length>30){toast('最大30件までです。');return;}ev.submitter.disabled=true;input.disabled=true;try{for(const file of files){if(!state.active)break;if(state.readFiles.has(uploadFileKey(file)))continue;await readScoreFileOne({preventDefault(){},target:ev.target,submitter:ev.submitter,uploadFile:file});ev.submitter.disabled=true;if(ev.target.querySelector('.error').textContent)break;}}finally{input.disabled=false;ev.submitter.disabled=false;}}
