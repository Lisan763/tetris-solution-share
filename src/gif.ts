export type GifIndexedFrame = { pixels: Uint8Array; delayCs: number };

// GIF89a writer adapted from Dean McNamee's MIT-licensed omggif encoder.
function outputLzw(buf: Uint8Array, start: number, minCodeSize: number, indexes: Uint8Array): number {
  let p = start;
  buf[p++] = minCodeSize;
  let subBlock = p++;
  const clearCode = 1 << minCodeSize, codeMask = clearCode - 1, eoiCode = clearCode + 1;
  let nextCode = eoiCode + 1, codeSize = minCodeSize + 1, shift = 0, bits = 0;
  const flush = (minimumBits: number) => {
    while (shift >= minimumBits) {
      buf[p++] = bits & 255; bits >>= 8; shift -= 8;
      if (p === subBlock + 256) { buf[subBlock] = 255; subBlock = p++; }
    }
  };
  const emit = (code: number) => { bits |= code << shift; shift += codeSize; flush(8); };
  let prefix = indexes[0] & codeMask;
  let table = new Map<number, number>();
  emit(clearCode);
  for (let i = 1; i < indexes.length; i++) {
    const symbol = indexes[i] & codeMask, key = (prefix << 8) | symbol, found = table.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode); nextCode = eoiCode + 1; codeSize = minCodeSize + 1; table = new Map();
    } else {
      if (nextCode >= (1 << codeSize)) codeSize++;
      table.set(key, nextCode++);
    }
    prefix = symbol;
  }
  emit(prefix); emit(eoiCode); flush(1);
  if (subBlock + 1 === p) buf[subBlock] = 0;
  else { buf[subBlock] = p - subBlock - 1; buf[p++] = 0; }
  return p;
}
function tableSizeFor(count: number) { let size = 2; while (size < count) size <<= 1; return size; }
export function encodeIndexedGif(width: number, height: number, palette: number[][], frames: GifIndexedFrame[]): Uint8Array {
  if (!frames.length) throw new Error('没有可导出的 GIF 帧。');
  const tableSize = tableSizeFor(palette.length), minCodeSize = Math.max(2, Math.log2(tableSize));
  const buf = new Uint8Array(1024 + tableSize * 3 + frames.length * (width * height * 2 + 1024));
  let p = 0;
  const byte = (v: number) => { buf[p++] = v & 255; };
  const word = (v: number) => { byte(v); byte(v >> 8); };
  const ascii = (s: string) => { for (const c of s) byte(c.charCodeAt(0)); };
  ascii('GIF89a'); word(width); word(height); byte(0x80 | (Math.log2(tableSize) - 1)); byte(0); byte(0);
  for (let i = 0; i < tableSize; i++) { const rgb = palette[i] ?? [0,0,0]; byte(rgb[0]); byte(rgb[1]); byte(rgb[2]); }
  byte(0x21); byte(0xff); byte(0x0b); ascii('NETSCAPE2.0'); byte(3); byte(1); word(0); byte(0);
  for (const frame of frames) {
    byte(0x21); byte(0xf9); byte(4); byte(1 << 2); word(Math.max(0, Math.min(65535, Math.round(frame.delayCs)))); byte(0); byte(0);
    byte(0x2c); word(0); word(0); word(width); word(height); byte(0);
    p = outputLzw(buf, p, minCodeSize, frame.pixels);
  }
  byte(0x3b);
  return buf.slice(0, p);
}
