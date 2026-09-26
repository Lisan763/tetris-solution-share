import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=path.join(project,'release','Tetris-Solution-Share.html');
const output=path.join(project,'test-output');
const binary='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await access(binary);await access(release);await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(output,'browser-profile-'));
const child=spawn(binary,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--disable-background-networking','--disable-sync','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
{windowsHide:true,stdio:['ignore','ignore','pipe'],shell:false});
let stderr='';child.stderr.on('data',c=>{stderr=(stderr+c).slice(-6000);});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let ws:WebSocket|undefined,seq=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(v:any)=>void;timer:ReturnType<typeof setTimeout>}>();
const exceptions:any[]=[],requests:string[]=[];
function call(method:string,params:any={},sessionId?:string):Promise<any>{
  const id=++seq;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},10000);
    pending.set(id,{resolve,reject,timer});ws!.send(JSON.stringify({id,method,params,sessionId}));
  });
}
try{
  let portFile='';
  for(let i=0;i<100;i++){try{portFile=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await sleep(100);}}
  if(!portFile)throw new Error('No Edge debug endpoint: '+stderr);
  const [port,endpoint]=portFile.trim().split(/\r?\n/);
  ws=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise<void>((resolve,reject)=>{ws!.onopen=()=>resolve();ws!.onerror=reject;});
  ws.onmessage=e=>{
    const m=JSON.parse(String(e.data));
    if(m.id){const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params);
    else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);
  };
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const send=(method:string,params:any={})=>call(method,params,sessionId);
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:pathToFileURL(release).href});await send('Page.bringToFront');
  const evaluate=async(expression:string)=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const wait=async(expression:string)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}throw new Error('Page did not satisfy: '+expression);};
  await wait("document.getElementById('code-gif') && document.querySelectorAll('#keybindings .binding').length===10");
  assert.equal(await evaluate("location.protocol"),'file:');
  assert.equal(await evaluate("matchMedia('(max-width:720px)').matches"),true);
  assert.equal(await evaluate("document.querySelectorAll('#touch-controls button').length"),8);
  assert.ok(await evaluate("parseFloat(getComputedStyle(document.querySelector('#touch-controls button')).minHeight)>=48"));

  assert.equal(await evaluate("document.getElementById('language-select').options.length"),4);
  await evaluate("document.getElementById('language-select').value='en';document.getElementById('language-select').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('.setup h2').textContent"),'1. Position');
  await evaluate("document.getElementById('language-select').value='ja';document.getElementById('language-select').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('.setup h2').textContent"),'1. 盤面を入力');
  await evaluate("document.getElementById('language-select').value='ko';document.getElementById('language-select').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('.setup h2').textContent"),'1. 필드 입력');
  await evaluate("document.getElementById('language-select').value='zh-CN';document.getElementById('language-select').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('.setup h2').textContent"),'1. 输入局面');

  const defaultRows=await evaluate("[...document.querySelectorAll('#keybindings .binding')].map(r=>r.textContent)");
  assert.match(defaultRows[0],/←/); assert.match(defaultRows[0],/Numpad4/);
  assert.match(defaultRows[3],/Space/); assert.match(defaultRows[3],/Numpad8/);
  assert.match(defaultRows[4],/Ctrl/); assert.match(defaultRows[4],/Z/); assert.match(defaultRows[4],/Numpad3/); assert.match(defaultRows[4],/Numpad7/);
  assert.match(defaultRows[5],/↑/); assert.match(defaultRows[5],/X/); assert.match(defaultRows[5],/Numpad1/); assert.match(defaultRows[5],/Numpad5/); assert.match(defaultRows[5],/Numpad9/);
  assert.match(defaultRows[7],/Shift/); assert.match(defaultRows[7],/C/); assert.match(defaultRows[7],/Numpad0/);

  await evaluate("document.querySelectorAll('#keybindings .binding')[5].querySelector('.key-value').click()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyV',key:'v',windowsVirtualKeyCode:86});
  await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyV',key:'v',windowsVirtualKeyCode:86});
  const cwBindings=await evaluate("JSON.parse(localStorage.getItem('tss.bindings')).cw");
  assert.equal(cwBindings[0],'KeyV');
  assert.ok(cwBindings.includes('KeyX'));
  assert.ok(cwBindings.includes('Numpad9'));
  await evaluate("document.getElementById('gif-resolution').value='high';document.getElementById('gif-resolution').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("localStorage.getItem('tss.gifResolution')"),'high');

  // User settings must survive closing/reopening the page (reload in the same profile).
  await send('Page.reload',{ignoreCache:true});
  await wait("document.getElementById('gif-resolution') && document.querySelectorAll('#keybindings .binding').length===10");
  assert.equal(await evaluate("document.getElementById('gif-resolution').value"),'high');
  const persistedCw=await evaluate("JSON.parse(localStorage.getItem('tss.bindings')).cw");
  assert.equal(persistedCw[0],'KeyV');
  assert.ok(persistedCw.includes('KeyX'));
  assert.ok(persistedCw.includes('Numpad9'));

  await evaluate("document.getElementById('current').value='T';document.getElementById('hold').value='Z';document.getElementById('next').value='IJLOS';document.getElementById('start').click()");
  const key=async(type:string,code:string,k:string,vk:number)=>send('Input.dispatchKeyEvent',{type,code,key:k,windowsVirtualKeyCode:vk});
  await key('keyDown','ArrowLeft','ArrowLeft',37);await key('keyUp','ArrowLeft','ArrowLeft',37);
  await key('keyDown','KeyV','v',86);await key('keyUp','KeyV','v',86);
  await key('keyDown','Numpad8','8',104);await key('keyUp','Numpad8','8',104);
  await wait("document.getElementById('piece-count').textContent==='1 块'");

  await evaluate("document.getElementById('make-code').click()");
  const code=await evaluate("document.getElementById('share-code').value");
  assert.match(code,/^TSS1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  const before=await evaluate("document.getElementById('board').toDataURL()");
  await evaluate("document.getElementById('reset').click();document.getElementById('load-code').click()");
  await wait("document.getElementById('piece-count').textContent==='1 块'");
  assert.equal(await evaluate("document.getElementById('board').toDataURL()"),before);

  await evaluate("globalThis.__codeGif=null;const old=URL.createObjectURL.bind(URL);URL.createObjectURL=(blob)=>{if(blob.type==='image/gif')globalThis.__codeGif=blob;return old(blob)};document.getElementById('code-gif').click()");
  await wait("globalThis.__codeGif instanceof Blob");
  const gif=await evaluate("(async()=>{const blob=globalThis.__codeGif;const bytes=new Uint8Array(await blob.arrayBuffer());const url=URL.createObjectURL(blob);try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({header:String.fromCharCode(...bytes.slice(0,6)),size:bytes.length,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error('decode'));img.src=url})}finally{URL.revokeObjectURL(url)}})()");
  assert.equal(gif.header,'GIF89a');assert.ok(gif.size>1000);assert.equal(gif.width,414);

  await evaluate("document.getElementById('next').value='I';document.getElementById('start').click();document.querySelector('#touch-controls [data-input=drop]').click()");
  await wait("document.getElementById('piece-count').textContent==='1 块'");
  await evaluate("document.querySelector('#touch-controls [data-input=drop]').click()");
  await wait("document.getElementById('piece-count').textContent==='2 块'");
  await evaluate("document.getElementById('undo').click()");
  await wait("document.getElementById('piece-count').textContent==='1 块'");
  assert.deepEqual(requests.filter(url=>/^https?:/i.test(url)),[]);
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(path.join(output,'standalone-code.png'),Buffer.from(shot.data,'base64'));
  console.log(JSON.stringify({ok:true,checks:['file:// standalone','one HTML with zh/en/ja/ko','mobile responsive layout','8 virtual controls','TETR.IO multi-key defaults','custom bindings persist after reload','GIF resolution persists after reload','high GIF renders at 3x width','manual solve via Numpad8','TSS1 code + checksum','code reload exact board','Code → GIF decodes','virtual drop and undo','zero HTTP(S)','zero JS exceptions']},null,2));
}finally{
  if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close');}catch{}ws.close();}
  child.kill();for(const p of pending.values())clearTimeout(p.timer);
}
