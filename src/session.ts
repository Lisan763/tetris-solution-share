import {
  emptyBoard, normalSpawnPiece, cellsFor, collides, ghostY, tryRotatePiece,
  type Board, type Piece, type PieceName,
} from './tetris';

export const INPUTS = ['left','right','down','cw','ccw','half','hold','drop'] as const;
export type Input = typeof INPUTS[number];
export type SharePosition = {
  board: string[];
  current: PieceName;
  hold: PieceName | null;
  next: PieceName[] | string;
  canHold?: boolean;
};
export type ShareView = {
  board: Board;
  active: Piece | null;
  activeCells: Array<[number,number]>;
  ghostCells: Array<[number,number]>;
  hold: PieceName | null;
  next: PieceName[];
  canHold: boolean;
  alive: boolean;
  ended: boolean;
  placements: number;
  lastClearLines: number;
};
export type ShareFrame = { input?: Input; locked?: boolean; view: ShareView };

type State = {
  board: Board; current: Piece | null; hold: PieceName | null; next: PieceName[];
  canHold: boolean; alive: boolean; placements: number; lastClearLines: number;
};
type UndoFrame = { state: State; frameLength: number };

const PIECE = /^[IJLOSTZ]$/;
const ROW = /^[.GIJLOSTZ]{10}$/;

function cloneBoard(board: Board): Board { return board.map(row => [...row]); }
function parsePiece(value: unknown, field: string): PieceName {
  if (typeof value !== 'string' || !PIECE.test(value)) throw new Error(`${field} 无效。`);
  return value as PieceName;
}
function parseNext(value: PieceName[] | string): PieceName[] {
  const chars = Array.isArray(value) ? value : String(value ?? '').replace(/[\s,]/g, '').toUpperCase().split('');
  if (chars.length > 128 || chars.some(piece => typeof piece !== 'string' || !PIECE.test(piece))) {
    throw new Error('Next 只能包含 I/J/L/O/S/T/Z，最多 128 块。');
  }
  return chars as PieceName[];
}
export function normalizePosition(value: SharePosition): { state: State; source: SharePosition } {
  if (!value || !Array.isArray(value.board) || value.board.length < 1 || value.board.length > 20
    || value.board.some(row => typeof row !== 'string' || !ROW.test(row))) {
    throw new Error('场地需 1–20 行，每行 10 格；支持 . / G / I/J/L/O/S/T/Z。');
  }
  const board = emptyBoard();
  const rows = value.board.map(row => [...row].map(cell => cell === '.' ? null : cell as any));
  for (let y = 0; y < rows.length; y++) board[40 - rows.length + y] = rows[y];
  const currentKind = parsePiece(value.current, 'Current');
  const rawHold = value.hold as unknown;
  const hold = rawHold === null || rawHold === undefined || rawHold === ''
    ? null : parsePiece(rawHold, 'Hold');
  const next = parseNext(value.next);
  const current = normalSpawnPiece(board, currentKind);
  if (!current) throw new Error('Current 在这个场地无法正常出生。');
  return {
    state: {
      board, current, hold, next, canHold: value.canHold !== false,
      alive: true, placements: 0, lastClearLines: 0,
    },
    source: {
      board: [...value.board], current: currentKind, hold, next: [...next], canHold: value.canHold !== false,
    },
  };
}

function copyState(state: State): State {
  return {
    board: cloneBoard(state.board), current: state.current ? { ...state.current } : null,
    hold: state.hold, next: [...state.next], canHold: state.canHold,
    alive: state.alive, placements: state.placements, lastClearLines: state.lastClearLines,
  };
}
function spawn(state: State, kind: PieceName): boolean {
  const piece = normalSpawnPiece(state.board, kind);
  if (!piece) { state.current = null; state.alive = false; return false; }
  state.current = piece;
  return true;
}
function clearLines(board: Board): { board: Board; lines: number } {
  const kept = board.filter(row => !row.every(cell => cell !== null));
  const lines = 40 - kept.length;
  while (kept.length < 40) kept.unshift(Array(10).fill(null));
  return { board: kept, lines };
}

export class SolutionSession {
  readonly source: SharePosition;
  private initial: State;
  private state: State;
  private history: UndoFrame[] = [];
  private pieceStart: State;
  private pieceStartFrame = 1;
  private pieceDirty = false;
  frames: ShareFrame[] = [];

  constructor(position: SharePosition) {
    const parsed = normalizePosition(position);
    this.source = parsed.source;
    this.initial = copyState(parsed.state);
    this.state = copyState(parsed.state);
    this.pieceStart = copyState(this.state);
    this.frames = [{ view: this.view() }];
  }
  private restore(state: State) { this.state = copyState(state); }
  view(): ShareView {
    const active = this.state.current ? { ...this.state.current } : null;
    return {
      board: cloneBoard(this.state.board),
      active,
      activeCells: active ? cellsFor(active) : [],
      ghostCells: active && this.state.alive ? cellsFor({ ...active, y: ghostY(this.state.board, active) }) : [],
      hold: this.state.hold,
      next: this.state.next.slice(0, 5),
      canHold: this.state.canHold,
      alive: this.state.alive,
      ended: !active || !this.state.alive,
      placements: this.state.placements,
      lastClearLines: this.state.lastClearLines,
    };
  }
  get canUndo() { return this.pieceDirty || this.history.length > 0; }
  get ended() { return !this.state.current || !this.state.alive; }
  get remainingNext() { return this.state.next.length; }
  private append(input: Input, locked = false) {
    this.frames.push({ input, locked, view: this.view() });
  }
  action(input: Input): boolean {
    if (!INPUTS.includes(input) || !this.state.alive) return false;
    if (!this.state.current) {
      // Finite-known-sequence convenience: after Current + Next are exhausted,
      // a still-known Hold can be brought out without inventing the unknown
      // future Current that would normally be swapped into Hold.
      if (input !== 'hold' || !this.state.hold) return false;
      const incoming = this.state.hold;
      this.state.hold = null;
      this.state.canHold = false;
      if (!spawn(this.state, incoming)) return false;
      this.pieceDirty = true;
      this.append('hold', false);
      return true;
    }
    const current = this.state.current;
    let accepted = false;
    let locked = false;
    if (input === 'left' || input === 'right' || input === 'down') {
      const dx = input === 'left' ? -1 : input === 'right' ? 1 : 0;
      const dy = input === 'down' ? 1 : 0;
      const moved = { ...current, x: current.x + dx, y: current.y + dy };
      if (!collides(this.state.board, moved)) { this.state.current = moved; accepted = true; }
    } else if (input === 'cw' || input === 'ccw' || input === 'half') {
      const direction = input === 'cw' ? 1 : input === 'ccw' ? -1 : 2;
      const rotated = tryRotatePiece(this.state.board, current, direction);
      if (rotated) { this.state.current = rotated.piece; accepted = true; }
    } else if (input === 'hold') {
      if (!this.state.canHold) return false;
      const outgoing = current.kind;
      if (this.state.hold) {
        const incoming = this.state.hold;
        this.state.hold = outgoing;
        spawn(this.state, incoming);
        accepted = true;
      } else {
        if (!this.state.next.length) return false;
        this.state.hold = outgoing;
        spawn(this.state, this.state.next.shift()!);
        accepted = true;
      }
      if (accepted) this.state.canHold = false;
    } else if (input === 'drop') {
      const landing = { ...current, y: ghostY(this.state.board, current) };
      for (const [x,y] of cellsFor(landing)) {
        if (y < 0 || y >= 40) { this.state.alive = false; return false; }
        this.state.board[y][x] = landing.kind;
      }
      const cleared = clearLines(this.state.board);
      this.state.board = cleared.board;
      this.state.lastClearLines = cleared.lines;
      this.state.placements++;
      if (this.state.next.length) {
        const next = this.state.next.shift()!;
        this.state.canHold = true;
        spawn(this.state, next);
      } else {
        this.state.current = null;
        this.state.canHold = false;
      }
      accepted = true; locked = true;
    }
    if (!accepted) return false;
    this.pieceDirty = true;
    this.append(input, locked);
    if (locked) {
      this.history.push({ state: copyState(this.pieceStart), frameLength: this.pieceStartFrame });
      this.pieceStart = copyState(this.state);
      this.pieceStartFrame = this.frames.length;
      this.pieceDirty = false;
    }
    return true;
  }
  undo(): boolean {
    if (this.pieceDirty) {
      this.restore(this.pieceStart);
      this.frames.length = this.pieceStartFrame;
      this.pieceDirty = false;
      return true;
    }
    const previous = this.history.pop();
    if (!previous) return false;
    this.restore(previous.state);
    this.frames.length = previous.frameLength;
    this.pieceStart = copyState(this.state);
    this.pieceStartFrame = this.frames.length;
    this.pieceDirty = false;
    return true;
  }
  reset() {
    this.state = copyState(this.initial);
    this.history = [];
    this.pieceStart = copyState(this.state);
    this.pieceStartFrame = 1;
    this.pieceDirty = false;
    this.frames = [{ view: this.view() }];
  }
}
