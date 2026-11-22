/**
 * "Copy these facts": the raw answers behind Skrin's choices, as plain text
 * for a forum post or a bug report — what the screens and sound devices said
 * about themselves, the mpv options Skrin set, and what the player is doing
 * now (the stats panel's rows).
 *
 * Read-only, and copying is all it does: nothing is sent anywhere.
 *
 * Left out on purpose (said in the text's own first lines, so a reader of the
 * post knows): screen and sound-device names and ids, serial numbers, file
 * names and paths, film titles. A graphics card's name stays — a report about
 * stutter is useless without it. `scrub` is the net under all of it: a path
 * that got into a row anyway becomes `<path>`.
 */
import type { StatGroup } from './stats';
import {
  formatRate,
  PROBE_LABEL,
  refreshRate,
  type AudioDevice,
  type Display,
  type Equipment,
} from './equipment';

export const LEFT_OUT =
  'Left out on purpose: screen and sound-device names and ids, serial numbers, file names and ' +
  'paths, film titles. Copying is all this does; nothing is sent anywhere.';

/** A folder or file path that slipped into a value becomes `<path>`. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '<path>')
    .replace(/\\\\[^\s"'<>|]+/g, '<path>')
    .replace(/(^|[\s"'(=])\/(?:home|Users|mnt|media|run|var|tmp|srv|opt)\/[^\s"')]*/g, '$1<path>');
}

const nits = (n: number) => (n >= 10 ? String(Math.round(n)) : String(Number(n.toFixed(3))));

/** `3840×2160: 23.976 / 24 / 60 Hz` per size, largest first. */
function modesLine(d: Display): string {
  const bySize = new Map<string, number[]>();
  for (const m of d.modes) {
    const key = `${m.width}×${m.height}`;
    const rates = bySize.get(key) ?? [];
    if (!rates.includes(m.rate)) rates.push(m.rate);
    bySize.set(key, rates);
  }
  const area = (k: string) => k.split('×').reduce((a, b) => a * Number(b), 1);
  return [...bySize.entries()]
    .sort((a, b) => area(b[0]) - area(a[0]))
    .map(
      ([size, rates]) => `${size}: ${rates.sort((a, b) => a - b).map(formatRate).join(' / ')} Hz`
    )
    .join('; ');
}

function displayLines(d: Display, n: number, system: string): string[] {
  const out: string[] = [];
  const mode =
    d.width > 0 ? `${d.width}×${d.height} at ${formatRate(refreshRate(d))} Hz` : 'mode not reported';
  out.push(`Screen ${n} (${d.connection || 'connection not reported'}): ${mode}`);
  const light: string[] = [];
  if (d.peak_nits) light.push(`peak ${nits(d.peak_nits)} nits`);
  if (d.full_frame_nits) light.push(`full-frame ${nits(d.full_frame_nits)} nits`);
  if (d.min_nits !== null) light.push(`black ${nits(d.min_nits)} nits`);
  out.push(
    `  HDR in ${system}: ${d.hdr}; the screen itself offers HDR: ${
      d.screen_hdr === undefined ? 'not recorded' : d.screen_hdr ? 'yes' : 'no'
    }`
  );
  out.push(`  Light levels it reports: ${light.length ? light.join(', ') : 'none'}`);
  out.push(`  Bits per colour: ${d.bits_per_color ?? 'not reported'}`);
  if (d.modes.length > 0) out.push(`  Modes it offers: ${modesLine(d)}`);
  for (const note of d.notes) out.push(`  Skrin's reading: ${note}`);
  return out;
}

function audioLines(a: AudioDevice, n: number, system: string): string[] {
  const out: string[] = [];
  out.push(
    `Sound ${n} (${a.connection || 'connection not reported'})${a.is_default ? ` — ${system} default` : ''}`
  );
  if (a.mix_layout) out.push(`  ${system} mixes to ${a.mix_layout} at ${a.mix_rate} Hz`);
  out.push(
    `  Direct PCM channels: ${a.max_pcm_channels ?? 'not reported'}; spatial sound: ${
      a.spatial_objects ? `on, ${a.spatial_objects} objects` : 'off or not reported'
    }`
  );
  if (a.bitstream.length > 0) {
    out.push(
      '  Takes untouched: ' +
        a.bitstream
          .map((b) => `${b.label} ${PROBE_LABEL[b.result]}${b.remembered ? ' (remembered)' : ''}`)
          .join('; ')
    );
  }
  for (const note of a.notes) out.push(`  Skrin's reading: ${note}`);
  return out;
}

/** What the screens and sound devices said, from the equipment check. */
export function equipmentFacts(eq: Equipment, system: string): string {
  const when = new Date(eq.checked_at * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const out: string[] = [`== What ${system} reports (checked ${when} UTC) ==`];
  if (eq.gpus.length > 0) out.push(`Graphics: ${eq.gpus.join('; ')}`);
  const displays = eq.displays.filter((d) => d.connected);
  const audio = eq.audio.filter((a) => a.connected);
  if (displays.length === 0) out.push('Screens: none found');
  displays.forEach((d, i) => out.push(...displayLines(d, i + 1, system)));
  if (audio.length === 0) out.push('Sound: none found');
  audio.forEach((a, i) => out.push(...audioLines(a, i + 1, system)));
  if (eq.problems.length > 0) out.push(`Could not read: ${eq.problems.join('; ')}`);
  return out.join('\n');
}

/** The options Skrin set, one per line, in the order they were set. */
export function optionsFacts(chosen: Record<string, string>): string {
  const names = Object.keys(chosen);
  const out = ['== mpv options Skrin set (what it chose; mpv defaults are not listed) =='];
  if (names.length === 0) out.push('none yet: the player has not started in this session');
  for (const name of names) out.push(`${name}=${chosen[name]}`);
  return out.join('\n');
}

/** The stats panel's rows as they read now. */
export function playbackFacts(groups: StatGroup[]): string {
  const out = ['== What the player is doing now (the stats panel) =='];
  if (groups.length === 0) out.push('nothing read yet');
  for (const g of groups) {
    out.push(`[${g.heading}]`);
    for (const r of g.rows) out.push(`  ${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`);
  }
  return out.join('\n');
}

export interface RawFacts {
  version: string | null;
  system: string;
  equipment: Equipment | null;
  /** From `chosenOptions()`; omitted where mpv is not the engine. */
  chosen?: Record<string, string>;
  /** The stats panel's groups; omitted where no film plays (Settings). */
  groups?: StatGroup[];
}

/** The whole text, ready for a post. */
export function rawFactsText(f: RawFacts): string {
  const parts = [
    `Skrin ${f.version ?? '(version not known)'} on ${f.system}\n${LEFT_OUT}`,
    f.equipment ? equipmentFacts(f.equipment, f.system) : '== Equipment ==\nnot read',
  ];
  if (f.chosen) parts.push(optionsFacts(f.chosen));
  if (f.groups) parts.push(playbackFacts(f.groups));
  return scrub(parts.join('\n\n')) + '\n';
}
