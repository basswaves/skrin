import { describe, expect, it } from 'vitest';
import { countdownChange, SEEK_BACK_SECS } from './useUpNext';
import { initialSession, reduce } from './session';

// GitHub #29: the Up next count ran on whatever the player did.
describe('what stops the Up next count', () => {
  it('a pause either way holds it', () => {
    expect(countdownChange({ paused: false }, 1440, { paused: true, timePos: 1440, duration: 1500 })).toBe('hold');
    // mpv pauses by itself at the end of a file; the person then unpausing is a change.
    expect(countdownChange({ paused: true }, 1500, { paused: false, timePos: 1500, duration: 1500 })).toBe('hold');
  });

  it('going back before the furthest point takes it down', () => {
    expect(countdownChange({ paused: false }, 1500, { paused: false, timePos: 1490, duration: 1500 })).toBe(
      'went-back'
    );
    expect(countdownChange({ paused: true }, 1500, { paused: false, timePos: 0, duration: 1500 })).toBe('went-back');
  });

  it('the credits playing on under it, or the position wobbling, change nothing', () => {
    expect(countdownChange({ paused: false }, 1445, { paused: false, timePos: 1445, duration: 1500 })).toBeNull();
    expect(
      countdownChange({ paused: true }, 1500, { paused: true, timePos: 1500 - SEEK_BACK_SECS / 2, duration: 1500 })
    ).toBeNull();
    expect(countdownChange({ paused: true }, null, { paused: true, timePos: null, duration: 1500 })).toBeNull();
  });

  it('the pause mpv makes at the end of a file is its own, not a hold', () => {
    expect(countdownChange({ paused: false }, 1500, { paused: true, timePos: 1499.9, duration: 1500 })).toBe(
      'adopt'
    );
    // Before the end it is the viewer's.
    expect(countdownChange({ paused: false }, 1440, { paused: true, timePos: 1440, duration: 1500 })).toBe(
      'hold'
    );
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
