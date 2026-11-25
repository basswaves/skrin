/**
 * Which tile's frame is taken next (GitHub #28). A Videos folder of 1500 new
 * clips used to get its frames first to last, so the tiles on screen waited
 * for every one above them. Now the tiles on screen go first, then the ones
 * just below them (where a scroll goes next), then the rest in page order —
 * and the rest go on after the folder is left, so it is ready next time.
 *
 * Only the order changed: still one frame at a time, and `videos.rs` still
 * waits while a film plays (`take_in_turn`), on every system alike.
 */
import { videoFrame } from './videos';

/**
 * The next file to take a frame from: the first waiting one on screen; else
 * the first waiting one after the last on screen; else the first waiting one.
 * `order` is page order, newest page first; `null` when nothing waits.
 */
export function nextFrame(
  order: readonly number[],
  waiting: ReadonlySet<number>,
  onScreen: ReadonlySet<number>,
): number | null {
  let last = -1;
  for (let i = 0; i < order.length; i++) {
    if (!onScreen.has(order[i])) continue;
    if (waiting.has(order[i])) return order[i];
    last = i;
  }
  for (let i = last + 1; i < order.length; i++) if (waiting.has(order[i])) return order[i];
  for (let i = 0; i <= last; i++) if (waiting.has(order[i])) return order[i];
  return null;
}

/** Every file asked about this run, page order, the latest page's first. */
let order: number[] = [];
const waiting = new Set<number>();
let onScreen: ReadonlySet<number> = new Set();
const listeners = new Set<(id: number, frame: string) => void>();
let running = false;

async function run(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let id = nextFrame(order, waiting, onScreen); id !== null; id = nextFrame(order, waiting, onScreen)) {
      waiting.delete(id);
      const frame = await videoFrame(id).catch(() => null);
      if (frame) listeners.forEach((got) => got(id, frame));
    }
    order = [];
  } finally {
    running = false;
  }
}

/** A page's files that have no frame, in page order: they go before any older page's. */
export function wantFrames(ids: readonly number[]): void {
  const fresh = new Set(ids);
  order = [...ids, ...order.filter((id) => !fresh.has(id))];
  ids.forEach((id) => waiting.add(id));
  void run();
}

/** The files whose tiles are on screen now; none once the page is left. */
export function framesOnScreen(ids: ReadonlySet<number>): void {
  onScreen = ids;
}

/** Called with each frame as it is taken; returns the way to stop. */
export function onFrame(got: (id: number, frame: string) => void): () => void {
  listeners.add(got);
  return () => {
    listeners.delete(got);
  };
}
