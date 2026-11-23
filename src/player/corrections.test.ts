import { describe, expect, it } from 'vitest';
import type { AudioDevice, Display, Probe } from './equipment';
import {
  agreements,
  bothValues,
  copyValue,
  correctionLines,
  formatBothValues,
  formatFact,
  markTold,
  migrateLegacy,
  nextPeak,
  parseCorrections,
  pcmFact,
  peakFact,
  setFact,
  type Corrections,
} from './corrections';
import { channelsFor, planAudio, type AudioSettings } from './audioOutput';
import { equipmentFacts } from './rawFacts';
import { peakWords, soundCorrections, stepDownCause } from './stats';
import { checkSound, foldedWhy, type OutputFacts } from './outputCheck';

const CODECS = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'];
const RECEIVER = 'receiver-endpoint';
const SPEAKERS = 'speakers-endpoint';

function sound(id: string, results: Probe[], pcm: number | null = 2): AudioDevice {
  return {
    name: id === RECEIVER ? 'Receiver' : 'Speakers',
    id,
    is_default: id === RECEIVER,
    connection: 'HDMI',
    mix_channels: 2,
    mix_layout: 'stereo',
    mix_rate: 48000,
    max_pcm_channels: pcm,
    spatial_objects: null,
    bitstream: CODECS.map((codec, i) => ({
      codec,
      label: codec.toUpperCase(),
      result: results[i] ?? 'no',
      detail: null,
      remembered: false,
    })),
    notes: [],
    connected: true,
    first_seen: 0,
    last_seen: 0,
    new: false,
  };
}

function screen(peak: number | null): Display {
  return {
    id: 'screen-path',
    name: 'TV',
    gdi_name: 'DISPLAY1',
    connection: 'HDMI',
    width: 3840,
    height: 2160,
    refresh_num: 60,
    refresh_den: 1,
    hdr: 'on',
    screen_hdr: true,
    peak_nits: peak,
    full_frame_nits: null,
    min_nits: null,
    bits_per_color: 10,
    modes: [],
    notes: [],
    connected: true,
    first_seen: 0,
    last_seen: 0,
    new: false,
  };
}

const receiver = sound(RECEIVER, ['yes', 'yes', 'yes', 'no', 'no'], 2);
const direct: AudioSettings = {
  direct: { policy: 'all', devices: [] },
  deviceId: null,
  overrides: {},
};

describe('parseCorrections', () => {
  it('keeps what is well formed and drops the rest', () => {
    const c = parseCorrections(
      JSON.stringify({
        migrated: true,
        devices: {
          a: { formats: { truehd: 'on', dts: 'maybe' }, pcm_channels: 8, peak_nits: -3 },
          b: { pcm_channels: 'eight' },
          c: 'nonsense',
        },
      })
    );
    expect(c).toEqual({ migrated: true, devices: { a: { formats: { truehd: 'on' }, pcm_channels: 8 } } });
  });

  it('reads nothing, or not JSON, as Auto everywhere', () => {
    expect(parseCorrections(null)).toEqual({ devices: {} });
    expect(parseCorrections('{oops')).toEqual({ devices: {} });
  });
});

describe('migrating the global format values of before 0.22', () => {
  it('moves them to the device the sound goes to, once', () => {
    const moved = migrateLegacy({ devices: {} }, { truehd: 'on', dts: 'off', ac3: 'auto' }, RECEIVER);
    expect(moved).toEqual({
      migrated: true,
      devices: { [RECEIVER]: { formats: { truehd: 'on', dts: 'off' } } },
    });
    expect(migrateLegacy(moved!, { truehd: 'on' }, RECEIVER)).toBeNull();
  });

  it('waits for a device, and the old values keep applying meanwhile', () => {
    expect(migrateLegacy({ devices: {} }, { truehd: 'on' }, null)).toBeNull();
    const settings = { ...direct, overrides: { truehd: 'on' as const } };
    expect(planAudio(settings, receiver).spdif).toContain('truehd');
  });

  it('marks nothing to move as done', () => {
    expect(migrateLegacy({ devices: {} }, { truehd: 'auto' }, null)).toEqual({
      devices: {},
      migrated: true,
    });
  });

  it("keeps a device's own value over the old global one", () => {
    const c: Corrections = { devices: { [RECEIVER]: { formats: { truehd: 'off' } } } };
    expect(migrateLegacy(c, { truehd: 'on' }, RECEIVER)!.devices[RECEIVER].formats).toEqual({
      truehd: 'off',
    });
  });
});

describe('a correction is per device', () => {
  const c = setFact(
    setFact({ devices: {}, migrated: true }, RECEIVER, 'formats.truehd', 'on'),
    RECEIVER,
    'pcm_channels',
    8
  );

  it('changes the receiver: TrueHD untouched, decoded sound as 7.1 instead of folded to 2', () => {
    const plan = planAudio({ ...direct, corrections: c }, receiver);
    expect(plan.spdif).toContain('truehd');
    expect(plan.channels).toBe(channelsFor(8));
    // Without the correction the receiver's own answer: stereo.
    expect(planAudio({ ...direct, corrections: { devices: {}, migrated: true } }, receiver).channels).toBe(
      'stereo'
    );
  });

  it('leaves another device alone', () => {
    const speakers = sound(SPEAKERS, ['yes'], 2);
    const plan = planAudio({ ...direct, corrections: c }, speakers);
    expect(plan.spdif).toEqual(['ac3']);
    expect(plan.channels).toBe('stereo');
  });

  it('goes back to Auto, and the device record with it, when set to Auto', () => {
    const back = setFact(setFact(c, RECEIVER, 'formats.truehd', null), RECEIVER, 'pcm_channels', null);
    expect(back.devices[RECEIVER]).toBeUndefined();
  });
});

describe('both values, everywhere', () => {
  const c = setFact(
    setFact({ devices: {} }, RECEIVER, 'pcm_channels', 8),
    'screen-path',
    'peak_nits',
    800
  );

  it('Settings: what you said and what the device says', () => {
    expect(bothValues(pcmFact(c, receiver), 'the device', (n) => `${n} channels`)).toBe(
      '8 channels — you said; the device says 2 channels'
    );
    expect(bothValues(peakFact(c, screen(null)), 'the screen', (n) => `${n} nits`)).toBe(
      '800 nits — you said; the screen says nothing'
    );
    expect(bothValues(pcmFact({ devices: {} }, receiver), 'the device', String)).toBeNull();
    const on = setFact({ devices: {} }, RECEIVER, 'formats.dts-hd', 'on');
    expect(formatBothValues(formatFact(on, receiver, 'dts-hd'), 'the device')).toBe(
      'On — you said; the device says it does not take it'
    );
    expect(correctionLines(c, receiver)).toEqual(['PCM channels: 8 — you said; the device says 2']);
    expect(correctionLines(c, screen(600))).toEqual([
      'Peak brightness: 800 nits — you said; the screen says 600 nits',
    ]);
  });

  it('the stats panel: the Sound check that used it, and the screen peak as words only', () => {
    const said = soundCorrections(c, receiver, 'truehd', true);
    expect(said).toEqual(['PCM channels 8 — you said; the receiver says 2']);
    expect(soundCorrections(c, receiver, 'truehd', false)).toEqual([]);
    const facts = {
      audio: {
        codec: 'truehd',
        outFormat: 's32',
        inChannels: 8,
        outChannels: 8,
        direct: true,
        device: receiver,
        corrections: said,
      },
    } as unknown as OutputFacts;
    expect(checkSound(facts)!.why).toMatch(
      /Your correction: PCM channels 8 — you said; the receiver says 2\.$/
    );
    expect(peakWords(c, screen(600))).toMatch(
      /^Peak 800 nits — you said; the screen says 600 nits\. Said only:/
    );
    expect(peakWords({ devices: {} }, screen(600))).toBeNull();
  });

  it('Copy facts: "corrected by the user", beside what the device said', () => {
    expect(copyValue(pcmFact(c, receiver), String)).toBe('2 (device) — 8 (corrected by the user, used)');
    expect(copyValue(pcmFact({ devices: {} }, receiver), String)).toBe('2');
    const text = equipmentFacts(
      { gpus: [], displays: [screen(600)], audio: [receiver], problems: [], checked_at: 0 },
      'Windows',
      setFact(c, RECEIVER, 'formats.truehd', 'on')
    );
    expect(text).toContain('Direct PCM channels: 2 (device) — 8 (corrected by the user, used)');
    expect(text).toContain('peak 600 nits (device) — 800 nits (corrected by the user, said only, changes nothing)');
    expect(text).toContain('TRUEHD no (device) — on (corrected by the user, used)');
  });
});

describe('when the device says the same again', () => {
  it('is said once, then not again', () => {
    const c = setFact({ devices: {} }, RECEIVER, 'pcm_channels', 8);
    const fixed = { ...receiver, max_pcm_channels: 8 };
    const now = agreements(c, [], [fixed]);
    expect(now).toEqual([
      { id: RECEIVER, fact: 'pcm_channels', words: 'Receiver now reports the same channels' },
    ]);
    const told = markTold(c, RECEIVER, 'pcm_channels');
    expect(agreements(told, [], [fixed])).toEqual([]);
    // Set again: said again when it agrees.
    expect(agreements(setFact(told, RECEIVER, 'pcm_channels', 8), [], [fixed])).toHaveLength(1);
  });

  it('covers formats and the screen peak', () => {
    let c = setFact({ devices: {} }, RECEIVER, 'formats.truehd', 'off');
    c = setFact(c, 'screen-path', 'peak_nits', 600);
    expect(agreements(c, [screen(600)], [receiver]).map((a) => a.fact)).toEqual([
      'peak_nits',
      'formats.truehd',
    ]);
  });
});

describe('the peak step list', () => {
  it('steps from the screen value, or 600 when it says nothing, and stops at the ends', () => {
    expect(nextPeak(null, true)).toBe(700);
    expect(nextPeak(650, false)).toBe(600);
    expect(nextPeak(4000, true)).toBe(4000);
    expect(nextPeak(300, false)).toBe(300);
  });
});

describe("D6's cause, for the Why line", () => {
  it('says what was missed and when', () => {
    const at = Date.UTC(2026, 10, 22, 12) / 1000;
    expect(stepDownCause({ level: 1, percent: null, cause: { percent: 4.25, at } })).toMatch(
      /^The graphics card missed 4\.3 % of frames on .*2026; each step is the cheapest loss left/
    );
  });

  it('says when it was not recorded (a level kept before 0.22)', () => {
    expect(stepDownCause({ level: 1, percent: null })).toMatch(/when was not recorded/);
  });
});

describe('found on the real player (R12-E)', () => {
  it('a corrected fold-down is not said as the device\'s own limit', () => {
    const facts = {
      audio: {
        codec: 'ac3',
        outFormat: 's32',
        inChannels: 6,
        outChannels: 2,
        direct: true,
        device: receiver,
        corrections: ['PCM channels 2 — you said; the receiver says 6'],
        pcmCorrected: 2,
      },
    } as unknown as OutputFacts;
    const why = checkSound(facts)!.why!;
    expect(why).toMatch(/^Sent as 2 channels: what you said Receiver takes\. Your correction:/);
    expect(why).not.toMatch(/takes only/);
  });

  it('a correction above what the device accepted is said as the device doing it, with both values', () => {
    // Said 6; mpv asked for 5.1(side),5.1,stereo; the device gave stereo (Linux test PC, R12-R).
    const facts = {
      audio: {
        codec: 'ac3',
        outFormat: 's32',
        inChannels: 6,
        outChannels: 2,
        direct: true,
        device: receiver,
        corrections: ['PCM channels 6 — you said; the receiver says 2'],
        pcmCorrected: 6,
      },
    } as unknown as OutputFacts;
    const why = checkSound(facts)!.why!;
    expect(why).toMatch(/^You said Receiver takes 6 channels, but it took only 2, so the sound went as 2\./);
    expect(why).toMatch(/Your correction: PCM channels 6 — you said; the receiver says 2\.$/);
    expect(why).not.toMatch(/Sent as 2 channels: what you said/);
  });

  it('no correction: the device own limit', () => {
    expect(foldedWhy('the device', 2, null)).toBe('The device takes only 2 channels.');
  });

  it('Copy facts leaves out device names that the rows say', async () => {
    const { rawFactsText } = await import('./rawFacts');
    const text = rawFactsText({
      version: '0',
      system: 'Windows',
      equipment: { gpus: [], displays: [screen(600)], audio: [receiver], problems: [], checked_at: 0 },
      groups: [{ heading: 'Output check', rows: [{ label: 'Sound', value: 'x', note: 'Receiver takes only 2 channels.' }] }],
    });
    expect(text).toContain('<device> takes only 2 channels.');
    expect(text).not.toContain('Receiver takes');
  });
});
