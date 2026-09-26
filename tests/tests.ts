import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SolutionSession, normalizePosition } from '../src/session';
import { encodeIndexedGif } from '../src/gif';
import { sessionGifBytes } from '../src/share-gif';
import { encodeShareCode, decodeShareCode, sessionFromShareCode } from '../src/share-code';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blank = () => Array.from({ length:20 }, () => '..........');

test('finite Current + Next never invents a random tail', () => {
  const session = new SolutionSession({ board:blank(), current:'T', hold:null, next:'IJ' });
  session.action('drop'); session.action('drop'); session.action('drop');
  assert.equal(session.view().placements,3);
  assert.equal(session.view().active,null);
  assert.equal(session.remainingNext,0);
});

test('a known Hold can be used as the final finite resource', () => {
  const session = new SolutionSession({ board:blank(), current:'T', hold:'Z', next:'I' });
  session.action('drop');
  session.action('drop');
  assert.equal(session.view().active,null);
  assert.equal(session.view().hold,'Z');
  assert.equal(session.action('hold'),true);
  assert.equal(session.view().active?.kind,'Z');
  assert.equal(session.view().hold,null);
  assert.equal(session.action('drop'),true);
  assert.equal(session.view().placements,3);
});

test('whole-placement undo respects the active-piece boundary', () => {
  const session = new SolutionSession({ board:blank(), current:'T', hold:'Z', next:'IJ' });
  session.action('drop');
  const afterFirst = session.view();
  session.action('left'); session.action('cw'); session.action('down');
  assert.equal(session.undo(),true);
  assert.deepEqual(session.view(),afterFirst);
  assert.equal(session.undo(),true);
  assert.equal(session.view().placements,0);
});

test('Share Code round-trips field, complete known sequence and exact inputs', () => {
  const board = blank(); board[19]='GGGG..GGGG';
  const original = new SolutionSession({board,current:'T',hold:'Z',next:'IJLOS',canHold:true});
  for(const input of ['left','cw','drop','hold','right','drop'] as const) assert.equal(original.action(input),true);
  const code = encodeShareCode(original);
  assert.match(code,/^TSS1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  assert.ok(code.length<1000);
  const decoded = decodeShareCode(code);
  assert.equal(decoded.position.current,'T');
  assert.equal(decoded.position.hold,'Z');
  assert.equal(decoded.position.next,'IJLOS');
  assert.deepEqual(decoded.inputs,['left','cw','drop','hold','right','drop']);
  const restored = sessionFromShareCode(code);
  assert.deepEqual(restored.view(),original.view());
  assert.equal(restored.frames.length,original.frames.length);
});

test('Share Code checksum detects truncation or modification', () => {
  const valid = encodeShareCode(new SolutionSession({board:blank(),current:'T',hold:null,next:'I'}));
  const changed = valid.replace(/^TSS1:([A-Za-z0-9_-])/,(_,char)=>'TSS1:'+(char==='A'?'B':'A'));
  assert.throws(()=>decodeShareCode(changed),/校验失败/);
  assert.throws(()=>decodeShareCode(valid.slice(0,-2)),/校验/);
  assert.throws(()=>decodeShareCode('hello'),/TSS1/);
  const dot=valid.lastIndexOf('.');
  const wrapped=valid.slice(0,12)+'\n'+valid.slice(12,dot)+'\n'+valid.slice(dot);
  assert.doesNotThrow(()=>decodeShareCode(wrapped));
});

test('invalid field and unknown Next fail closed', () => {
  assert.throws(()=>normalizePosition({board:['.........X'],current:'T',hold:null,next:''}));
  assert.throws(()=>normalizePosition({board:blank(),current:'T',hold:null,next:'IJQ'}));
});

test('GIF encoder emits animated GIF89a', () => {
  const gif=encodeIndexedGif(2,2,[[0,0,0],[255,255,255],[255,0,0],[0,255,0]],[
    {pixels:Uint8Array.from([0,1,0,1]),delayCs:8},
    {pixels:Uint8Array.from([2,0,3,0]),delayCs:12},
  ]);
  assert.equal(Buffer.from(gif.subarray(0,6)).toString('ascii'),'GIF89a');
  assert.equal(gif.at(-1),0x3b);
});

test('GIF resolution low/medium/high renders at true 1x/2x/3x pixel sizes', () => {
  const session=new SolutionSession({board:blank(),current:'T',hold:null,next:'I'});
  session.action('drop');
  const low=sessionGifBytes(session,'low');
  const medium=sessionGifBytes(session,'medium');
  const high=sessionGifBytes(session,'high');
  const width=(gif:Uint8Array)=>gif[6] | (gif[7] << 8);
  const height=(gif:Uint8Array)=>gif[8] | (gif[9] << 8);
  assert.equal(width(low),138);
  assert.equal(width(medium),276);
  assert.equal(width(high),414);
  assert.equal(height(medium),height(low)*2);
  assert.equal(height(high),height(low)*3);
});

test('release HTML is a self-contained share tool with Code → GIF', async () => {
  const html=await readFile(path.join(project,'release','Tetris-Solution-Share.html'),'utf8');
  assert.match(html,/Tetris Solution Share/i);
  assert.match(html,/Copyright \(c\) 2026 Lisan763/);
  assert.match(html,/data-i18n="codeGif"/);
  assert.match(html,/TSS1:/);
  assert.match(html,/中文/);
  assert.match(html,/English/);
  assert.match(html,/日本語/);
  assert.match(html,/한국어/);
  assert.match(html,/id="gif-resolution"/);
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/<link[^>]+stylesheet/i);
  assert.doesNotMatch(html,/\/api\//);
  const htmlFiles=(await readdir(path.join(project,'release'))).filter(name=>name.toLowerCase().endsWith('.html'));
  assert.deepEqual(htmlFiles,['Tetris-Solution-Share.html']);
});
