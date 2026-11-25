/**
 * Up next: the card offering the next episode — raised as the credits start,
 * as an offer with no countdown, or when the file ends, counting down to it —
 * and moving to an episode either side.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  episodeRefLabel,
  nextEpisode,
  saveProgress,
  type EpisodeRef,
  type PlaybackTarget,
} from './api';
import { entryRef, playlistStep } from '../library/playlists';
import { inChosenVersion } from './episodeVersion';
import type { Session } from './session';
import type { SkipKind } from './skip';
import {
  listenForPresses,
  readStillWatching,
  rollOn,
  shouldAsk,
  targetStarted,
} from './stillWatching';

const NEXT_EPISODE_COUNTDOWN = 12;

/**
 * How far back the position must go, while the card counts down or is held,
 * for it to count as going back (GitHub #29): more than the position's own
 * step (session.ts), less than any seek a key makes.
 */
export const SEEK_BACK_SECS = 3;
/** This close to the end, the file has ended (keep-open stops a frame short). */
const END_SECS = 1;

/**
 * What a change in the player does to a running or held countdown (GitHub
 * #29). A pause, either way, holds it: the card stays, counting nothing.
 * Going back before the furthest point since the count began takes the card
 * down, and the file is no longer over. `start` is the pause state when the
 * count began; `furthest` the furthest position since (the credits may still
 * be playing under the card).
 *
 * A pause that comes at the very end of the file is mpv's own (keep-open
 * pauses there), not the viewer's: it can arrive after the count has begun
 * (seen on the real player, round 12b), and taken for a pause it held every
 * natural end. It is the new starting point instead (`'adopt'`).
 */
export function countdownChange(
  start: { paused: boolean },
  furthest: number | null,
  now: { paused: boolean; timePos: number | null; duration: number | null }
): 'hold' | 'went-back' | 'adopt' | null {
  if (furthest !== null && now.timePos !== null && now.timePos < furthest - SEEK_BACK_SECS) {
    return 'went-back';
  }
  if (now.paused === start.paused) return null;
  const atEnd =
    now.duration !== null && now.timePos !== null && now.timePos >= now.duration - END_SECS;
  return now.paused && atEnd ? 'adopt' : 'hold';
}

export function useUpNext({
  target,
  onPlayTarget,
  exit,
  sessionRef,
  neighbours,
  autoSkip,
  guessedCredits,
  activeKind,
  activeKey,
  activeToScene,
  dismissed,
  dismiss,
  paused,
  timePos,
  duration,
  scrubbing,
  reopen,
}: {
  target: PlaybackTarget;
  onPlayTarget: (target: PlaybackTarget) => void;
  /** Leave the player (Player.tsx). */
  exit: () => Promise<void>;
  sessionRef: RefObject<Session>;
  /** The episodes either side: Up next offers the next one. */
  neighbours: { prev: EpisodeRef | null; next: EpisodeRef | null };
  /** From useSkipMarkers: automatic mode, and the segment the position is in. */
  autoSkip: boolean;
  guessedCredits: boolean;
  activeKind: SkipKind | null;
  activeKey: string | null;
  activeToScene: boolean;
  dismissed: string | null;
  dismiss: (key: string) => void;
  /** The player's pause state and position: pausing or going back stops the count. */
  paused: boolean;
  timePos: number | null;
  duration: number | null;
  /** A seek being steered: its position is not where mpv is. */
  scrubbing: boolean;
  /** The file is not over after all: its next end offers the next one again. */
  reopen: () => void;
}) {
  const [upNext, setUpNext] = useState<EpisodeRef | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** "Still watching?": the next episode asked for, not counted down to. */
  const [asking, setAsking] = useState(false);
  const [askOn, setAskOn] = useState(true);
  /**
   * The countdown stopped by a pause (GitHub #29): the card stays, offering
   * the next episode, and nothing comes until someone answers.
   */
  const [held, setHeld] = useState(false);

  // Any press while the player is up means someone is there (stillWatching.ts).
  useEffect(() => listenForPresses(), []);
  useEffect(() => {
    let live = true;
    void readStillWatching().then((on) => live && setAskOn(on));
    return () => {
      live = false;
    };
  }, []);

  // A card offering the *previous* file's next episode has no business
  // surviving into this one. Nothing else clears these: the countdown path
  // clears them when it advances, and every other route out left them set.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setUpNext(null);
    setCountdown(null);
    setAsking(false);
    setHeld(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    targetStarted();
  }, [target.path, target.fileId, target.fromStart]);

  /**
   * End of file: mark it watched, then offer the next episode or leave. The
   * player calls it once per file, when the session says the file ended —
   * naturally, or because its credits were skipped.
   */
  const handlePlaybackEnded = useCallback(async () => {
    const playlist = target.playlist;
    if (target.fileId === null && !playlist) {
      await exit();
      return;
    }

    // Mark it finished so it leaves Continue Watching rather than sitting
    // there at 99%.
    const total = sessionRef.current.duration;
    if (total && target.fileId !== null) {
      await saveProgress(target.fileId, total, total).catch(() => undefined);
    }

    try {
      // A playlist's next item, asked now: the list may have changed since
      // the file began.
      const next = playlist
        ? await playlistStep(playlist.id, playlist.item, true).then((e) => e && entryRef(e, playlist.id))
        : await nextEpisode(target.fileId as number).then((e) => inChosenVersion(e, target.titleId));
      if (next && shouldAsk(askOn)) {
        // Three rolled on untouched: ask, and count nothing down.
        setUpNext(next);
        setAsking(true);
      } else if (next) {
        setUpNext(next);
        setCountdown(NEXT_EPISODE_COUNTDOWN);
      } else {
        await exit();
      }
    } catch {
      await exit();
    }
  }, [target.fileId, target.titleId, target.playlist, exit, sessionRef, askOn]);

  /**
   * Offer the next episode as soon as the credits start, without ending the
   * file.
   *
   * The card sits over the still-running video and carries **no countdown**:
   * the marker behind it may be a guess, and a guess is not entitled to make
   * the decision. A natural end still starts the countdown, as it always did.
   */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // Automatic mode acts on measured credits by itself; a guess still only
    // gets to offer, so it falls through to the card.
    if (autoSkip && !guessedCredits) return;

    // An offer with no countdown is tied to *being in the credits*. When the
    // credits are no longer where we are — the file changed, the user seeked
    // back, or it was raised in error — the offer is stale and comes down.
    //
    // This effect used to only ever raise the card, which made every spurious
    // raise permanent: it sat over the next episode for its whole duration,
    // hiding the Skip intro button behind it. Being able to lower it again is
    // what makes the whole path self-correcting rather than one-way.
    //
    // A countdown means the file has genuinely ended and the next episode is
    // coming regardless, so that card is not an offer and must not be withdrawn;
    // nor is "Still watching?", asked once the file ended.
    if (countdown !== null || asking || held) return;

    // Credits with a scene after them are not the end of anything yet.
    if (
      activeKind !== 'credits' ||
      activeToScene ||
      !neighbours.next ||
      dismissed === activeKey
    ) {
      if (upNext) setUpNext(null);
      return;
    }
    if (!upNext) setUpNext(neighbours.next);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    autoSkip,
    guessedCredits,
    activeKind,
    activeKey,
    activeToScene,
    countdown,
    asking,
    held,
    dismissed,
    neighbours.next,
    upNext,
  ]);

  /**
   * Pausing or going back stops the count (GitHub #29). It used to run on
   * whatever the player did: paused, or started again from the beginning,
   * the next episode still came when it reached nought.
   *
   * Measured from where the count began; the pause mpv makes by itself at the
   * end of a file (keep-open), before or after the count starts, is not one.
   */
  const counting = countdown !== null;
  const watch = useRef<{ start: { paused: boolean }; furthest: number | null } | null>(null);
  useEffect(() => {
    if (!counting && !held) {
      watch.current = null;
      return;
    }
    if (!watch.current) {
      watch.current = { start: { paused }, furthest: timePos };
      return;
    }
    // While a seek is being steered the position is the seek bar's, not
    // mpv's: still at the end, mpv would end the file again under it.
    if (scrubbing) return;
    const w = watch.current;
    if (timePos !== null && (w.furthest === null || timePos > w.furthest)) w.furthest = timePos;
    const change = countdownChange(w.start, w.furthest, { paused, timePos, duration });
    if (change === 'adopt') {
      w.start = { paused };
    } else if (change === 'went-back') {
      setCountdown(null);
      setHeld(false);
      setUpNext(null);
      reopen();
    } else if (change === 'hold' && counting) {
      setCountdown(null);
      setHeld(true);
    }
  }, [counting, held, paused, timePos, duration, scrubbing, reopen]);

  /** Jump straight to a neighbouring episode, keeping the show's identity. */
  const playNeighbour = useCallback(
    (episode: EpisodeRef) => {
      onPlayTarget(
        episode.target ?? {
          path: episode.path,
          label: episodeRefLabel(episode),
          fileId: episode.file_id,
          episodeName: episode.video ? null : episode.name,
          titleId: target.titleId,
          video: episode.video,
        }
      );
    },
    [onPlayTarget, target.titleId]
  );

  // Countdown to the next episode.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      /* Timer-driven state machine, not state derived from render. */
      /* eslint-disable react-hooks/set-state-in-effect */
      if (upNext) {
        rollOn();
        onPlayTarget(
          upNext.target ?? {
            path: upNext.path,
            label: episodeRefLabel(upNext),
            fileId: upNext.file_id,
            episodeName: upNext.video ? null : upNext.name,
            titleId: target.titleId,
            video: upNext.video,
          }
        );
      }
      setCountdown(null);
      setUpNext(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const id = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [countdown, upNext, onPlayTarget, target.titleId]);

  /**
   * Up next's Play: now rather than when the countdown ends. Answering
   * "Still watching?" plays it as a choice, which starts the count again.
   */
  const playNow = useCallback(() => {
    if ((asking || held) && upNext) {
      setAsking(false);
      setHeld(false);
      setUpNext(null);
      playNeighbour(upNext);
      return;
    }
    setCountdown(0);
  }, [asking, held, upNext, playNeighbour]);
  /** Up next's Back to library, after a file that ended. */
  const leave = useCallback(() => {
    setCountdown(null);
    setUpNext(null);
    setAsking(false);
    setHeld(false);
    void exit();
  }, [exit]);
  /**
   * Up next's Cancel, while it counts down (GitHub #29): no next episode, and
   * the player stays where it is — on the last picture, or the credits still
   * playing under where the card was. It declines the credits too, as Keep
   * watching does, or their offer would raise the card again at once.
   */
  /**
   * The viewer asked to pause or play (GitHub #29): a running count stops,
   * the card staying. Called on the request, since at the end of a file mpv
   * reports no change.
   */
  // Read when called, not when made: a key can reach a handler made before
  // the last render (seen in WebKit), which would hold a count long gone.
  const countingNow = useRef(false);
  useEffect(() => {
    countingNow.current = counting;
  }, [counting]);
  const hold = useCallback(() => {
    if (!countingNow.current) return;
    countingNow.current = false;
    setCountdown(null);
    setHeld(true);
  }, []);
  const cancel = useCallback(() => {
    setCountdown(null);
    setHeld(false);
    setUpNext(null);
    if (activeKey) dismiss(activeKey);
  }, [activeKey, dismiss]);
  /**
   * Up next's Keep watching. Refuse the offer for the rest of this file.
   * Dismissing by segment rather than by a flag also silences the small
   * credits prompt, which would otherwise take its place.
   */
  const keepWatching = useCallback(() => {
    setUpNext(null);
    if (activeKey) dismiss(activeKey);
  }, [activeKey, dismiss]);

  return {
    upNext,
    countdown,
    asking,
    held,
    playNow,
    leave,
    cancel,
    hold,
    keepWatching,
    playNeighbour,
    handlePlaybackEnded,
  };
}
