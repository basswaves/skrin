/**
 * "Copy facts": puts the raw facts (rawFacts.ts) on the clipboard as plain
 * text for a forum post or a bug report. In the stats panel it adds the rows
 * on screen; in Settings → Your equipment, the equipment alone. A FocusButton,
 * so a remote, a keyboard and a mouse all reach it where the panel takes the
 * ring (opened from Audio & subtitles; on `i` the panel is for watching and
 * takes none, as for its close button).
 *
 * The equipment is the saved answer of this launch's check (`getEquipment`),
 * never a fresh ask of the hardware: copying must not change anything.
 */
import { useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { capabilitiesNow } from '../capabilities';
import { hasMpv } from '../player/engine';
import { chosenOptions } from '../player/chosenOptions';
import { getEquipment, type Equipment } from '../player/equipment';
import { rawFactsText } from '../player/rawFacts';
import { readCorrections } from '../player/corrections';
import type { StatGroup } from '../player/stats';
import { copyText } from './copyText';
import FocusButton from './FocusButton';

type Outcome = 'idle' | 'copied' | 'failed';

export default function CopyFactsButton({
  groups,
  equipment,
  className,
  focusKey,
}: {
  /** The stats panel's rows; absent in Settings. */
  groups?: StatGroup[];
  /** Settings has the check already; the panel asks for the saved one. */
  equipment?: Equipment | null;
  className?: string;
  focusKey?: string;
}) {
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const [eq, version, corrections] = await Promise.all([
      equipment ? Promise.resolve(equipment) : getEquipment().catch(() => null),
      getVersion().catch(() => null),
      readCorrections(),
    ]);
    const text = rawFactsText({
      version,
      system: capabilitiesNow()?.system ?? 'this system',
      equipment: eq,
      corrections,
      chosen: hasMpv() ? chosenOptions() : undefined,
      groups,
    });
    setOutcome((await copyText(text)) ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOutcome('idle'), 2500);
  };

  return (
    <FocusButton className={className} focusKey={focusKey} onSelect={() => void copy()}>
      {outcome === 'copied' ? 'copied' : outcome === 'failed' ? 'could not copy' : 'copy facts'}
    </FocusButton>
  );
}
