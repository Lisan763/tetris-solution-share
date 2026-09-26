import { INPUTS, type Input, type SharePosition, SolutionSession } from './session';

const PREFIX = 'TSS1:';
const INPUT_TO_CHAR: Record<Input,string> = {
  left:'L', right:'R', down:'D', cw:'C', ccw:'A', half:'2', hold:'H', drop:'X',
};
const CHAR_TO_INPUT = Object.fromEntries(Object.entries(INPUT_TO_CHAR).map(([k,v]) => [v,k])) as Record<string,Input>;

type CompactCode = {
  v: 1;
  b: string;
  c: string;
  h: string;
  n: string;
  k: 0 | 1;
  i: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
function base64UrlToBytes(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Code 含有非法字符。');
  const padded = text.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4 - text.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); } catch { throw new Error('Code 的 Base64 数据损坏。'); }
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function trimBoard(rows: string[]): string {
  const first = rows.findIndex(row => row !== '..........');
  return (first < 0 ? ['..........'] : rows.slice(first)).join('/');
}

export function encodeShareCode(session: SolutionSession): string {
  const inputs = session.frames.slice(1).map(frame => frame.input).filter((input): input is Input => !!input);
  const source = session.source;
  const compact: CompactCode = {
    v: 1,
    b: trimBoard(source.board),
    c: source.current,
    h: source.hold ?? '-',
    n: Array.isArray(source.next) ? source.next.join('') : source.next,
    k: source.canHold === false ? 0 : 1,
    i: inputs.map(input => INPUT_TO_CHAR[input]).join(''),
  };
  const json = JSON.stringify(compact);
  const payload = bytesToBase64Url(new TextEncoder().encode(json));
  return PREFIX + payload + '.' + checksum(payload);
}

export function decodeShareCode(code: string): { position: SharePosition; inputs: Input[] } {
  const normalized = code.replace(/\s+/g, '').trim();
  if (!normalized.startsWith(PREFIX)) throw new Error('不是 Tetris Solution Share Code（应以 TSS1: 开头）。');
  const body = normalized.slice(PREFIX.length);
  const dot = body.lastIndexOf('.');
  if (dot <= 0 || dot === body.length - 1) throw new Error('Code 缺少校验码。');
  const payload = body.slice(0, dot);
  const check = body.slice(dot + 1).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(check) || checksum(payload) !== check) {
    throw new Error('Code 校验失败：可能复制不完整或内容被修改。');
  }
  let value: CompactCode;
  try {
    value = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  } catch (error) {
    if (error instanceof Error && /Code/.test(error.message)) throw error;
    throw new Error('Code 内容损坏或格式不完整。');
  }
  if (!value || value.v !== 1 || typeof value.b !== 'string' || typeof value.c !== 'string'
    || typeof value.h !== 'string' || typeof value.n !== 'string' || (value.k !== 0 && value.k !== 1)
    || typeof value.i !== 'string') throw new Error('Code 版本或字段格式不支持。');
  if (!/^[IJLOSTZ]$/.test(value.c)) throw new Error('Code 中的 Current 无效。');
  if (value.h !== '-' && !/^[IJLOSTZ]$/.test(value.h)) throw new Error('Code 中的 Hold 无效。');
  if (!/^[IJLOSTZ]{0,128}$/.test(value.n)) throw new Error('Code 中的 Next 无效。');
  const board = value.b.split('/');
  if (board.length < 1 || board.length > 20 || board.some(row => !/^[.GIJLOSTZ]{10}$/.test(row))) {
    throw new Error('Code 中的场地格式无效。');
  }
  const inputs: Input[] = [];
  for (const char of value.i) {
    const input = CHAR_TO_INPUT[char];
    if (!input || !INPUTS.includes(input)) throw new Error('Code 中包含未知操作。');
    inputs.push(input);
  }
  return {
    position: {
      board,
      current: value.c as any,
      hold: value.h === '-' ? null : value.h as any,
      next: value.n,
      canHold: value.k === 1,
    },
    inputs,
  };
}

export function sessionFromShareCode(code: string): SolutionSession {
  const decoded = decodeShareCode(code);
  const session = new SolutionSession(decoded.position);
  for (let index = 0; index < decoded.inputs.length; index++) {
    if (!session.action(decoded.inputs[index])) {
      throw new Error(`Code 在第 ${index + 1} 个操作（${decoded.inputs[index]}）处无法合法重放。`);
    }
  }
  return session;
}
