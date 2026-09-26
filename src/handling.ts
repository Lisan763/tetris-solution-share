import type { Input } from './session';

export const FRAME_MS = 1000 / 60;
export type Handling = {
  das: number;
  arr: number;
  sdf: number;
  cancelDas: boolean;
};
// Share mode is for deliberate manual solving, so soft drop should be
// controllable rather than sonic. 10x over the 0.02G baseline is ~0.2G.
export const DEFAULT_HANDLING: Handling = { das: 8, arr: 0, sdf: 10, cancelDas: true };

export function sanitizeHandling(value: Partial<Handling> | null = {}): Handling {
  const data = value ?? {};
  const number = (key: keyof Handling, low: number, high: number) => {
    const v = data[key];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.min(high, Math.max(low, v)) : DEFAULT_HANDLING[key] as number;
  };
  return {
    das: number('das', 0, 30),
    arr: number('arr', 0, 10),
    sdf: number('sdf', 1, 41),
    cancelDas: typeof data.cancelDas === 'boolean' ? data.cancelDas : DEFAULT_HANDLING.cancelDas,
  };
}

type Emit = (input: Input, repeated: boolean) => boolean;

export class HandlingController {
  settings: Handling;
  private held = new Map<Input, number>();
  private direction: 'left' | 'right' | null = null;
  private nextRepeat = Infinity;
  private lastTime: number | null = null;
  private dropAccumulator = 0;
  constructor(settings: Partial<Handling>, private emit: Emit) {
    this.settings = sanitizeHandling(settings);
  }
  configure(value: Partial<Handling>) {
    this.settings = sanitizeHandling(value);
    this.releaseAll();
  }
  releaseAll() {
    this.held.clear();
    this.direction = null;
    this.nextRepeat = Infinity;
    this.lastTime = null;
    this.dropAccumulator = 0;
  }
  private send(input: Input, repeated = false) { return this.emit(input, repeated); }
  private changeDirection(input: 'left' | 'right', time: number, returning = false) {
    this.direction = input;
    if (this.settings.cancelDas) this.held.set(input, time);
    const start = this.held.get(input) ?? time;
    this.nextRepeat = start + this.settings.das * FRAME_MS;
    if (!returning) this.send(input);
  }
  press(input: Input, time: number) {
    if (this.held.has(input)) return;
    this.tick(time);
    this.held.set(input, time);
    if (input === 'left' || input === 'right') {
      this.changeDirection(input, time);
      if (this.settings.das === 0) this.horizontal(time);
    } else if (input === 'down') {
      this.dropAccumulator = 0;
      if (this.settings.sdf >= 41) this.sonic();
      else this.send('down');
    } else this.send(input);
  }
  release(input: Input, time: number) {
    this.tick(time);
    this.held.delete(input);
    if (this.direction === input) {
      const other = input === 'left' ? 'right' : 'left';
      if (this.held.has(other)) this.changeDirection(other, time, true);
      else { this.direction = null; this.nextRepeat = Infinity; }
    }
    if (input === 'down') this.dropAccumulator = 0;
  }
  tap(input: Input) { return this.send(input); }
  private horizontal(time: number) {
    if (!this.direction || time < this.nextRepeat) return;
    if (this.settings.arr === 0) {
      for (let i = 0; i < 12 && this.send(this.direction, true); i++) { /* shift to wall */ }
      this.nextRepeat = time + FRAME_MS;
    } else {
      let repeats = 0;
      while (time >= this.nextRepeat && repeats++ < 24) {
        this.send(this.direction, true);
        this.nextRepeat += this.settings.arr * FRAME_MS;
      }
    }
  }
  private sonic() {
    for (let i = 0; i < 44 && this.send('down', true); i++) { /* never locks */ }
  }
  tick(time: number) {
    if (!Number.isFinite(time)) return;
    const elapsed = this.lastTime === null ? 0 : Math.max(0, Math.min(100, time - this.lastTime));
    this.lastTime = time;
    this.horizontal(time);
    if (!this.held.has('down')) return;
    if (this.settings.sdf >= 41) { this.sonic(); return; }
    this.dropAccumulator += elapsed / FRAME_MS * 0.02 * this.settings.sdf;
    let count = 0;
    while (this.dropAccumulator >= 1 && count++ < 44) {
      this.dropAccumulator--;
      if (!this.send('down', true)) { this.dropAccumulator = 0; break; }
    }
  }
}

export class RepeatCommandController<T extends string> {
  private held = new Map<T, number>();
  private next = new Map<T, number>();
  constructor(private emit: (command: T) => void, readonly delayMs = 300, readonly intervalMs = 90) {}
  press(command: T, time: number) {
    if (this.held.has(command)) return;
    this.held.set(command, time);
    this.next.set(command, time + this.delayMs);
    this.emit(command);
  }
  release(command: T) { this.held.delete(command); this.next.delete(command); }
  releaseAll() { this.held.clear(); this.next.clear(); }
  tick(time: number) {
    for (const command of this.held.keys()) {
      let due = this.next.get(command)!;
      let guard = 0;
      while (time >= due && guard++ < 8) { this.emit(command); due += this.intervalMs; }
      this.next.set(command, due);
    }
  }
}
