/**
 * Which audio and subtitle track a file opens with.
 *
 * Two layers. A choice made in a title — changing the audio or subtitles
 * while watching it — is remembered for that title and wins. Before any such
 * choice, the defaults in Settings apply, which is what saves every new show
 * from starting over:
 *
 *  - Audio: as the file sets it (the original, nearly always) or a language.
 *  - Subtitles: off, a language always, or a language only when the audio is
 *    in another one. The last is the default, in Windows' language — the way
 *    most of the world watches: English audio, local subtitles; local audio,
 *    none, except a forced track for the lines in another language.
 *  - Forced subtitles — the few lines for what is said in another language —
 *    show whenever full subtitles do not, **subtitles off included**, in the
 *    language being spoken, as on a disc or a streaming service. Off means no
 *    full subtitles; it has never meant missing the scene in another language.
 *    A switch turns this off (`FORCED_KEY`).
 *
 * Pure, so the rules are tested without mpv.
 */
import { getSetting } from '../metadata/api';
import type { TitlePrefs } from './api';
import { languageName, sameLanguage, systemLanguage } from './language';
import type { Track } from './engine';
import { findTrackByLang, isAudioDescription, isHearingImpaired } from './tracks';

export const AUDIO_DEFAULT_KEY = 'lang_audio';
export const SUBS_DEFAULT_KEY = 'lang_subs';
/** Setting key: `'off'` stops forced subtitles showing on their own. */
export const FORCED_KEY = 'forced_subs';
/**
 * Setting keys, `'on'` or off (the default): audio description chosen where
 * a file has it, subtitles for the deaf and hard of hearing preferred. Needs
 * of the person watching, applied to every title like the languages.
 */
export const DESCRIPTION_KEY = 'audio_description';
export const SDH_KEY = 'subtitles_sdh';

export interface LanguageDefaults {
  /** `original`, or a language code. */
  audio: string;
  /** `off`, `always:<code>` or `foreign:<code>`. */
  subs: string;
  /** Show a forced track when full subtitles are not showing. */
  forced: boolean;
  /** Audio description where the file has it in the language chosen; else avoided. */
  description?: boolean;
  /** Subtitles for the deaf and hard of hearing first; else the plain ones. */
  sdh?: boolean;
}

export function defaultSubs(): string {
  return `foreign:${systemLanguage()}`;
}

export async function readLanguageDefaults(): Promise<LanguageDefaults> {
  const [audio, subs, forced, description, sdh] = await Promise.all([
    getSetting(AUDIO_DEFAULT_KEY).catch(() => null),
    getSetting(SUBS_DEFAULT_KEY).catch(() => null),
    getSetting(FORCED_KEY).catch(() => null),
    getSetting(DESCRIPTION_KEY).catch(() => null),
    getSetting(SDH_KEY).catch(() => null),
  ]);
  return {
    audio: audio || 'original',
    subs: subs || defaultSubs(),
    forced: forced !== 'off',
    description: description === 'on',
    sdh: sdh === 'on',
  };
}

export interface TrackChoice {
  /** The audio track to select, or null to leave the file's own choice. */
  aid: number | null;
  /** The subtitle track to select, or null to leave the file's own choice. */
  sid: number | null;
  /** Whether subtitles show, or null to leave it as it is. */
  subVisible: boolean | null;
  /**
   * Why, in a person's words, for the stats panel's Why lines (Expert
   * drawer, notes/EXPERT-DRAWER.md): which rule picked the sound and the
   * subtitles. Absent only on choices made before reasons existed.
   */
  why?: { audio: string; sub: string };
}

export function forcedTrack(tracks: Track[], lang: string | null | undefined): Track | null {
  return tracks.find((t) => t.type === 'sub' && t.forced && sameLanguage(t.lang, lang)) ?? null;
}

/**
 * No full subtitles: the forced track for the language being spoken, if the
 * file has one and forced subtitles are on; otherwise none.
 */
function forcedOrNone(
  tracks: Track[],
  aid: number | null,
  spoken: Track | null,
  show: boolean,
  audioWhy: string,
  offWhy: string
): TrackChoice {
  const forced = show ? forcedTrack(tracks, spoken?.lang) : null;
  if (forced) {
    return {
      aid,
      sid: forced.id,
      subVisible: true,
      why: {
        audio: audioWhy,
        sub: `forced: only the lines spoken in another language (${offWhy})`,
      },
    };
  }
  return { aid, sid: null, subVisible: false, why: { audio: audioWhy, sub: offWhy } };
}

const lang = (code: string | null | undefined) => languageName(code) ?? 'that language';

/** ", audio description because you asked for it" and the like, where it applies. */
function needs(track: Track | null, defaults: LanguageDefaults): string {
  if (!track) return '';
  if (track.type === 'audio' && defaults.description && isAudioDescription(track))
    return '; audio description, because Settings asks for it';
  if (track.type === 'sub' && defaults.sdh && isHearingImpaired(track))
    return '; for the deaf and hard of hearing, because Settings asks for it';
  return '';
}

/** The audio track that will play: the one chosen, or the file's own. */
export function spokenTrack(tracks: Track[], chosen: Track | null): Track | null {
  return chosen ?? tracks.find((t) => t.type === 'audio' && t.selected) ?? null;
}

/**
 * "As the file sets it", with the audio description need applied: the
 * file's own track when it fits, else one in its language that does; null
 * leaves the file's choice.
 */
function siblingFor(tracks: Track[], want: (t: Track) => boolean): Track | null {
  const own = tracks.find((t) => t.type === 'audio' && t.selected);
  if (!own || want(own)) return null;
  return (
    tracks.find((t) => t.type === 'audio' && t !== own && sameLanguage(t.lang, own.lang) && want(t)) ??
    null
  );
}

export function chooseTracks(
  tracks: Track[],
  prefs: TitlePrefs | null,
  defaults: LanguageDefaults
): TrackChoice {
  // Audio description and SDH, as the person needs them: among a
  // language's tracks, the one that matches, else the first.
  const wantAudio = (t: Track) => isAudioDescription(t) === !!defaults.description;
  const wantSub = (t: Track) => isHearingImpaired(t) === !!defaults.sdh;

  // A choice made in this title: as before, it decides both.
  if (prefs?.chosen) {
    const audio = findTrackByLang(tracks, 'audio', prefs.audio_lang, wantAudio);
    const audioWhy = audio
      ? `your choice for this title, made while watching it${needs(audio, defaults)}`
      : prefs.audio_lang
        ? `the file's own: your choice for this title (${lang(prefs.audio_lang)}) is not in this file`
        : "the file's own";
    if (!prefs.sub_enabled) {
      return forcedOrNone(
        tracks,
        audio?.id ?? null,
        spokenTrack(tracks, audio),
        defaults.forced,
        audioWhy,
        'subtitles off: your choice for this title'
      );
    }
    const sub = findTrackByLang(tracks, 'sub', prefs.sub_lang, wantSub);
    return {
      aid: audio?.id ?? null,
      sid: sub?.id ?? null,
      subVisible: true,
      why: {
        audio: audioWhy,
        sub: sub
          ? `your choice for this title, made while watching it${needs(sub, defaults)}`
          : `the file's own: your choice for this title (${lang(prefs.sub_lang)}) is not in this file`,
      },
    };
  }

  const audio =
    defaults.audio === 'original'
      ? siblingFor(tracks, wantAudio)
      : findTrackByLang(tracks, 'audio', defaults.audio, wantAudio);
  const playing = spokenTrack(tracks, audio);
  const audioWhy =
    defaults.audio === 'original'
      ? `the film's own language, as the file sets it (Settings)${needs(playing, defaults)}`
      : audio
        ? `${lang(defaults.audio)}, your language for sound in Settings${needs(audio, defaults)}`
        : `the file's own: it has no ${lang(defaults.audio)} sound, your language in Settings`;

  const [mode, subLang] = defaults.subs.split(':');
  if (mode === 'off' || !subLang) {
    return forcedOrNone(
      tracks,
      audio?.id ?? null,
      playing,
      defaults.forced,
      audioWhy,
      'subtitles off in Settings'
    );
  }

  // Untagged audio counts as another language: showing subtitles someone did
  // not need is a smaller mistake than hiding ones they did.
  const foreignAudio = !sameLanguage(playing?.lang, subLang);
  if (mode === 'always' || foreignAudio) {
    const sub = findTrackByLang(tracks, 'sub', subLang, wantSub);
    const because =
      mode === 'always'
        ? `${lang(subLang)}, always, as Settings says`
        : `${lang(subLang)}, your language: the sound is in ${
            playing?.lang ? lang(playing.lang) : 'a language the file does not name'
          }`;
    // No track in that language: leave whatever the file chose.
    if (!sub) {
      return {
        aid: audio?.id ?? null,
        sid: null,
        subVisible: null,
        why: { audio: audioWhy, sub: `the file's own: it has no ${lang(subLang)} subtitles` },
      };
    }
    return {
      aid: audio?.id ?? null,
      sid: sub.id,
      subVisible: true,
      why: { audio: audioWhy, sub: `${because}${needs(sub, defaults)}` },
    };
  }

  // Audio already in the viewer's language: only the forced lines, if any.
  return forcedOrNone(
    tracks,
    audio?.id ?? null,
    playing,
    defaults.forced,
    audioWhy,
    `no full subtitles: the sound is already in ${lang(subLang)}, your language`
  );
}

// ---- said in the stats panel ---------------------------------------------------

/** One track as playing now, and why it is the one. */
export interface TrackReason {
  /** The track as a person reads it, or "off". */
  track: string;
  why: string;
}

let reasons: { audio: TrackReason | null; sub: TrackReason | null } = { audio: null, sub: null };

/** Why the tracks playing now are the ones (the stats panel's Why lines). */
export const trackReasons = () => reasons;

export function setTrackReason(kind: 'audio' | 'sub', reason: TrackReason | null): void {
  reasons = { ...reasons, [kind]: reason };
}

/** A new file: nothing said yet. */
export function clearTrackReasons(): void {
  reasons = { audio: null, sub: null };
}
