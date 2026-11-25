import { describe, expect, it } from 'vitest';
import { nextFrame } from './frameQueue';

const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const set = (...ids: number[]) => new Set(ids);

describe('nextFrame (GitHub #28)', () => {
  it('goes first to last when nothing is on screen', () => {
    expect(nextFrame(order, set(3, 4, 9), set())).toBe(3);
  });

  it('takes the tiles on screen first, wherever they are', () => {
    expect(nextFrame(order, set(1, 2, 7, 8), set(6, 7, 8))).toBe(7);
  });

  it('then the ones just below the screen, where a scroll goes next', () => {
    expect(nextFrame(order, set(1, 2, 9, 10), set(5, 6, 7))).toBe(9);
  });

  it('then wraps round to the ones above', () => {
    expect(nextFrame(order, set(1, 2), set(5, 6, 7))).toBe(1);
  });

  it('says nothing when nothing waits', () => {
    expect(nextFrame(order, set(), set(5))).toBeNull();
  });

  it('a whole run asks the screen first, then below, then above', () => {
    const waiting = new Set(order);
    const onScreen = set(5, 6);
    const asked: number[] = [];
    for (let id = nextFrame(order, waiting, onScreen); id !== null; id = nextFrame(order, waiting, onScreen)) {
      waiting.delete(id);
      asked.push(id);
    }
    expect(asked).toEqual([5, 6, 7, 8, 9, 10, 1, 2, 3, 4]);
  });
});
