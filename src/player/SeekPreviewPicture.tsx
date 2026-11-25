/**
 * The picture above the seek bar (round 10): where the mouse points on the
 * bar, or where a held Left/Right or a drag is taking the film. The picture is
 * the nearest one made (seekPreview.ts); until the first arrives, the time
 * alone. Nothing is drawn where pictures are not made (no capability) except
 * the time, which the bar already shows beside it — so nothing at all there,
 * unless the file has chapters: then the chapter's name, and the time with it,
 * since the name alone would not say where in the chapter the seek lands.
 */
import type { CSSProperties } from 'react';
import { formatTime } from '../ui/format';
import { previewsHere, useSeekPreview } from './seekPreview';

export default function SeekPreviewPicture({
  fileId,
  at,
  duration,
  chapter,
}: {
  fileId: number | null;
  /** Seconds into the film the bar points at; null hides the preview. */
  at: number | null;
  duration: number | null;
  /** The name of the chapter at `at`; null where the file has no chapters. */
  chapter: string | null;
}) {
  const picture = useSeekPreview(fileId, at);
  if (at === null || !duration) return null;
  const pictures = fileId !== null && previewsHere();
  if (!pictures && chapter === null) return null;
  const pct = Math.min(100, Math.max(0, (at / duration) * 100));
  return (
    <div
      className={`seek-preview ${pictures ? '' : 'seek-preview-words'}`}
      style={{ '--at': `${pct}%` } as CSSProperties}
      data-at={pictures ? (picture.at ?? undefined) : undefined}
      aria-hidden="true"
    >
      {!pictures ? null : picture.url ? (
        <img className="seek-preview-picture" src={picture.url} alt="" draggable={false} />
      ) : (
        <div className="seek-preview-picture seek-preview-empty" />
      )}
      {chapter !== null && <span className="seek-preview-chapter">{chapter}</span>}
      <span className="seek-preview-time">{formatTime(at)}</span>
    </div>
  );
}
