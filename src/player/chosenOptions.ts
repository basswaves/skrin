/**
 * What Skrin told mpv to do, remembered as it happens, for "Copy these facts"
 * (rawFacts.ts): the options set at start, the ones applied after it, the
 * step-down's rungs, the colour-space hint, the audio path. Only what Skrin
 * sent — mpv's own defaults are not in it, which is the point: a bug report
 * wants the values someone *chose*.
 *
 * Kept out on purpose: anything that names a place or a device (log and cache
 * folders, a disc path, the audio device id), Skrin's own plumbing (the key and
 * mouse messages), and the viewer's own state (volume, mute, the picked tracks,
 * subtitle timing). Those are not decisions Skrin made for the picture or the
 * sound, and some are personal.
 */

const chosen = new Map<string, string>();

/** Names that hold a place or a device, or are Skrin's own messages. */
const LEFT_OUT_NAME = /(?:^|-)(?:dir|file|device|path|script|scripts|conf)(?:$|-)|term-status-msg|user-data/i;
/** The viewer's own state, not a choice Skrin made. */
const VIEWER_STATE = new Set([
  'volume',
  'mute',
  'pause',
  'fullscreen',
  'aid',
  'sid',
  'secondary-sid',
  'sub-visibility',
  'sub-delay',
  'sub-speed',
  'audio-delay',
  'cursor-autohide',
  'window-dragging',
]);
/** A value that is a folder or file, whatever the name. */
const LOOKS_LIKE_PATH = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/;

function show(value: unknown): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return String(value);
}

/** Remember that Skrin set `name` to `value` (a no-op for what is left out). */
export function noteChosen(name: string, value: unknown): void {
  if (LEFT_OUT_NAME.test(name) || VIEWER_STATE.has(name)) return;
  const text = show(value);
  if (LOOKS_LIKE_PATH.test(text)) return;
  chosen.set(name, text);
}

/** `noteChosen` for a whole set of options. */
export function noteChosenAll(options: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(options)) noteChosen(name, value);
}

/** Everything Skrin has set in this mpv, in the order it was set (a later value replaces). */
export function chosenOptions(): Record<string, string> {
  return Object.fromEntries(chosen);
}

/** For tests. */
export function resetChosen(): void {
  chosen.clear();
}
