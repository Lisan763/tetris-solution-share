import { encodeIndexedGif } from './gif';
import type { SolutionSession, ShareView } from './session';

export const GIF_RESOLUTIONS = ['low','medium','high'] as const;
export type GifResolution = typeof GIF_RESOLUTIONS[number];
const resolutionScale: Record<GifResolution,number> = {
  low: 6,
  medium: 12,
  high: 18,
};

const palette = [
  [8,13,22], [29,42,61], [91,116,146],
  [101,201,216], [117,154,240], [238,180,123], [230,209,122],
  [133,207,156], [197,160,235], [230,139,155], [113,129,152], [235,242,249],
];
const colourIndex: Record<string,number> = { I:3, J:4, L:5, O:6, S:7, T:8, Z:9, G:10 };
const miniShapes: Record<string,Array<[number,number]>> = {
  I:[[0,1],[1,1],[2,1],[3,1]], J:[[0,0],[0,1],[1,1],[2,1]], L:[[2,0],[0,1],[1,1],[2,1]],
  O:[[1,0],[2,0],[1,1],[2,1]], S:[[1,0],[2,0],[0,1],[1,1]], T:[[1,0],[0,1],[1,1],[2,1]], Z:[[0,0],[1,0],[1,1],[2,1]],
};
function render(view: ShareView, top: number, scale: number) {
  const rows = 40 - top, left = 6, gap = 1, right = 6;
  const width = (left + 10 + gap + right) * scale, height = rows * scale;
  const pixels = new Uint8Array(width * height);
  const rect = (cx:number,cy:number,w:number,h:number,c:number) => {
    const x0=Math.max(0,cx*scale), y0=Math.max(0,cy*scale), x1=Math.min(width,(cx+w)*scale), y1=Math.min(height,(cy+h)*scale);
    for(let y=y0;y<y1;y++) pixels.fill(c,y*width+x0,y*width+x1);
  };
  const cell = (cx:number,cy:number,c:number,ghost=false) => {
    if(cy<0||cy>=rows)return;
    rect(cx,cy,1,1,ghost?2:1);
    if(!ghost&&scale>2){const x0=cx*scale+1,y0=cy*scale+1;for(let y=y0;y<y0+scale-2;y++)pixels.fill(c,y*width+x0,y*width+x0+scale-2);}
  };
  for(let y=top;y<40;y++)for(let x=0;x<10;x++){const k=view.board[y][x];if(k)cell(left+x,y-top,colourIndex[k]??10);}
  for(const [x,y] of view.ghostCells)if(y>=top)cell(left+x,y-top,2,true);
  for(const [x,y] of view.activeCells)if(y>=top)cell(left+x,y-top,colourIndex[view.active?.kind??'']??11);
  const mini=(kind:string|null,bx:number,by:number)=>{if(!kind)return;for(const [x,y] of miniShapes[kind]??[])cell(bx+x,by+y,colourIndex[kind]??11);};
  mini(view.hold,1,2);
  view.next.slice(0,5).forEach((kind,i)=>mini(kind,left+10+gap+1,1+i*4));
  return {width,height,pixels};
}
export function sessionGifBytes(session: SolutionSession, resolution: GifResolution = 'medium'): Uint8Array {
  if (session.frames.length < 2) throw new Error('至少操作一步后才能导出 GIF。');
  const top = session.frames.some(f => f.view.board.slice(0,16).some(r=>r.some(Boolean)) || f.view.activeCells.some(([,y])=>y<16)) ? 0 : 16;
  const scale = resolutionScale[resolution] ?? resolutionScale.medium;
  const rendered = session.frames.map(frame => render(frame.view, top, scale));
  return encodeIndexedGif(rendered[0].width, rendered[0].height, palette,
    rendered.map((frame,i)=>({pixels:frame.pixels,delayCs:i===0?25:session.frames[i].locked?24:8})));
}
