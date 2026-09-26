export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 40;
export const VISIBLE_HEIGHT = 20;
export const HIDDEN_HEIGHT = BOARD_HEIGHT - VISIBLE_HEIGHT;
export const SPAWN_X = 3;
export const SPAWN_Y = HIDDEN_HEIGHT - 3;

export type PieceName = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type Cell = PieceName | 'G' | null;
export type Board = Cell[][];
export type Rotation = 0 | 1 | 2 | 3;
export type RotationDirection = 1 | -1 | 2;
export type Piece = { kind: PieceName; rotation: Rotation; x: number; y: number };

export const SHAPES: Record<PieceName, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
  I: [
    [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]],
  ],
  J: [
    [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]],
  ],
  L: [
    [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]],
  ],
  O: [
    [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]],
  ],
  S: [
    [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]],
  ],
  T: [
    [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]],
  ],
  Z: [
    [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]],
  ],
};

const JLSTZ_KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};

const I_KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '0>1': [[0,0],[1,0],[-2,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[2,-1],[-1,2]],
};

const JLSTZ_180_KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '0>2': [[0,0],[0,1],[1,1],[-1,1],[1,0],[-1,0]],
  '1>3': [[0,0],[1,0],[1,2],[1,1],[0,2],[0,1]],
  '2>0': [[0,0],[0,-1],[-1,-1],[1,-1],[-1,0],[1,0]],
  '3>1': [[0,0],[-1,0],[-1,2],[-1,1],[0,2],[0,1]],
};

const I_180_KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  '0>2': [[0,0],[0,1]], '1>3': [[0,0],[1,0]],
  '2>0': [[0,0],[0,-1]], '3>1': [[0,0],[-1,0]],
};

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null));
}

export function cellsFor(piece: Piece): Array<[number, number]> {
  return SHAPES[piece.kind][piece.rotation].map(([x,y]) => [piece.x + x, piece.y + y]);
}

function collidesAt(board: Board, kind: PieceName, rotation: Rotation, pieceX: number, pieceY: number): boolean {
  for (const [offsetX,offsetY] of SHAPES[kind][rotation]) {
    const x = pieceX + offsetX;
    const y = pieceY + offsetY;
    if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return true;
    if (y >= 0 && board[y][x] !== null) return true;
  }
  return false;
}

export function collides(board: Board, piece: Piece): boolean {
  return collidesAt(board, piece.kind, piece.rotation, piece.x, piece.y);
}

export function normalSpawnPiece(board: Board, kind: PieceName): Piece | null {
  for (const y of [SPAWN_Y, SPAWN_Y - 1]) {
    const piece: Piece = { kind, rotation: 0, x: SPAWN_X, y };
    if (!collides(board, piece)) return piece;
  }
  return null;
}

export function ghostY(board: Board, piece: Piece): number {
  let y = piece.y;
  while (!collidesAt(board, piece.kind, piece.rotation, piece.x, y + 1)) y += 1;
  return y;
}

export function tryRotatePiece(
  board: Board,
  piece: Piece,
  direction: RotationDirection,
): { piece: Piece; kickIndex: number } | null {
  const from = piece.rotation;
  const to = ((from + direction + 4) % 4) as Rotation;
  if (piece.kind === 'O') return { piece: { ...piece, rotation: to }, kickIndex: 0 };
  const table = direction === 2
    ? piece.kind === 'I' ? I_180_KICKS : JLSTZ_180_KICKS
    : piece.kind === 'I' ? I_KICKS : JLSTZ_KICKS;
  const tests = table[`${from}>${to}`] ?? [[0,0]];
  for (let i = 0; i < tests.length; i++) {
    const [dx,srsY] = tests[i];
    const next = { ...piece, rotation: to, x: piece.x + dx, y: piece.y - srsY };
    if (!collidesAt(board, next.kind, next.rotation, next.x, next.y)) return { piece: next, kickIndex: i };
  }
  return null;
}
