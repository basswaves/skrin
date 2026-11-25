/**
 * Play on a file that is not there (round 12b, a tester's proposal;
 * missing_file.rs). Skrin looks in the library folders first: the same file
 * found once → "It moved to … — use it?"; not found → Find it…, Remove from
 * library, Cancel. A drive or share that cannot be reached is said as such,
 * with no Remove: it is not deleted.
 *
 * A dialog in the page's focus tree (a `menu` group, as Add to a playlist),
 * since Play is pressed on many pages: it holds the ring while it is up and
 * gives it back when it goes. Using a file found or picked keeps what was
 * watched and chosen, and plays it. Nothing is written to the media folders.
 */
import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import FocusButton from './FocusButton';
import { FocusProvider } from './FocusGroup';
import { useFocusGroup } from './focusGroups';
import { focusTo } from './focus';
import { userError } from './errors';
import { capabilitiesNow } from '../capabilities';
import { locateFile, relinkFile, removeMissingFile, type Whereabouts } from '../library/missingFile';
import type { PlaybackTarget } from '../player/api';

const USE_KEY = 'missing-file:use';
const FIND_KEY = 'missing-file:find';
const CANCEL_KEY = 'missing-file:cancel';

export type MissingTarget = PlaybackTarget & { fileId: number };

interface Props {
  target: MissingTarget;
  /** Play it, at the place found or picked (or where it was, there after all). */
  onPlay: (target: PlaybackTarget) => void;
  /** Taken out of the library: the sentence to show. */
  onRemoved: (message: string) => void;
  onClose: () => void;
}

export default function MissingFile({ target, onPlay, onRemoved, onClose }: Props) {
  const { ref, focusKey } = useFocusGroup('menu');
  const [where, setWhere] = useState<Whereabouts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = target.episodeName ? `${target.label}: ${target.episodeName}` : target.label;

  useEffect(() => {
    let live = true;
    locateFile(target.fileId)
      .then((found) => {
        if (!live) return;
        if (found.state === 'here') onPlay(target);
        else setWhere(found);
      })
      .catch((e: unknown) => {
        if (live) setError(userError(e));
      });
    return () => {
      live = false;
    };
  }, [target, onPlay]);

  const state = where?.state ?? null;
  // Where the system has no file picker (Android), there is nothing to find with.
  const canPick = capabilitiesNow()?.folder_picker !== false;
  const lost = state === 'not_found' || state === 'several';
  const offerFind = (lost || state === 'offline') && canPick;
  // The ring on what answers the question: Use it, else Find it…, else Cancel.
  const first = state === 'moved' ? USE_KEY : offerFind ? FIND_KEY : CANCEL_KEY;
  useEffect(() => {
    focusTo(first);
  }, [first]);

  // Capture phase, so the page's own Back never sees the press.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const use = useCallback(
    (path: string) => {
      setBusy(true);
      setError(null);
      relinkFile(target.fileId, path)
        .then(() => onPlay({ ...target, path }))
        .catch((e: unknown) => {
          setBusy(false);
          setError(userError(e));
        });
    },
    [target, onPlay]
  );

  const findIt = () => {
    setError(null);
    void open({ multiple: false, directory: false, title: `Find ${name}` })
      .then((picked) => {
        if (typeof picked === 'string') use(picked);
      })
      .catch((e: unknown) => setError(userError(e)));
  };

  const remove = () => {
    setBusy(true);
    setError(null);
    removeMissingFile(target.fileId)
      .then(() =>
        onRemoved(
          `Removed “${name}” from the library. If the file comes back, Skrin finds it again, with what you watched.`
        )
      )
      .catch((e: unknown) => {
        setBusy(false);
        setError(userError(e));
      });
  };

  return (
    <FocusProvider value={focusKey}>
      <div className="leave-backdrop" onClick={onClose}>
        <div
          className="leave missing-file"
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="A file that is not there"
        >
          <h2>{where?.state === 'moved' ? 'It moved' : 'Not where it was'}</h2>
          {where === null && !error && (
            <p className="muted">Looking for “{name}” in your library folders…</p>
          )}
          {where?.state === 'moved' && (
            <>
              <p>
                “{name}” moved to <strong className="missing-file-place">{where.folder}</strong> — use
                it?
              </p>
              <p className="muted">
                The same name and size. What you watched and chose stays with it. Nothing on the disk
                is changed.
              </p>
            </>
          )}
          {where?.state === 'offline' && (
            <p>
              “{name}” is on <strong className="missing-file-place">{where.place}</strong>, which Skrin
              cannot reach now. Connect the drive or share, then press Play again.
            </p>
          )}
          {where?.state === 'not_found' && (
            <p>
              “{name}” is not where it was, and no file of the same name and size is in your library
              folders.
            </p>
          )}
          {where?.state === 'several' && (
            <p>
              “{name}” is not where it was. {where.count} files of the same name and size are in your
              library folders, so Skrin did not pick one.
            </p>
          )}
          {error && <p className="leave-error">{error}</p>}
          <div className="leave-choices">
            {where?.state === 'moved' && (
              <FocusButton
                focusKey={USE_KEY}
                className="leave-choice"
                disabled={busy}
                onSelect={() => use(where.path)}
              >
                Use it
              </FocusButton>
            )}
            {offerFind && (
              <FocusButton focusKey={FIND_KEY} className="leave-choice" disabled={busy} onSelect={findIt}>
                Find it…
              </FocusButton>
            )}
            {lost && (
              <FocusButton className="leave-choice" disabled={busy} onSelect={remove}>
                Remove from library
              </FocusButton>
            )}
            <FocusButton
              focusKey={CANCEL_KEY}
              className="leave-choice leave-cancel"
              onSelect={onClose}
            >
              Cancel
            </FocusButton>
          </div>
        </div>
      </div>
    </FocusProvider>
  );
}
