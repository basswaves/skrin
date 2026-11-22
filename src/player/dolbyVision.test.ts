import { describe, expect, it } from 'vitest';
import {
  describeDolbyVision,
  describeDynamicToneMapping,
  describeFileMetadata,
  mergedEnhancementLayer,
  pqToNits,
  toneMapInput,
} from './dolbyVision';
import type { DvMetadata, VideoDetails } from '../ui/badges';

const passes = (...desc: string[]) =>
  JSON.stringify({ fresh: desc.map((d) => ({ desc: d, avg: 1 })) });

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
    expect(describeDolbyVision(7, layer)?.value).toBe(
      'profile 7 → base layer only (nothing merged)'
    );
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
    for (const p of [5, 7, 8, 9])
      expect(describeDolbyVision(p)?.note).toMatch(/cannot send Dolby Vision/);
  });
  it('stays out of the way for everything else', () => {
    expect(describeDolbyVision(null)).toBeNull();
    expect(describeDolbyVision(0)).toBeNull();
  });
});

describe('describeFileMetadata', () => {
  const base: VideoDetails = {
    stream_index: 0,
    codec: 'hevc',
    profile: 'Main 10',
    width: 3840,
    height: 2160,
    bit_depth: 10,
    frame_rate: 23.976,
    interlaced: false,
    aspect_ratio: 16 / 9,
    transfer: 'pq',
    hdr10_plus: false,
    dolby_vision: null,
    mastering_peak_nits: 1000,
    max_cll: null,
    max_fall: null,
  };
  const dv = (metadata: Partial<DvMetadata>): VideoDetails => ({
    ...base,
    dolby_vision: {
      profile: 8,
      level: 6,
      compatibility: 1,
      enhancement_layer: null,
      metadata: {
        profile: 8,
        enhancement_layer: null,
        cm_version: '4.0',
        brightness: { peak_nits: 384.5, average_nits: 6.54, frames: 10 },
        mastering_peak_nits: 1000,
        max_cll: null,
        max_fall: null,
        l2_trims: true,
        l8_trims: true,
        points: 10,
        rpus: 10,
        ...metadata,
      },
    },
  });

  it('says nothing for a file the probe has not read that way', () => {
    expect(describeFileMetadata(null)).toEqual([]);
    expect(describeFileMetadata(base)).toEqual([]);
    const unread = dv({});
    unread.dolby_vision!.metadata = undefined;
    expect(describeFileMetadata(unread)).toEqual([]);
  });

  it('gives the grade, the sampled brightness and only the L6 figures the file has', () => {
    const rows = describeFileMetadata(dv({}));
    expect(rows.map((r) => r.label)).toEqual([
      'Dolby Vision grade',
      'Scene brightness',
      'Grade’s light levels',
    ]);
    expect(rows[0].value).toBe('content mapping 4.0 · trims for other screens (L2, L8)');
    expect(rows[1].value).toBe('up to 385 nits · average 6.5 nits');
    expect(rows[1].note).toContain('10 places');
    expect(rows[2].value).toBe('mastered at 1000 nits');
  });

  it('says so when a file labelled Dolby Vision carries no RPU', () => {
    const rows = describeFileMetadata(
      dv({
        rpus: 0,
        cm_version: null,
        brightness: null,
        mastering_peak_nits: null,
        l2_trims: false,
        l8_trims: false,
      })
    );
    expect(rows.map((r) => r.value)).toEqual(['labelled, but no metadata in the file']);
  });

  it('names a full enhancement layer and a grade without trims', () => {
    const rows = describeFileMetadata(
      dv({ enhancement_layer: 'FEL', cm_version: '2.9', l2_trims: false, l8_trims: false })
    );
    expect(rows[0].value).toBe('content mapping 2.9 · no trims for other screens');
    expect(rows[0].note).toContain('full (FEL)');
  });

  it('says where HDR10+ was found, and when it was only at the start', () => {
    const found = describeFileMetadata({
      ...base,
      hdr10_plus: true,
      hdr10_plus_metadata: {
        brightness: { peak_nits: 1783, average_nits: 103.7, frames: 9 },
        target_display_nits: 400,
        points: 10,
      },
    });
    expect(found[0].value).toBe('up to 1783 nits · average 104 nits');
    expect(found[0].note).toBe(
      'HDR10+ metadata, in 9 of 10 places read across the film; made for a 400-nit display'
    );
    const startOnly = describeFileMetadata({
      ...base,
      hdr10_plus: true,
      hdr10_plus_metadata: { brightness: null, target_display_nits: null, points: 10 },
    });
    expect(startOnly[0].value).toBe('not found across the film');
  });
});

describe('describeDynamicToneMapping', () => {
  // Values as mpv 0.42 reported them on an SDR window (R12-B2).
  const tm = (from: string) =>
    passes(
      'map frame (hwdec)',
      `ortho (horiz) downscaling (mitchell), bt2390 tone map (${from} -> 84), gamut map (perceptual)`
    );

  it('reads the peak the tone map started from', () => {
    expect(toneMapInput(tm('375'))).toBe(375);
    expect(toneMapInput(passes('color decoding'))).toBeNull();
    expect(toneMapInput(null)).toBeNull();
  });

  it('says used when the input is the frame’s Dolby Vision L1 peak', () => {
    // max-pq-y 0.5348 ≈ 130 nits
    const row = describeDynamicToneMapping(130, 0.5348, null);
    expect(row?.value).toBe('used for tone mapping');
    expect(row?.note).toContain('Dolby Vision L1');
  });

  it('says used when the input is the HDR10+ scene peak, and at the SDR-white floor', () => {
    expect(describeDynamicToneMapping(231, 0.6, 231)?.note).toContain('HDR10+');
    expect(describeDynamicToneMapping(100, null, 24)?.value).toBe('used for tone mapping');
  });

  it('says not used when the input is something else, and nothing without metadata', () => {
    expect(describeDynamicToneMapping(523, null, 231)?.value).toBe('not used on this frame');
    expect(describeDynamicToneMapping(523, null, null)).toBeNull();
    expect(describeDynamicToneMapping(null, 0.5, 200)).toBeNull();
  });

  it('converts PQ as ST 2084 does', () => {
    expect(pqToNits(0.5081)).toBeCloseTo(100, -0.5);
    expect(pqToNits(1)).toBeCloseTo(10000, 0);
  });
});
