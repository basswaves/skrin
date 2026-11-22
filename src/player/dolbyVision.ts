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
    ? ['dropped to keep up', 'the enhancement layer was turned off because the graphics card fell behind']
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
