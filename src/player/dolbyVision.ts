/**
 * Dolby Vision on the desktop: whether this mpv can merge a profile 7 film's
 * enhancement layer, and what the details panel says it did.
 *
 * No PC playback path sends a Dolby Vision signal, so a Dolby Vision film is
 * always drawn as HDR10 (or SDR). From mpv 0.42 with libplacebo 7.387, a
 * profile 7 film's full enhancement layer (FEL) is merged into that picture
 * — the disc's whole grade, nothing invented. An older mpv (a Linux system's
 * own, say) draws the HDR10 base layer only. Which one this is, is asked of
 * mpv itself, never read from a version or a system's name: the `format`
 * filter's `enhancement-layer` option exists exactly where the merging does.
 *
 * What was drawn is read from the render passes libplacebo ran
 * (`vo-passes`): an "enhancement layer" pass is the merge itself. A minimal
 * layer (MEL) adds nothing, so libplacebo runs no such pass for it.
 */
import { mpvCommand } from './engine';
import type { Brightness, VideoDetails } from '../ui/badges';
import type { StatRow } from './stats';

let supported: boolean | null = null;

/**
 * Ask mpv once, before any film is open, whether it knows the enhancement
 * layer: setting a filter with an option it does not have is refused at
 * once, and nothing is playing for the filter to act on. Put back to no
 * filter either way. Never throws.
 */
export async function probeEnhancementLayer(): Promise<void> {
  try {
    await mpvCommand('set', ['vf', '@skrin-el-probe:format=enhancement-layer=yes']);
    supported = true;
  } catch {
    supported = false;
  }
  try {
    await mpvCommand('set', ['vf', '']);
  } catch (e) {
    console.warn('dolby vision: could not clear the probe filter', e);
  }
  console.info(
    `dolby vision: this mpv ${supported ? 'can' : 'cannot'} merge a profile 7 enhancement layer`
  );
}

/** Whether this mpv can merge an enhancement layer; null when not asked (Android, or not yet). */
export const enhancementLayerSupported = (): boolean | null => supported;

/** Whether libplacebo merged an enhancement layer into the last frame, from `vo-passes`. */
export function mergedEnhancementLayer(passes: string | null): boolean {
  try {
    const fresh = (JSON.parse(passes ?? '') as { fresh?: unknown }).fresh;
    if (!Array.isArray(fresh)) return false;
    return fresh.some(
      (p) => typeof p?.desc === 'string' && /\benhancement layer\b/.test(p.desc as string)
    );
  } catch {
    return false;
  }
}

/** What the panel knows about a profile 7 film's enhancement layer. */
export interface LayerFacts {
  /** libplacebo ran the merge pass on the last frame. */
  merged: boolean;
  /** This mpv can merge one at all; null if not known. */
  supported: boolean | null;
  /** Skrin turned it off to keep up (stepDown.ts). */
  steppedDown: boolean;
}

const NO_DV = 'Skrin cannot send Dolby Vision itself';

/**
 * What happens to a Dolby Vision track. A PC has no way to send a Dolby
 * Vision signal to a TV — Windows and Linux alike — so it is always shown as
 * HDR10; how depends on the profile. `null` for a file that is not Dolby
 * Vision (or whose container does not say).
 */
export function describeDolbyVision(
  profile: number | null,
  layer: LayerFacts = { merged: false, supported: null, steppedDown: false }
): StatRow | null {
  if (profile === null || profile <= 0) return null;
  const label = 'Dolby Vision';
  switch (profile) {
    case 5:
      return {
        label,
        value: 'profile 5 → converted to HDR10',
        note: `no HDR10 layer in the file, so its own Dolby Vision metadata maps it; ${NO_DV}`,
      };
    case 7:
      return describeProfile7(layer);
    case 8:
      return {
        label,
        value: 'profile 8 → HDR10 base layer',
        note: `made to fall back to HDR10 (or HLG), which is shown with its Dolby Vision metadata applied; ${NO_DV}`,
      };
    default:
      return { label, value: `profile ${profile} → HDR10`, note: NO_DV };
  }
}

function describeProfile7(layer: LayerFacts): StatRow {
  const label = 'Dolby Vision';
  if (layer.merged) {
    return {
      label,
      value: 'profile 7 → enhancement layer merged',
      note: `the disc’s full enhancement layer is merged into its HDR10 picture, as it was graded; ${NO_DV}`,
    };
  }
  const [reason, why] = layer.steppedDown
    ? [
        'dropped to keep up',
        'the enhancement layer was turned off because the graphics card fell behind',
      ]
    : layer.supported === false
      ? ['not supported here', 'this version of mpv cannot merge an enhancement layer']
      : layer.supported === true
        ? [
            'nothing merged',
            'nothing was merged from the enhancement layer, which is what a minimal one (MEL) gives; for a full one (FEL), mpv.log says why',
          ]
        : ['enhancement layer not used', 'the enhancement layer is not used'];
  return {
    label,
    value: `profile 7 → base layer only (${reason})`,
    note: `the disc’s HDR10 layer is shown: ${why}; ${NO_DV}`,
    warn: layer.steppedDown || layer.supported === false,
  };
}

/** Nits as the panel writes them: whole above 10, one decimal below. */
const nits = (n: number): string => `${n < 10 ? n.toFixed(1) : n.toFixed(0)} nits`;

const brightnessValue = (b: Brightness): string =>
  `up to ${nits(b.peak_nits)} · average ${nits(b.average_nits)}`;

/**
 * What the film's own dynamic metadata says — Dolby Vision's RPU, HDR10+ —
 * as the probe read it from the file at a few places across the film
 * (dynamic_hdr.rs). Never from mpv, and nothing at all for a file that was
 * not read that way (no ffmpeg, or read before the probe learnt it).
 */
export function describeFileMetadata(video: VideoDetails | null | undefined): StatRow[] {
  const rows: StatRow[] = [];
  const dv = video?.dolby_vision?.metadata;
  if (dv && dv.rpus === 0) {
    rows.push({
      label: 'Dolby Vision',
      value: 'labelled, but no metadata in the file',
      note: `the file is labelled Dolby Vision, but none of the ${dv.points} places read across it carries Dolby Vision metadata, so only its base layer can be shown`,
      warn: true,
    });
  } else if (dv) {
    const trims = [dv.l2_trims && 'L2', dv.l8_trims && 'L8'].filter(Boolean).join(', ');
    const layer = dv.enhancement_layer ?? video?.dolby_vision?.enhancement_layer;
    rows.push({
      label: 'Dolby Vision grade',
      value: [
        dv.cm_version ? `content mapping ${dv.cm_version}` : null,
        trims ? `trims for other screens (${trims})` : 'no trims for other screens',
      ]
        .filter(Boolean)
        .join(' · '),
      note: `from the file’s own Dolby Vision metadata${
        layer ? `; enhancement layer ${layer === 'FEL' ? 'full (FEL)' : 'minimal (MEL)'}` : ''
      }`,
    });
    if (dv.brightness) {
      rows.push({
        label: 'Scene brightness',
        value: brightnessValue(dv.brightness),
        note: `Dolby Vision L1, from ${dv.brightness.frames} places across the film`,
      });
    }
    const levels = [
      dv.max_cll ? `MaxCLL ${nits(dv.max_cll)}` : null,
      dv.max_fall ? `MaxFALL ${nits(dv.max_fall)}` : null,
      dv.mastering_peak_nits ? `mastered at ${nits(dv.mastering_peak_nits)}` : null,
    ].filter(Boolean);
    if (levels.length > 0) {
      rows.push({
        label: 'Grade’s light levels',
        value: levels.join(' · '),
        note: 'Dolby Vision L6, the grade’s own figures',
      });
    }
  }
  const hdr10p = video?.hdr10_plus ? video.hdr10_plus_metadata : null;
  if (hdr10p && hdr10p.points > 0) {
    const target = hdr10p.target_display_nits
      ? `; made for a ${hdr10p.target_display_nits}-nit display`
      : '';
    rows.push(
      hdr10p.brightness
        ? {
            label: 'HDR10+ brightness',
            value: brightnessValue(hdr10p.brightness),
            note: `HDR10+ metadata, in ${hdr10p.brightness.frames} of ${hdr10p.points} places read across the film${target}`,
          }
        : {
            label: 'HDR10+ brightness',
            value: 'not found across the film',
            note: `HDR10+ is in the file’s first frames, and in none of the ${hdr10p.points} places read across it`,
          }
    );
  }
  return rows;
}

/** SMPTE ST 2084 (PQ), 0–1 → nits. */
export function pqToNits(e: number): number {
  const m1 = 2610 / 16384;
  const m2 = (2523 / 4096) * 128;
  const c1 = 3424 / 4096;
  const c2 = (2413 / 4096) * 32;
  const c3 = (2392 / 4096) * 32;
  const p = Math.pow(Math.max(e, 0), 1 / m2);
  return 10000 * Math.pow(Math.max(p - c1, 0) / (c2 - c3 * p), 1 / m1);
}

/** The peak libplacebo's tone mapping started from on the last frame, from `vo-passes`: "bt2390 tone map (523 -> 84)". */
export function toneMapInput(passes: string | null): number | null {
  try {
    const fresh = (JSON.parse(passes ?? '') as { fresh?: unknown }).fresh;
    if (!Array.isArray(fresh)) return null;
    for (const p of fresh) {
      const m =
        typeof p?.desc === 'string' && /tone map \((\d+(?:\.\d+)?) ->/.exec(p.desc as string);
      if (m) return Number(m[1]);
    }
  } catch {
    /* nothing read */
  }
  return null;
}

/**
 * Whether libplacebo's tone mapping is following the film's own dynamic
 * metadata, read from what mpv reports rather than assumed: the peak the
 * tone-map pass started from on this frame (`vo-passes`) is the frame's
 * Dolby Vision L1 peak (`video-params/max-pq-y`, PQ) or its HDR10+ scene
 * peak (`video-params/scene-max-r/g/b`, nits). libplacebo does not go below
 * SDR white, so a darker frame's value shows as 100 nits. Proven on a real
 * profile 7 film and an HDR10+ one, with peak detection on and off
 * (R12-B2). `null` where nothing is tone mapped or the film has no dynamic
 * metadata.
 */
export function describeDynamicToneMapping(
  input: number | null,
  maxPqY: number | null,
  sceneMax: number | null
): StatRow | null {
  if (input === null || input <= 0) return null;
  const l1 = maxPqY !== null && maxPqY > 0 ? pqToNits(maxPqY) : null;
  const scene = sceneMax !== null && sceneMax > 0 ? sceneMax : null;
  if (l1 === null && scene === null) return null;
  const matches = (v: number | null) =>
    v !== null &&
    (Math.abs(v - input) <= Math.max(2, input * 0.02) || (v < 100 && Math.abs(input - 100) <= 2));
  const source = matches(l1) ? 'Dolby Vision L1' : matches(scene) ? 'HDR10+' : null;
  const label = 'Dynamic metadata';
  if (source) {
    return {
      label,
      value: 'used for tone mapping',
      note: `this frame is tone mapped from ${Math.round(input)} nits, its own ${source} peak, as mpv reports it`,
    };
  }
  return {
    label,
    value: 'not used on this frame',
    note: `this frame is tone mapped from ${Math.round(input)} nits, which is not its own dynamic metadata`,
  };
}
