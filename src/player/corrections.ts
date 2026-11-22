/**
 * Correcting a fact the equipment got wrong (Expert drawer, notes/EXPERT-DRAWER.md;
 * CONTRIBUTING.md → "Settings describe the hardware, never taste").
 *
 * A correction is the user's word about one device — this receiver takes
 * TrueHD after all, takes 8 PCM channels, this screen's peak is 800 nits —
 * kept per device under the equipment check's stable id, so a laptop at a
 * desk never carries the home-cinema receiver's. Auto (what the device says)
 * is always the default, and a correction is never passed off as the
 * device's own answer: everywhere it shows, both values show ("you said 8;
 * the receiver says 2"), and Copy facts writes "corrected by the user".
 *
 * What each one changes:
 *  - **Formats** (Auto/On/Off per receiver): what `audio-spdif` passes through.
 *  - **PCM channels**: the layouts offered to mpv when sound goes straight to
 *    the receiver (`audio-channels`) — decoded 7.1 is no longer folded to 2.
 *  - **Screen peak**: words only (owner, 2026-11-22). Skrin sends HDR as
 *    mastered and the screen tone maps; the value is said in the stats panel
 *    and Copy facts, and drives nothing.
 *
 * Before 0.22 the formats were one global Auto/On/Off each
 * (`audio_bitstream_<codec>`); `migrateLegacy` moves them, once, to the device
 * the sound goes to.
 */
import { getSetting, setSetting } from '../metadata/api';
import type { AudioDevice, Display, Probe } from './equipment';

/** Setting key: every device's corrections, as JSON (`Corrections`). */
export const CORRECTIONS_KEY = 'equipment_corrections';

export type FormatCorrection = 'on' | 'off';

export interface DeviceCorrection {
  /** Per format (mpv's codec name, as `audio-spdif` takes it). */
  formats?: Partial<Record<string, FormatCorrection>>;
  /** PCM channels the receiver takes, sent straight to it. */
  pcm_channels?: number;
  /** The screen's peak brightness in nits (said only). */
  peak_nits?: number;
  /**
   * Corrections already told "the device now says the same" — `pcm_channels`,
   * `peak_nits`, `formats.<codec>` — so it is said once, not every time.
   */
  told?: string[];
}

export interface Corrections {
  /** By the equipment check's stable id (`Display.id`, `AudioDevice.id`). */
  devices: Record<string, DeviceCorrection>;
  /** The global per-format values of before 0.22 have been moved to a device. */
  migrated?: boolean;
}

/** The PCM channel counts a receiver can be said to take (a step list, not a text box). */
export const PCM_STEPS = [2, 6, 8] as const;

/** Peak brightness steps in nits, for a remote's Left/Right. */
export const PEAK_STEPS = [
  300, 400, 500, 600, 700, 800, 1000, 1200, 1500, 2000, 3000, 4000,
] as const;

export const NO_CORRECTIONS: Corrections = { devices: {} };

const isFormat = (v: unknown): v is FormatCorrection => v === 'on' || v === 'off';
const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && Math.trunc(v) === v;

/** Read defensively: anything odd is no correction (Auto). */
export function parseCorrections(raw: string | null): Corrections {
  if (!raw) return { devices: {} };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { devices: {} };
    const v = value as { devices?: unknown; migrated?: unknown };
    const devices: Record<string, DeviceCorrection> = {};
    if (typeof v.devices === 'object' && v.devices !== null && !Array.isArray(v.devices)) {
      for (const [id, entry] of Object.entries(v.devices as Record<string, unknown>)) {
        if (typeof entry !== 'object' || entry === null) continue;
        const e = entry as Record<string, unknown>;
        const out: DeviceCorrection = {};
        if (typeof e.formats === 'object' && e.formats !== null) {
          const formats = Object.entries(e.formats as Record<string, unknown>).filter(
            (pair): pair is [string, FormatCorrection] => isFormat(pair[1])
          );
          if (formats.length > 0) out.formats = Object.fromEntries(formats);
        }
        if (isCount(e.pcm_channels)) out.pcm_channels = e.pcm_channels;
        if (isCount(e.peak_nits)) out.peak_nits = e.peak_nits;
        if (Array.isArray(e.told)) out.told = e.told.filter((t): t is string => typeof t === 'string');
        if (out.formats || out.pcm_channels || out.peak_nits) devices[id] = out;
      }
    }
    return { devices, migrated: v.migrated === true ? true : undefined };
  } catch {
    return { devices: {} };
  }
}

export async function readCorrections(): Promise<Corrections> {
  return parseCorrections(await getSetting(CORRECTIONS_KEY).catch(() => null));
}

export function saveCorrections(c: Corrections): Promise<void> {
  return setSetting(CORRECTIONS_KEY, JSON.stringify(c));
}

/** `c` with one device's corrections changed; an empty one is removed (Auto everywhere). */
export function withDevice(
  c: Corrections,
  id: string,
  change: (d: DeviceCorrection) => DeviceCorrection
): Corrections {
  const next = change({ ...(c.devices[id] ?? {}) });
  const devices = { ...c.devices };
  const empty =
    !next.pcm_channels && !next.peak_nits && Object.keys(next.formats ?? {}).length === 0;
  if (empty) delete devices[id];
  else devices[id] = next;
  return { ...c, devices };
}

/** Set (a value) or clear (null: back to Auto) one fact; its "said once" note starts again. */
export function setFact(
  c: Corrections,
  id: string,
  fact: 'pcm_channels' | 'peak_nits' | `formats.${string}`,
  value: number | FormatCorrection | null
): Corrections {
  return withDevice(c, id, (d) => {
    const told = (d.told ?? []).filter((t) => t !== fact);
    const next: DeviceCorrection = { ...d, told: told.length > 0 ? told : undefined };
    if (fact.startsWith('formats.')) {
      const codec = fact.slice('formats.'.length);
      const formats = { ...(d.formats ?? {}) };
      if (value === null) delete formats[codec];
      else formats[codec] = value as FormatCorrection;
      next.formats = Object.keys(formats).length > 0 ? formats : undefined;
    } else if (fact === 'pcm_channels') {
      next.pcm_channels = value === null ? undefined : (value as number);
    } else {
      next.peak_nits = value === null ? undefined : (value as number);
    }
    return next;
  });
}

/** Mark "the device now says the same" as said for `fact`. */
export function markTold(c: Corrections, id: string, fact: string): Corrections {
  return withDevice(c, id, (d) => ({ ...d, told: [...new Set([...(d.told ?? []), fact])] }));
}

/**
 * The global per-format values (before 0.22) moved to `deviceId`, the device
 * the sound goes to now. Null when there is nothing to do yet: already moved,
 * or no device to move them to (they keep applying as before until there is).
 * A device that already has its own value for a format keeps it.
 */
export function migrateLegacy(
  c: Corrections,
  legacy: Partial<Record<string, string>>,
  deviceId: string | null
): Corrections | null {
  if (c.migrated) return null;
  const values = Object.entries(legacy).filter((pair): pair is [string, FormatCorrection] =>
    isFormat(pair[1])
  );
  if (values.length === 0) return { ...c, migrated: true };
  if (!deviceId) return null;
  const moved = withDevice(c, deviceId, (d) => ({
    ...d,
    formats: { ...Object.fromEntries(values), ...(d.formats ?? {}) },
  }));
  return { ...moved, migrated: true };
}

// ---- the facts, with both values ---------------------------------------------

/** One fact: what the device says, what the user said, and the one used. */
export interface Fact<T> {
  device: T | null;
  corrected: T | null;
  used: T | null;
}

export function pcmFact(c: Corrections, device: AudioDevice | null): Fact<number> {
  const said = device?.max_pcm_channels ?? null;
  const corrected = (device && c.devices[device.id]?.pcm_channels) || null;
  return { device: said, corrected, used: corrected ?? said };
}

export function peakFact(c: Corrections, display: Display | null): Fact<number> {
  const said = display?.peak_nits ? Math.round(display.peak_nits) : null;
  const corrected = (display && c.devices[display.id]?.peak_nits) || null;
  return { device: said, corrected, used: corrected ?? said };
}

/** A format: the probe's answer, and the user's On/Off if there is one. */
export function formatFact(
  c: Corrections,
  device: AudioDevice | null,
  codec: string
): { device: Probe | null; corrected: FormatCorrection | null } {
  const probe = device?.bitstream.find((b) => b.codec === codec)?.result ?? null;
  const corrected = (device && c.devices[device.id]?.formats?.[codec]) || null;
  return { device: probe, corrected };
}

/** The correction says what the device now says too: it can go. */
export function agrees<T>(f: Fact<T>): boolean {
  return f.corrected !== null && f.device !== null && f.corrected === f.device;
}

export function formatAgrees(f: ReturnType<typeof formatFact>): boolean {
  return (f.corrected === 'on' && f.device === 'yes') || (f.corrected === 'off' && f.device === 'no');
}

/** "the receiver says 2", "the receiver says nothing". */
function says(who: string, value: string | null): string {
  return value === null ? `${who} says nothing` : `${who} says ${value}`;
}

/**
 * Both values, as Settings and the stats panel say them:
 * "8 channels — you said; the receiver says 2". Null when nothing is corrected.
 */
export function bothValues<T>(
  f: Fact<T>,
  who: string,
  unit: (v: T) => string
): string | null {
  if (f.corrected === null) return null;
  return `${unit(f.corrected)} — you said; ${says(who, f.device === null ? null : unit(f.device))}`;
}

const PROBE_WORDS: Record<Probe, string> = {
  yes: 'it takes it',
  no: 'it does not take it',
  busy: 'it was busy when asked',
  not_allowed: 'it could not be asked',
  unknown: 'nothing',
};

/** "On — you said; the receiver says it does not take it". */
export function formatBothValues(f: ReturnType<typeof formatFact>, who: string): string | null {
  if (f.corrected === null) return null;
  const said = f.device ? PROBE_WORDS[f.device] : 'nothing';
  return `${f.corrected === 'on' ? 'On' : 'Off'} — you said; ${who} says ${said}`;
}

/** For Copy facts: `2 (device) — 8 (corrected by the user, used)`. */
export function copyValue<T>(
  f: Fact<T>,
  unit: (v: T) => string,
  usedFor: 'used' | 'said only, changes nothing' = 'used'
): string {
  const device = f.device === null ? 'not reported (device)' : `${unit(f.device)} (device)`;
  if (f.corrected === null) return f.device === null ? 'not reported' : unit(f.device);
  return `${device} — ${unit(f.corrected)} (corrected by the user, ${usedFor})`;
}

/** Said on `window` when a correction changes, so Settings' Sound summary reads them again. */
export const CORRECTIONS_EVENT = 'skrin-corrections';

/** The facts a device's correction now agrees with: said once, then it can go. */
export function agreements(
  c: Corrections,
  displays: Display[],
  audio: AudioDevice[]
): { id: string; fact: string; words: string }[] {
  const out: { id: string; fact: string; words: string }[] = [];
  const fresh = (id: string, fact: string) => !(c.devices[id]?.told ?? []).includes(fact);
  for (const d of displays) {
    if (agrees(peakFact(c, d)) && fresh(d.id, 'peak_nits')) {
      out.push({ id: d.id, fact: 'peak_nits', words: `${d.name} now reports the same peak` });
    }
  }
  for (const a of audio) {
    if (agrees(pcmFact(c, a)) && fresh(a.id, 'pcm_channels')) {
      out.push({ id: a.id, fact: 'pcm_channels', words: `${a.name} now reports the same channels` });
    }
    for (const b of a.bitstream) {
      const fact = `formats.${b.codec}`;
      if (formatAgrees(formatFact(c, a, b.codec)) && fresh(a.id, fact)) {
        out.push({ id: a.id, fact, words: `${a.name} now says the same about ${b.label}` });
      }
    }
  }
  return out;
}

/** The step a press of − or + goes to from `from` (Auto starts at the screen's own value). */
export function nextPeak(from: number | null, up: boolean): number {
  const start = from ?? 600;
  if (up) return PEAK_STEPS.find((s) => s > start) ?? PEAK_STEPS[PEAK_STEPS.length - 1];
  return [...PEAK_STEPS].reverse().find((s) => s < start) ?? PEAK_STEPS[0];
}

/** The corrections set for one device, both values each, said under it while the drawer is shut. */
export function correctionLines(c: Corrections, device: Display | AudioDevice): string[] {
  if (!c.devices[device.id]) return [];
  if ('peak_nits' in device) {
    const peak = bothValues(peakFact(c, device), 'the screen', (n) => `${n} nits`);
    return peak ? [`Peak brightness: ${peak}`] : [];
  }
  const out: string[] = [];
  const pcm = bothValues(pcmFact(c, device), 'the device', String);
  if (pcm) out.push(`PCM channels: ${pcm}`);
  for (const b of device.bitstream) {
    const f = formatBothValues(formatFact(c, device, b.codec), 'the device');
    if (f) out.push(`${b.label} untouched: ${f}`);
  }
  return out;
}

