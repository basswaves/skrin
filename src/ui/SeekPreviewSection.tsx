/**
 * Settings → Advanced → Seek previews: the pictures above the seek bar
 * (player/seekPreview.ts), how much space they take, and a button that
 * deletes them. They are kept until their file leaves the library; deleting
 * them is safe, they are made again while watching.
 *
 * Not drawn on Android, which makes none yet (no second mpv there): a line
 * about a feature a device does not have tells its owner nothing they can
 * use (owner, 2026-11-21). Android's own previews are on the plan.
 */
import { useCallback, useEffect, useState } from 'react';
import FocusButton from './FocusButton';
import { userError } from './errors';
import { count, formatBytes } from './format';
import { useCapabilities } from '../capabilities';
import { deleteSeekPreviews, seekPreviewUsage, type SeekPreviewUsage } from '../player/seekPreview';

export default function SeekPreviewSection() {
  const can = useCapabilities();
  const [usage, setUsage] = useState<SeekPreviewUsage | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = !!can?.seek_previews;

  const read = useCallback(() => {
    seekPreviewUsage()
      .then(setUsage)
      .catch((e: unknown) => setError(userError(e)));
  }, []);
  useEffect(() => {
    if (here) read();
  }, [here, read]);
  if (!here) return null;

  return (
    <section className="settings-section">
      <h2>Seek previews</h2>
      <p className="settings-intro">
        The seek bar shows a small picture of where it points. Skrin makes them while you watch, one
        every ten seconds of the film, and keeps them on this computer until the file leaves the
        library
        {usage ? ` (${count(usage.files, 'picture')}, ${formatBytes(usage.bytes)})` : ''}. Deleting
        them is safe: they are made again.
      </p>
      <FocusButton
        className="btn-secondary"
        onSelect={() =>
          void (async () => {
            setError(null);
            try {
              const removed = await deleteSeekPreviews();
              setNote(`Deleted ${count(removed, 'picture')}.`);
              read();
            } catch (e) {
              setError(userError(e));
            }
          })()
        }
      >
        Delete seek previews
      </FocusButton>
      {note && <p className="settings-ok">{note}</p>}
      {error && <p className="settings-warn">{error}</p>}
    </section>
  );
}
