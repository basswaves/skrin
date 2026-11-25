import { describe, expect, it } from 'vitest';
import { countdownChange, SEEK_BACK_SECS } from './useUpNext';
import { initialSession, reduce } from './session';

// GitHub #29: the Up next count ran on whatever the player did.
describe('what stops the Up next count', () => {
  it('a pause either way holds it', () => {
    expect(countdownChange({ paused: false }, 1440, { paused: true, timePos: 1440 })).toBe('hold');
    // mpv pauses by itself at the end of a file; the person then unpausing is a change.
    expect(countdownChange({ paused: true }, 1500, { paused: false, timePos: 1500 })).toBe('hold');
  });

  it('going back before the furthest point takes it down', () => {
    expect(countdownChange({ paused: false }, 1500, { paused: false, timePos: 1490 })).toBe(
      'went-back'
    );
    expect(countdownChange({ paused: true }, 1500, { paused: false, timePos: 0 })).toBe('went-back');
  });

  it('the credits playing on under it, or the position wobbling, change nothing', () => {
    expect(countdownChange({ paused: false }, 1445, { paused: false, timePos: 1445 })).toBeNull();
    expect(
      countdownChange({ paused: true }, 1500, { paused: true, timePos: 1500 - SEEK_BACK_SECS / 2 })
    ).toBeNull();
    expect(countdownChange({ paused: true }, null, { paused: true, timePos: null })).toBeNull();
  });

  it('going back reopens the file, so its next end is handled again', () => {
    let s = reduce(initialSession('a.mkv'), { type: 'file-loaded' });
    s = reduce(s, { type: 'opened', path: 'a.mkv', timePos: 0, duration: 100, resumedFrom: null });
    s = reduce(s, { type: 'eof' });
    expect(s.ended).toBe(true);
    s = reduce(s, { type: 'reopen' });
    expect(s.ended).toBe(false);
    expect(reduce(s, { type: 'eof' }).ended).toBe(true);
  });
});
