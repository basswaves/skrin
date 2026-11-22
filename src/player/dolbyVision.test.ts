import { describe, expect, it } from 'vitest';
import { describeDolbyVision, mergedEnhancementLayer } from './dolbyVision';

const passes = (...desc: string[]) => JSON.stringify({ fresh: desc.map((d) => ({ desc: d, avg: 1 })) });

describe('mergedEnhancementLayer', () => {
  it('finds the merge in the passes libplacebo ran', () => {
    // As mpv 0.42 / libplacebo 7.387 name it for a profile 7 FEL film.
    expect(
      mergedEnhancementLayer(
        passes(
          'map frame (hwdec)',
          'ortho (horiz) upscaling (spline36), color decoding, reshaping, ortho (horiz) upscaling (spline36), enhancement layer'
        )
      )
    ).toBe(true);
  });
  it('finds none for reshaping alone (profile 8, MEL), or for nothing read', () => {
    expect(mergedEnhancementLayer(passes('color decoding, reshaping'))).toBe(false);
    expect(mergedEnhancementLayer(null)).toBe(false);
    expect(mergedEnhancementLayer('not json')).toBe(false);
  });
});

describe('describeDolbyVision', () => {
  const layer = { merged: false, supported: true, steppedDown: false };
  it('names what each profile becomes', () => {
    expect(describeDolbyVision(5)?.value).toBe('profile 5 → converted to HDR10');
    expect(describeDolbyVision(8)?.value).toBe('profile 8 → HDR10 base layer');
  });
  it('says a profile 7 film’s enhancement layer was merged only when it was', () => {
    expect(describeDolbyVision(7, { ...layer, merged: true })?.value).toBe(
      'profile 7 → enhancement layer merged'
    );
    expect(describeDolbyVision(7, layer)?.value).toBe('profile 7 → base layer only (nothing merged)');
  });
  it('says why only the base layer is shown', () => {
    const stepped = describeDolbyVision(7, { ...layer, steppedDown: true });
    expect(stepped?.value).toBe('profile 7 → base layer only (dropped to keep up)');
    expect(stepped?.warn).toBe(true);
    expect(describeDolbyVision(7, { ...layer, supported: false })?.value).toBe(
      'profile 7 → base layer only (not supported here)'
    );
    expect(describeDolbyVision(7)?.value).toBe(
      'profile 7 → base layer only (enhancement layer not used)'
    );
  });
  it('never claims a Dolby Vision signal', () => {
    for (const p of [5, 7, 8, 9]) expect(describeDolbyVision(p)?.note).toMatch(/cannot send Dolby Vision/);
  });
  it('stays out of the way for everything else', () => {
    expect(describeDolbyVision(null)).toBeNull();
    expect(describeDolbyVision(0)).toBeNull();
  });
});
