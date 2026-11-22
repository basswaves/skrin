import { describe, expect, it } from 'vitest';
import { chosenOptions, noteChosen, noteChosenAll, resetChosen } from './chosenOptions';
import { rawFactsText, scrub } from './rawFacts';
import type { Equipment } from './equipment';

const eq: Equipment = {
  gpus: ['Some GPU'],
  displays: [
    {
      connected: true,
      first_seen: 0,
      last_seen: 0,
      new: false,
      id: 'SECRET-ID',
      name: 'Secret Model',
      gdi_name: 'x',
      connection: 'HDMI',
      width: 3840,
      height: 2160,
      refresh_num: 60000,
      refresh_den: 1001,
      hdr: 'on',
      screen_hdr: true,
      peak_nits: 1000,
      full_frame_nits: 600,
      min_nits: 0.005,
      bits_per_color: 10,
      modes: [
        { width: 1920, height: 1080, hz: 60, rate: 60 },
        { width: 3840, height: 2160, hz: 24, rate: 23.976 },
        { width: 3840, height: 2160, hz: 60, rate: 59.94 },
      ],
      notes: ['HDR is on.'],
    },
  ],
  audio: [
    {
      connected: true,
      first_seen: 0,
      last_seen: 0,
      new: false,
      name: 'Secret Receiver',
      id: 'SECRET-AUDIO',
      is_default: true,
      connection: 'HDMI',
      mix_channels: 8,
      mix_layout: '7.1',
      mix_rate: 48000,
      max_pcm_channels: 8,
      spatial_objects: null,
      bitstream: [
        { codec: 'truehd', label: 'Dolby TrueHD', result: 'yes', detail: null, remembered: false },
      ],
      notes: [],
    },
  ],
  problems: [],
  checked_at: 1_700_000_000,
};

describe('raw facts', () => {
  it('says what the equipment reported, without names or ids', () => {
    const t = rawFactsText({
      version: '1.0.0',
      system: 'Windows',
      equipment: eq,
      chosen: {},
      groups: [],
    });
    expect(t).toContain('Screen 1 (HDMI): 3840×2160 at 59.94 Hz');
    expect(t).toContain('peak 1000 nits, full-frame 600 nits, black 0.005 nits');
    expect(t).toContain('3840×2160: 23.976 / 59.94 Hz; 1920×1080: 60 Hz');
    expect(t).toContain('Dolby TrueHD yes');
    expect(t).toContain('Graphics: Some GPU');
    expect(t).not.toMatch(/SECRET|Secret/);
  });

  it('lists the options Skrin set and leaves out places, devices and viewer state', () => {
    resetChosen();
    noteChosenAll({
      'log-file': 'C:\\Users\\x\\mpv.log',
      'gpu-shader-cache-dir': '/home/x/cache',
      hwdec: 'd3d11va',
      deband: true,
      'tone-mapping': 'bt.2390',
    });
    noteChosen('audio-device', 'wasapi/{id}');
    noteChosen('volume', 80);
    noteChosen('icc-profile', 'whatever');
    noteChosen('some-option', '/mnt/film.mkv');
    noteChosen('vf', '@skrin-el:format=enhancement-layer=no');
    expect(chosenOptions()).toEqual({
      hwdec: 'd3d11va',
      deband: 'yes',
      'tone-mapping': 'bt.2390',
      'icc-profile': 'whatever',
      vf: '@skrin-el:format=enhancement-layer=no',
    });
    const t = rawFactsText({
      version: null,
      system: 'Linux',
      equipment: null,
      chosen: chosenOptions(),
    });
    expect(t).toContain('hwdec=d3d11va');
    expect(t).toContain('deband=yes');
    expect(t).not.toContain('log-file');
    resetChosen();
  });

  it('puts the stats rows in, and scrubs a path that got into one', () => {
    const t = rawFactsText({
      version: '1',
      system: 'Windows',
      equipment: null,
      chosen: {},
      groups: [
        {
          heading: 'Source',
          rows: [{ label: 'File', value: 'D:\\Films\\A.mkv', note: 'in /home/x/A.mkv' }],
        },
      ],
    });
    expect(t).toContain('[Source]');
    expect(t).toContain('File: <path> (in <path>)');
    expect(scrub('plain 24 Hz text')).toBe('plain 24 Hz text');
  });
});
