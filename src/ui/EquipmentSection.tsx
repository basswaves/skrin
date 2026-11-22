/**
 * Settings → Your equipment: what Skrin can see of the screens and audio
 * outputs this PC is connected to, and what it remembers of ones it has seen
 * before.
 *
 * It describes hardware. The one thing to set is "Correct a fact" under a
 * device (CorrectFacts.tsx, Expert drawer): for when a device reports
 * something wrong — Auto, what it says, first; both values said wherever a
 * correction is used. What it is for, above all, is the one question nobody
 * can answer by looking at a picture: *did Windows actually tell the app the
 * receiver takes TrueHD?*
 *
 * Opening it asks the hardware nothing: every launch already checked, and this
 * shows that. "Check again" is the only thing that re-asks — for when a
 * receiver was switched on or a Windows setting changed since launch.
 */
import { userError } from './errors';
import { useCallback, useEffect, useRef, useState } from 'react';
import FocusButton from './FocusButton';
import CopyFactsButton from './CopyFactsButton';
import { ScreenCorrections, SoundCorrections } from './CorrectFacts';
import {
  agreements,
  CORRECTIONS_EVENT,
  correctionLines,
  markTold,
  NO_CORRECTIONS,
  saveCorrections,
  setFact,
  type Corrections,
} from '../player/corrections';
import { migrateAudioCorrections, readAudioSettings, targetDevice } from '../player/audioOutput';
import {
  checkEquipment,
  formatRate,
  getEquipment,
  hdrLabel,
  PROBE_LABEL,
  refreshRate,
  type AudioDevice,
  type Display,
  type Equipment,
} from '../player/equipment';

type Told = { id: string; fact: string; words: string };

/** A device's corrections: what is set, said; and the drawer to change it. */
function Correct({
  device,
  corrections,
  onChange,
  told,
}: {
  device: Display | AudioDevice;
  corrections: Corrections;
  onChange: (next: Corrections) => void;
  told: Told[];
}) {
  const [open, setOpen] = useState(false);
  const lines = correctionLines(corrections, device);
  const mine = told.filter(
    (t) => t.id === device.id && corrections.devices[device.id] !== undefined
  );
  return (
    <>
      {lines.length > 0 && (
        <ul className="equipment-notes equipment-corrected">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {mine.map((t) => (
        <div className="settings-toggle-row" key={t.fact}>
          <span className="muted">{t.words} — the correction can go.</span>
          <FocusButton
            className="btn-secondary"
            onSelect={() =>
              onChange(setFact(corrections, device.id, t.fact as 'pcm_channels', null))
            }
          >
            Use what it says
          </FocusButton>
        </div>
      ))}
      <div className="settings-toggle-row">
        <FocusButton className="btn-secondary" onSelect={() => setOpen(!open)}>
          {open ? 'Done' : 'Correct a fact'}
        </FocusButton>
        {!open && lines.length === 0 && (
          <span className="muted">Only if it reports something wrong.</span>
        )}
      </div>
      {open &&
        ('peak_nits' in device ? (
          <ScreenCorrections display={device} corrections={corrections} onChange={onChange} />
        ) : (
          <SoundCorrections device={device} corrections={corrections} onChange={onChange} />
        ))}
    </>
  );
}

const day = (secs: number) =>
  new Date(secs * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

interface Remembered {
  name: string;
  connected: boolean;
  last_seen: number;
}

/**
 * Devices remembered but not connected, newest first. One whose name is
 * connected now is left out: a re-created endpoint (new driver, monitor
 * plugged in again) gets a new id under the same name, and listing the old
 * one beside the live one says it is both there and away.
 */
export function awayDevices<A extends Remembered, B extends Remembered>(
  displays: A[],
  audio: B[]
): (A | B)[] {
  const gone = <D extends Remembered>(list: D[]): D[] => {
    const live = new Set(list.filter((d) => d.connected).map((d) => d.name));
    return list.filter((d) => !d.connected && !live.has(d.name));
  };
  return [...gone(displays), ...gone(audio)].sort((a, b) => b.last_seen - a.last_seen);
}

/** `system` is for the wording only: "What Windows reports", "What Linux reports". */
export default function EquipmentSection({ system }: { system: string }) {
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  // Starts true: the saved answer is fetched as soon as the section mounts.
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Corrections>(NO_CORRECTIONS);
  /** "Now says the same" notes, found when the section opened: said this visit, not again. */
  const [told, setTold] = useState<Told[]>([]);
  const readOnce = useRef(false);

  const changeCorrections = useCallback((next: Corrections) => {
    setCorrections(next);
    // A note whose correction is gone (Use what it says, or Auto) goes with it.
    setTold((was) =>
      was.filter((t) => {
        const d = next.devices[t.id];
        if (!d) return false;
        if (t.fact.startsWith('formats.')) return !!d.formats?.[t.fact.slice('formats.'.length)];
        return t.fact === 'pcm_channels' ? !!d.pcm_channels : !!d.peak_nits;
      })
    );
    void saveCorrections(next)
      .then(() => window.dispatchEvent(new Event(CORRECTIONS_EVENT)))
      .catch((e: unknown) => setError(userError(e)));
  }, []);

  // The corrections, after moving the global format values of before 0.22
  // to the device the sound goes to; then the "now says the same" notes,
  // marked as said.
  useEffect(() => {
    if (!equipment || readOnce.current) return;
    readOnce.current = true;
    void (async () => {
      const read = await readAudioSettings();
      const settings = await migrateAudioCorrections(read, targetDevice(equipment, read.deviceId));
      let c = settings.corrections ?? NO_CORRECTIONS;
      const now = agreements(
        c,
        equipment.displays.filter((d) => d.connected),
        equipment.audio.filter((a) => a.connected)
      );
      setTold(now);
      for (const t of now) c = markTold(c, t.id, t.fact);
      setCorrections(c);
      if (now.length > 0) await saveCorrections(c);
    })().catch((e: unknown) => console.warn('settings: corrections not read', e));
  }, [equipment]);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setEquipment(await checkEquipment());
    } catch (e) {
      setError(userError(e));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    getEquipment()
      .then((e) => live && setEquipment(e))
      .catch((e: unknown) => live && setError(userError(e)))
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, []);

  const displays = equipment?.displays.filter((d) => d.connected) ?? [];
  const audio = equipment?.audio.filter((a) => a.connected) ?? [];
  const away = awayDevices(equipment?.displays ?? [], equipment?.audio ?? []);

  return (
    <section className="settings-section">
      <h2>Your equipment</h2>
      <p className="settings-intro">
        What {system} reports about the screens and sound devices connected to this PC. Skrin
        checks every time it starts and bases its playback choices on this. If something looks
        wrong, the cause is usually in {system} or the cables; a device that reports itself
        wrong can be put right with Correct a fact.
      </p>
      <div className="settings-toggle-row">
        <FocusButton className="btn-secondary" onSelect={() => void check()}>
          {checking ? 'Checking…' : 'Check again'}
        </FocusButton>
        <CopyFactsButton className="btn-secondary" equipment={equipment} />
        <span className="muted">
          {equipment
            ? `Last checked ${new Date(equipment.checked_at * 1000).toLocaleTimeString()}. `
            : ''}
          Only needed if a TV or receiver was switched on, or a {system} sound or display setting
          was changed, after Skrin started. “Copy facts” puts what these devices reported, and the
          mpv options Skrin set, on the clipboard for a forum post or bug report; device names,
          ids, serial numbers, file names and film titles are left out.
        </span>
      </div>
      {error && <p className="equipment-problem">Could not check: {error}</p>}

      {equipment && (
        <>
          <h3>Screens</h3>
          {displays.length === 0 && <p className="muted">None found.</p>}
          {displays.map((d) => (
            <div className="equipment-item" key={d.id || d.gdi_name}>
              <div className="equipment-head">
                <strong>{d.name}</strong>
                {d.new && <span className="equipment-new">new</span>}
                <span className="muted">
                  {d.connection} ·{' '}
                  {/* A mode of 0×0 is one the desktop did not report (a Linux desktop Skrin cannot ask). */}
                  {d.width > 0 ? `${d.width}×${d.height} at ${formatRate(refreshRate(d))} Hz · ` : ''}
                  {hdrLabel(d, system)}
                </span>
              </div>
              <ul className="equipment-notes">
                {d.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <Correct
                device={d}
                corrections={corrections}
                onChange={changeCorrections}
                told={told}
              />
            </div>
          ))}

          <h3>Sound</h3>
          {audio.length === 0 && <p className="muted">None found.</p>}
          {audio.map((a) => (
            <div className="equipment-item" key={a.id}>
              <div className="equipment-head">
                <strong>{a.name}</strong>
                {a.new && <span className="equipment-new">new</span>}
                <span className="muted">
                  {a.connection}
                  {a.is_default ? ` · ${system} default` : ''}
                  {/* The Windows mixer and spatial sound: Windows only (an empty layout elsewhere). */}
                  {a.mix_layout ? ` · Windows mixes to ${a.mix_layout}` : ''}
                  {a.spatial_objects ? ' · Windows spatial sound on' : ''}
                  {a.max_pcm_channels
                    ? ` · takes up to ${a.max_pcm_channels} channels directly`
                    : ''}
                </span>
              </div>
              <ul className="equipment-formats">
                {a.bitstream.map((b) => (
                  <li key={b.codec} className={`equipment-format equipment-format-${b.result}`}>
                    {b.label}: {PROBE_LABEL[b.result]}
                    {b.remembered ? ' (remembered)' : ''}
                  </li>
                ))}
              </ul>
              <ul className="equipment-notes">
                {a.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <Correct
                device={a}
                corrections={corrections}
                onChange={changeCorrections}
                told={told}
              />
            </div>
          ))}

          {away.length > 0 && (
            <>
              <h3>Seen before, not connected now</h3>
              <ul className="equipment-notes">
                {away.map((d) => (
                  <li key={d.id}>
                    {d.name} <span className="muted">· last seen {day(d.last_seen)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {equipment.problems.length > 0 && (
            <p className="equipment-problem">Could not read: {equipment.problems.join('; ')}.</p>
          )}
        </>
      )}
    </section>
  );
}
