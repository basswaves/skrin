/**
 * Settings → Your equipment → "Correct a fact" (Expert drawer,
 * notes/EXPERT-DRAWER.md): the few facts a device can report wrong, each
 * Auto (what the device says) first, kept for that device alone
 * (corrections.ts). A fact, never a taste: the choices are what a receiver
 * or a screen *is*, and both values are said wherever a correction is set.
 *
 * Remote, keyboard and mouse alike: every control is a FocusButton row; a
 * number is a step list (− / value / +), never a text box.
 */
import ChoiceRow from './ChoiceRow';
import FocusButton from './FocusButton';
import FocusGroup from './FocusGroup';
import { BITSTREAM_CODECS } from '../player/audioOutput';
import {
  bothValues,
  formatBothValues,
  nextPeak,
  formatFact,
  pcmFact,
  peakFact,
  PCM_STEPS,
  setFact,
  type Corrections,
} from '../player/corrections';
import type { AudioDevice, Display } from '../player/equipment';

type Change = (next: Corrections) => void;

function probeWords(device: AudioDevice, codec: string): string {
  const result = device.bitstream.find((b) => b.codec === codec)?.result;
  return result === 'yes' ? 'takes it' : result === 'no' ? 'does not take it' : 'not known';
}

/** A sound device: the PCM channels it takes, and each format untouched. */
export function SoundCorrections({
  device,
  corrections,
  onChange,
}: {
  device: AudioDevice;
  corrections: Corrections;
  onChange: Change;
}) {
  const pcm = pcmFact(corrections, device);
  const formats = BITSTREAM_CODECS.filter((codec) => device.bitstream.some((b) => b.codec === codec));
  return (
    <div className="correct-facts">
      <ChoiceRow
        label="PCM channels it takes"
        choices={[
          {
            value: 'auto',
            label: `Auto (${pcm.device === null ? 'not reported' : `${pcm.device}`})`,
          },
          ...PCM_STEPS.map((n) => ({ value: String(n), label: String(n) })),
        ]}
        value={pcm.corrected === null ? 'auto' : String(pcm.corrected)}
        onChange={(v) =>
          onChange(setFact(corrections, device.id, 'pcm_channels', v === 'auto' ? null : Number(v)))
        }
        note={
          bothValues(pcm, 'the device', (n) => `${n} channels`) ??
          'Auto uses what the device reports.'
        }
        hint="Decoded sound sent straight to it goes as this many channels: 8 is 7.1, 6 is 5.1. Set it only if the receiver takes more than it reports — sound it cannot take comes out wrong or not at all."
      />
      {formats.map((codec) => {
        const f = formatFact(corrections, device, codec);
        const label = device.bitstream.find((b) => b.codec === codec)?.label ?? codec;
        return (
          <ChoiceRow
            key={codec}
            label={`${label} untouched`}
            choices={[
              { value: 'auto', label: `Auto (${probeWords(device, codec)})` },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={f.corrected ?? 'auto'}
            onChange={(v) =>
              onChange(
                setFact(corrections, device.id, `formats.${codec}`, v === 'auto' ? null : v)
              )
            }
            note={formatBothValues(f, 'the device') ?? undefined}
          />
        );
      })}
      <p className="choice-hint">
        Only force a format on if you know the receiver plays it: one it cannot play comes out as
        silence or noise.
      </p>
    </div>
  );
}

/** A screen: its peak brightness, said only (owner, 2026-11-22). */
export function ScreenCorrections({
  display,
  corrections,
  onChange,
}: {
  display: Display;
  corrections: Corrections;
  onChange: Change;
}) {
  const peak = peakFact(corrections, display);
  const set = (v: number | null) => onChange(setFact(corrections, display.id, 'peak_nits', v));
  return (
    <div className="correct-facts">
      <div className="choice-row">
        <div className="choice-label">Peak brightness</div>
        <FocusGroup kind="row" className="choice-options">
          <FocusButton
            className={`choice ${peak.corrected === null ? 'chosen' : ''}`}
            onSelect={() => set(null)}
          >
            {peak.corrected === null && <span className="choice-tick">✓</span>}
            Auto ({peak.device === null ? 'not reported' : `${peak.device} nits`})
          </FocusButton>
          <FocusButton
            className="choice"
            label="Peak brightness one step lower"
            onSelect={() => set(nextPeak(peak.used, false))}
          >
            −
          </FocusButton>
          <span className="choice-value">{peak.corrected === null ? '—' : `${peak.corrected} nits`}</span>
          <FocusButton
            className="choice"
            label="Peak brightness one step higher"
            onSelect={() => set(nextPeak(peak.used, true))}
          >
            +
          </FocusButton>
        </FocusGroup>
        <p className="choice-note">
          {bothValues(peak, 'the screen', (n) => `${n} nits`) ?? 'Auto uses what the screen reports.'}
        </p>
        <p className="choice-hint">
          Said only: the details panel and Copy facts show it beside what the screen reports. The
          picture does not change — Skrin sends HDR as mastered and the screen does its own tone
          mapping.
        </p>
      </div>
    </div>
  );
}
