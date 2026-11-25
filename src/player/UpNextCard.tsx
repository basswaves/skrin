/**
 * The Up next card: three states, one card.
 *
 * With a countdown the file has genuinely ended and the next episode is coming
 * either way; without one the credits have merely started and the video is
 * still running underneath, so the card offers rather than announces. Asking
 * ("Still watching?", stillWatching.ts), the file has ended after three
 * episodes rolled on untouched, and nothing comes until someone answers.
 */
import FocusButton from '../ui/FocusButton';
import FocusGroup from '../ui/FocusGroup';
import { episodeRefName, type EpisodeRef } from './api';

export default function UpNextCard({
  episode,
  countdown,
  asking = false,
  held = false,
  onPlay,
  onLeave,
  onCancel,
  onKeepWatching,
}: {
  episode: EpisodeRef;
  countdown: number | null;
  asking?: boolean;
  /** The countdown stopped by a pause: the file has ended, nothing is counted. */
  held?: boolean;
  onPlay: () => void;
  onLeave: () => void;
  onCancel: () => void;
  onKeepWatching: () => void;
}) {
  return (
    <div className={`up-next ${asking ? 'still-watching' : ''}`}>
      <div className="up-next-body">
        <div className="up-next-label">{asking ? 'Still watching?' : 'Up next'}</div>
        <div className="up-next-title">{episodeRefName(episode)}</div>
        <FocusGroup kind="row" className="up-next-actions">
          <FocusButton className="btn-primary" onSelect={onPlay}>
            {countdown !== null ? `▶ Play now (${countdown})` : '▶ Play next'}
          </FocusButton>
          {/* A countdown can always be stopped (GitHub #29): Cancel stays in
              the player, on the last picture or the credits still playing. */}
          {countdown !== null && (
            <FocusButton className="btn-secondary" onSelect={onCancel}>
              Cancel
            </FocusButton>
          )}
          {countdown !== null || asking || held ? (
            <FocusButton className="btn-secondary" onSelect={onLeave}>
              Back to library
            </FocusButton>
          ) : (
            <FocusButton className="btn-secondary" onSelect={onKeepWatching}>
              Keep watching
            </FocusButton>
          )}
        </FocusGroup>
      </div>
    </div>
  );
}
