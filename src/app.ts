import type { PieceName } from './tetris';
import { SolutionSession, type Input, type SharePosition, type ShareView } from './session';
import { HandlingController, RepeatCommandController, DEFAULT_HANDLING } from './handling';
import { GIF_RESOLUTIONS, sessionGifBytes, type GifResolution } from './share-gif';
import { encodeShareCode, sessionFromShareCode } from './share-code';
import { I18N, detectLanguage, formatMessage, type Language } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const colours: Record<string,string> = {
  I:'#65c9d8',J:'#759af0',L:'#eeb47b',O:'#e6d17a',S:'#85cf9c',T:'#c5a0eb',Z:'#e68b9b',G:'#718198',
};
const miniShapes: Record<string,Array<[number,number]>> = {
  I:[[0,1],[1,1],[2,1],[3,1]], J:[[0,0],[0,1],[1,1],[2,1]], L:[[2,0],[0,1],[1,1],[2,1]],
  O:[[1,0],[2,0],[1,1],[2,1]], S:[[1,0],[2,0],[0,1],[1,1]], T:[[1,0],[0,1],[1,1],[2,1]], Z:[[0,0],[1,0],[1,1],[2,1]],
};

const gameActions = ['left','right','down','drop','ccw','cw','half','hold'] as const;
const commandActions = ['undo','reset'] as const;
type GameAction = typeof gameActions[number];
type CommandAction = typeof commandActions[number];
type Action = GameAction | CommandAction;

// TETR.IO-style desktop defaults from the user's reference image.
// Logical Control / Shift bindings accept either left or right modifier key.
const defaultBindings: Record<Action,string[]> = {
  left:['ArrowLeft','Numpad4'],
  right:['ArrowRight','Numpad6'],
  down:['ArrowDown','Numpad2'],
  drop:['Space','Numpad8'],
  ccw:['Control','KeyZ','Numpad3','Numpad7'],
  cw:['ArrowUp','KeyX','Numpad1','Numpad5','Numpad9'],
  half:['KeyA'],
  hold:['Shift','KeyC','Numpad0'],
  undo:['Backspace'],
  reset:['KeyR'],
};
const actions = Object.keys(defaultBindings) as Action[];
type Bindings = Record<Action,string[]>;

let language: Language = (() => {
  try {
    const saved = localStorage.getItem('tss.language') as Language | null;
    if (saved && saved in I18N) return saved;
  } catch {}
  return detectLanguage();
})();
let gifResolution: GifResolution = (() => {
  try {
    const saved = localStorage.getItem('tss.gifResolution') as GifResolution | null;
    if (saved && (GIF_RESOLUTIONS as readonly string[]).includes(saved)) return saved;
  } catch {}
  return 'medium';
})();
const t = (key:string, values:Record<string,string|number> = {}) =>
  formatMessage(I18N[language][key] ?? I18N.en[key] ?? key, values);

function cloneDefaultBindings(): Bindings {
  return Object.fromEntries(actions.map(action => [action, [...defaultBindings[action]]])) as Bindings;
}
function loadBindings(): Bindings {
  const result = cloneDefaultBindings();
  try {
    const saved = JSON.parse(localStorage.getItem('tss.bindings') || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
    const used = new Set<string>();
    for (const action of actions) {
      const raw = saved[action];
      const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null;
      if (!values) {
        for (const code of result[action]) used.add(code);
        continue;
      }
      const clean: string[] = [];
      for (const code of values) {
        if (typeof code !== 'string' || !code || code.length > 32 || used.has(code) || clean.includes(code)) continue;
        clean.push(code); used.add(code);
      }
      result[action] = clean;
    }
  } catch { /* storage is optional */ }
  return result;
}
function saveBindings() {
  try { localStorage.setItem('tss.bindings', JSON.stringify(bindings)); } catch {}
}
let bindings = loadBindings();
let waiting: { action: Action; index: number | null } | null = null;

let editor = Array.from({length:20},()=> '..........');
let drawing = false;
let drawKind = 'G';
let session: SolutionSession | null = null;

const editorCanvas = $('editor') as HTMLCanvasElement;
const editorCtx = editorCanvas.getContext('2d')!;
const boardCanvas = $('board') as HTMLCanvasElement;
const boardCtx = boardCanvas.getContext('2d')!;

function status(id:string,text:string,error=false) {
  const node=$(id);
  node.textContent=text;
  node.className='status'+(error?' error':'');
}
function localizedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Code 校验|Code 缺少校验码|不是 Tetris Solution Share Code|Code 内容|Code 中|Base64/.test(message)) return t('invalidCode');
  if (/场地|Current|Hold|Next|局面/.test(message)) return t('invalidPosition');
  return message;
}
function normalizePhysicalCode(event: KeyboardEvent): string {
  if (event.key === 'Control') return 'Control';
  if (event.key === 'Shift') return 'Shift';
  return event.code;
}
function keyName(code:string) {
  const map: Record<string,string> = {
    ArrowLeft:'←',ArrowRight:'→',ArrowDown:'↓',ArrowUp:'↑',
    Space:'Space',Backspace:'Backspace',Control:'Ctrl',Shift:'Shift',
  };
  if (map[code]) return map[code];
  if (/^Numpad\d$/.test(code)) return 'Numpad' + code.slice(-1);
  return code.replace(/^Key/,'').replace(/^Digit/,'');
}
function isGameAction(action:Action): action is GameAction {
  return (gameActions as readonly string[]).includes(action);
}
function firstBinding(action:Action) {
  const list=bindings[action];
  if (!list.length) return t('unbound');
  return list.length <= 2 ? list.map(keyName).join(' / ') : keyName(list[0]) + ` +${list.length-1}`;
}

function applyStaticLanguage() {
  document.documentElement.lang = language;
  ($('language-select') as HTMLSelectElement).value = language;
  ($('gif-resolution') as HTMLSelectElement).value = gifResolution;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => {
    node.textContent = t(node.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach(node => {
    (node as HTMLInputElement | HTMLTextAreaElement).placeholder = t(node.dataset.i18nPlaceholder!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(node => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria!));
  });
}

function drawEditor() {
  const s=20;
  editorCanvas.width=200;
  editorCanvas.height=400;
  for(let y=0;y<20;y++)for(let x=0;x<10;x++){
    const kind=editor[y][x];
    editorCtx.fillStyle=kind==='.'?'#080d16':colours[kind]||colours.G;
    editorCtx.fillRect(x*s,y*s,s,s);
    editorCtx.strokeStyle='#26364c';
    editorCtx.strokeRect(x*s,y*s,s,s);
  }
}
function editAt(event:PointerEvent) {
  const rect=editorCanvas.getBoundingClientRect();
  const x=Math.floor((event.clientX-rect.left)/rect.width*10);
  const y=Math.floor((event.clientY-rect.top)/rect.height*20);
  if(x<0||x>=10||y<0||y>=20)return;
  const row=[...editor[y]];
  row[x]=drawKind;
  editor[y]=row.join('');
  drawEditor();
}
editorCanvas.oncontextmenu=e=>e.preventDefault();
editorCanvas.onpointerdown=e=>{
  e.preventDefault();
  drawing=true;
  drawKind=e.button===2?'.':($('brush') as HTMLSelectElement).value;
  editorCanvas.setPointerCapture(e.pointerId);
  editAt(e);
};
editorCanvas.onpointermove=e=>{if(drawing)editAt(e);};
editorCanvas.onpointerup=editorCanvas.onpointercancel=editorCanvas.onlostpointercapture=()=>{drawing=false;};
$('clear-board').onclick=()=>{editor=Array.from({length:20},()=> '..........');drawEditor();};

function square(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,colour:string,ghost=false){
  ctx.fillStyle=ghost?colour+'44':colour;
  ctx.fillRect(x+1,y+1,size-2,size-2);
  if(!ghost){
    ctx.fillStyle='rgba(255,255,255,.14)';
    ctx.fillRect(x+2,y+2,size-4,3);
  }
}
function mini(canvas:HTMLCanvasElement,kinds:Array<PieceName|null>) {
  const ctx=canvas.getContext('2d')!;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#0b111c';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  kinds.forEach((kind,index)=>{
    if(!kind)return;
    const scale=14,bx=8,by=8+index*55;
    for(const [x,y] of miniShapes[kind]) square(ctx,bx+x*scale,by+y*scale,scale,colours[kind]);
  });
}
function render(view:ShareView) {
  const cell=24;
  const expanded=view.board.slice(0,16).some(row=>row.some(Boolean))||view.activeCells.some(([,y])=>y<16);
  const top=expanded?0:16;
  boardCanvas.width=240;
  boardCanvas.height=(40-top)*cell;
  boardCtx.fillStyle='#080d16';
  boardCtx.fillRect(0,0,boardCanvas.width,boardCanvas.height);
  boardCtx.strokeStyle='#192233';
  boardCtx.lineWidth=.5;
  for(let x=0;x<=10;x++){
    boardCtx.beginPath();boardCtx.moveTo(x*cell,0);boardCtx.lineTo(x*cell,boardCanvas.height);boardCtx.stroke();
  }
  for(let y=0;y<=40-top;y++){
    boardCtx.beginPath();boardCtx.moveTo(0,y*cell);boardCtx.lineTo(boardCanvas.width,y*cell);boardCtx.stroke();
  }
  for(let y=top;y<40;y++)for(let x=0;x<10;x++){
    const kind=view.board[y][x];
    if(kind)square(boardCtx,x*cell,(y-top)*cell,cell,colours[kind]||colours.G);
  }
  for(const [x,y] of view.ghostCells) if(y>=top) square(boardCtx,x*cell,(y-top)*cell,cell,colours[view.active?.kind||'G'],true);
  for(const [x,y] of view.activeCells) if(y>=top) square(boardCtx,x*cell,(y-top)*cell,cell,colours[view.active?.kind||'G']);
  mini($('hold-view') as HTMLCanvasElement,[view.hold]);
  mini($('next-view') as HTMLCanvasElement,view.next);
  $('piece-count').textContent=t('pieces',{n:view.placements});
  $('known-count').textContent=String(session?.remainingNext??0);
  $('frame-count').textContent=String(Math.max(0,(session?.frames.length??1)-1));
  ($('undo') as HTMLButtonElement).disabled=!session?.canUndo;
  ($('export-gif') as HTMLButtonElement).disabled=(session?.frames.length??0)<2;
  if(view.ended){
    status('game-status',view.hold?t('endedHold'):t('ended'));
  } else {
    status('game-status',t('running',{piece:view.active?.kind??'',n:session?.remainingNext??0}));
  }
}

function positionFromEditor():SharePosition {
  return {
    board:[...editor],
    current:($('current') as HTMLSelectElement).value as PieceName,
    hold:(($('hold') as HTMLSelectElement).value||null) as PieceName|null,
    next:($('next') as HTMLInputElement).value,
    canHold:($('can-hold') as HTMLInputElement).checked,
  };
}
function loadPosition(position:SharePosition) {
  editor=[...position.board];
  while(editor.length<20)editor.unshift('..........');
  ($('current') as HTMLSelectElement).value=position.current;
  ($('hold') as HTMLSelectElement).value=position.hold??'';
  ($('next') as HTMLInputElement).value=Array.isArray(position.next)?position.next.join(''):position.next;
  ($('can-hold') as HTMLInputElement).checked=position.canHold!==false;
  drawEditor();
}
function begin(position=positionFromEditor()) {
  try{
    session=new SolutionSession(position);
    releaseAllSources();
    render(session.view());
    boardCanvas.focus();
    status('setup-status',t('setupLoaded'));
  }catch(error){
    status('setup-status',localizedError(error),true);
  }
}
$('start').onclick=()=>begin();

function doAction(input:Input):boolean {
  if(!session)return false;
  const ok=session.action(input);
  if(ok)render(session.view());
  return ok;
}
const handling=new HandlingController(DEFAULT_HANDLING,input=>doAction(input));
function command(name:CommandAction){
  if(!session)return;
  if(name==='undo'){if(session.undo())render(session.view());return;}
  session.reset();render(session.view());
}
const repeat=new RepeatCommandController<CommandAction>(command);

// Multiple physical keys can hold the same action simultaneously.
const sourceToAction=new Map<string,Action>();
const actionSources=new Map<Action,Set<string>>();
function pressSource(action:Action,source:string,time:number) {
  if(sourceToAction.has(source))return;
  sourceToAction.set(source,action);
  let sources=actionSources.get(action);
  if(!sources){sources=new Set();actionSources.set(action,sources);}
  const wasEmpty=sources.size===0;
  sources.add(source);
  if(!wasEmpty)return;
  if(isGameAction(action))handling.press(action,time);
  else repeat.press(action,time);
}
function releaseSource(source:string,time:number) {
  const action=sourceToAction.get(source);
  if(!action)return;
  sourceToAction.delete(source);
  const sources=actionSources.get(action);
  sources?.delete(source);
  if(sources?.size)return;
  actionSources.delete(action);
  if(isGameAction(action))handling.release(action,time);
  else repeat.release(action);
}
function releaseAllSources() {
  sourceToAction.clear();actionSources.clear();handling.releaseAll();repeat.releaseAll();
}

function bindHoldButton(button:HTMLButtonElement,input:GameAction){
  button.onpointerdown=e=>{
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    pressSource(input,`touch:${input}:${e.pointerId}`,performance.now());
  };
  const release=(e:PointerEvent)=>releaseSource(`touch:${input}:${e.pointerId}`,performance.now());
  button.onpointerup=release;
  button.onpointercancel=release;
  button.onlostpointercapture=release;
  button.onclick=e=>{if(e.detail===0)handling.tap(input);};
}
function bindCommandButton(button:HTMLButtonElement,name:CommandAction){
  button.onpointerdown=e=>{
    if(button.disabled)return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    pressSource(name,`cmd:${name}:${e.pointerId}`,performance.now());
  };
  const release=(e:PointerEvent)=>releaseSource(`cmd:${name}:${e.pointerId}`,performance.now());
  button.onpointerup=release;
  button.onpointercancel=release;
  button.onlostpointercapture=release;
  button.onclick=e=>{if(e.detail===0&&!button.disabled)command(name);};
}
bindCommandButton($('undo') as HTMLButtonElement,'undo');
bindCommandButton($('reset') as HTMLButtonElement,'reset');

function findBinding(code:string): Action | null {
  for(const action of actions) if(bindings[action].includes(code)) return action;
  return null;
}
function duplicateBinding(code:string,except?:{action:Action;index:number|null}):Action|null {
  for(const action of actions) {
    for(let index=0;index<bindings[action].length;index++) {
      if(except && action===except.action && index===except.index)continue;
      if(bindings[action][index]===code)return action;
    }
  }
  return null;
}
function renderBindings(){
  const wrap=$('keybindings');
  wrap.replaceChildren();
  for(const action of actions){
    const row=document.createElement('div');row.className='binding';
    const label=document.createElement('span');label.textContent=t(action);
    const keys=document.createElement('div');keys.className='binding-keys';
    if(!bindings[action].length){
      const none=document.createElement('span');none.className='muted';none.textContent=t('unbound');keys.append(none);
    }
    bindings[action].forEach((code,index)=>{
      const token=document.createElement('span');token.className='key-token';
      const key=document.createElement('button');key.className='key-value';
      const isWaiting=waiting?.action===action&&waiting.index===index;
      key.textContent=isWaiting?t('waitingKey'):keyName(code);
      if(isWaiting)key.classList.add('waiting');
      key.onclick=()=>{releaseAllSources();waiting={action,index};renderBindings();};
      const remove=document.createElement('button');remove.className='key-remove';remove.textContent='×';remove.title=t('removeKey');
      remove.onclick=()=>{bindings[action].splice(index,1);saveBindings();releaseAllSources();waiting=null;renderBindings();};
      token.append(key,remove);keys.append(token);
    });
    const add=document.createElement('button');add.className='key-add';
    const addWaiting=waiting?.action===action&&waiting.index===null;
    add.textContent=addWaiting?t('waitingKey'):t('addKey');
    if(addWaiting)add.classList.add('waiting');
    add.onclick=()=>{releaseAllSources();waiting={action,index:null};renderBindings();};
    keys.append(add);
    row.append(label,keys);wrap.append(row);
  }
  ($('undo') as HTMLButtonElement).textContent=`${t('undo')} [${firstBinding('undo')}]`;
  ($('reset') as HTMLButtonElement).textContent=`${t('reset')} [${firstBinding('reset')}]`;
}
function renderTouch(){
  const wrap=$('touch-controls');wrap.replaceChildren();
  const defs:Array<[GameAction,string,string?]>=[
    ['left','←'],['down','↓'],['right','→'],['drop','DROP','drop'],
    ['ccw','↶'],['half','180°','action'],['cw','↷'],['hold','HOLD','action'],
  ];
  for(const [input,text,className] of defs){
    const button=document.createElement('button');button.textContent=text;button.dataset.input=input;
    if(className)button.className=className;
    bindHoldButton(button,input);wrap.append(button);
  }
}

document.addEventListener('keydown',event=>{
  if(waiting){
    event.preventDefault();
    if(event.code==='Escape'){waiting=null;renderBindings();return;}
    if(event.key==='Meta')return;
    const code=normalizePhysicalCode(event);
    if(!code)return;
    const duplicate=duplicateBinding(code,waiting);
    if(duplicate){
      status('game-status',t('duplicateKey',{action:t(duplicate)}),true);
      return;
    }
    if(waiting.index===null)bindings[waiting.action].push(code);
    else bindings[waiting.action][waiting.index]=code;
    saveBindings();waiting=null;renderBindings();return;
  }
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes((event.target as HTMLElement).tagName)||event.metaKey||event.altKey)return;
  const code=normalizePhysicalCode(event);
  const action=findBinding(code);
  if(!action)return;
  event.preventDefault();
  if(event.repeat)return;
  pressSource(action,'key:'+code,performance.now());
});
document.addEventListener('keyup',event=>{
  const code=normalizePhysicalCode(event);
  releaseSource('key:'+code,performance.now());
});
window.addEventListener('blur',releaseAllSources);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllSources();});

function downloadGif(source:SolutionSession,filename='tetris-solution.gif'){
  const bytes=sessionGifBytes(source,gifResolution);
  const payload=Uint8Array.from(bytes);
  const url=URL.createObjectURL(new Blob([payload.buffer],{type:'image/gif'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return bytes.length;
}
$('export-gif').onclick=()=>{
  try{
    if(!session)throw new Error(t('noSolution'));
    const size=downloadGif(session);
    status('code-status',t('gifGenerated',{kb:Math.max(1,Math.round(size/1024))}));
  }catch(error){status('code-status',localizedError(error),true);}
};

function codeText(){return ($('share-code') as HTMLTextAreaElement).value.trim();}
function putCode(value:string){
  const area=$('share-code') as HTMLTextAreaElement;area.value=value;area.scrollTop=0;
}
$('make-code').onclick=()=>{
  try{
    if(!session)throw new Error(t('needSession'));
    const code=encodeShareCode(session);putCode(code);
    status('code-status',t('codeGenerated',{n:code.length}));
  }catch(error){status('code-status',localizedError(error),true);}
};
$('copy-code').onclick=async()=>{
  try{
    let code=codeText();
    if(!code){
      if(!session)throw new Error(t('noCopyCode'));
      code=encodeShareCode(session);putCode(code);
    }
    let copied=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);copied=true;}}catch{}
    if(!copied){
      const area=$('share-code') as HTMLTextAreaElement;area.focus();area.select();copied=document.execCommand('copy');
    }
    if(!copied)throw new Error(t('copyManual'));
    status('code-status',t('codeCopied'));
  }catch(error){status('code-status',localizedError(error),true);}
};
const systemShareCode=$('share-code-system') as HTMLButtonElement;
systemShareCode.hidden=typeof navigator.share!=='function';
systemShareCode.onclick=async()=>{
  try{
    let code=codeText();
    if(!code){
      if(!session)throw new Error(t('noShareCode'));
      code=encodeShareCode(session);putCode(code);
    }
    await navigator.share({title:t('shareTitleText'),text:code});
  }catch(error){
    if((error as DOMException).name!=='AbortError')status('code-status',localizedError(error),true);
  }
};
$('load-code').onclick=()=>{
  try{
    const restored=sessionFromShareCode(codeText());
    session=restored;loadPosition(restored.source);releaseAllSources();render(restored.view());
    boardCanvas.focus({preventScroll:true});
    status('code-status',t('codeLoaded',{n:Math.max(0,restored.frames.length-1)}));
  }catch(error){status('code-status',localizedError(error),true);}
};
$('code-gif').onclick=()=>{
  try{
    const restored=sessionFromShareCode(codeText());
    const size=downloadGif(restored,'tetris-solution-from-code.gif');
    status('code-status',t('codeGifDone',{kb:Math.max(1,Math.round(size/1024))}));
  }catch(error){status('code-status',localizedError(error),true);}
};

function applyLanguage() {
  applyStaticLanguage();
  renderBindings();
  renderTouch();
  if(session)render(session.view());
  else {
    $('piece-count').textContent=t('pieces',{n:0});
    status('game-status',t('gameInitial'));
  }
  status('code-status',t('codeDefault'));
  if(!session)status('setup-status',matchMedia('(max-width:720px)').matches?t('mobileMode'):'');
}
($('language-select') as HTMLSelectElement).onchange=event=>{
  language=(event.target as HTMLSelectElement).value as Language;
  try{localStorage.setItem('tss.language',language);}catch{}
  applyLanguage();
};
($('gif-resolution') as HTMLSelectElement).onchange=event=>{
  const value=(event.target as HTMLSelectElement).value as GifResolution;
  gifResolution=(GIF_RESOLUTIONS as readonly string[]).includes(value)?value:'medium';
  try{localStorage.setItem('tss.gifResolution',gifResolution);}catch{}
};

function loop(now:number){
  handling.tick(now);repeat.tick(now);requestAnimationFrame(loop);
}
drawEditor();
applyLanguage();
requestAnimationFrame(loop);
