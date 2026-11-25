/**
 * Choose a title's poster (T20): the picture beside its files, if there is
 * one, and TMDB's posters for it, asked for when this opens. The choice is
 * the person's, kept by the title's ids over every refresh (metadata.rs
 * `poster_choice`); nothing is written beside the files.
 *
 * A step of "Identify / Edit metadata" (FilesAndTitle.tsx, round 12b: was a
 * Poster button and dialog of its own beside it). The dialog holds the ring
 * and takes Back; this is what it shows while the poster is being chosen. The
 * posters are a grid on the engine (TileGrid reads the columns that fit), the
 * list inside the dialog scrolling down; arrows, mouse wheel and hover all work.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { navFocus } from './focusStore';
import FocusButton from './FocusButton';
import TileGrid from './TileGrid';
import Art from './Art';
import { sizedPoster } from './poster';
import { posterChoices, type PosterChoice, type PosterChoices } from '../library/posters';

const choiceKey = (index: number) => `poster-choice:${index}`;

interface Props {
  titleId: number;
  name: string;
  /** Cancel's key: the ring waits there until the posters are drawn. */
  cancelKey: string;
  /** A poster was chosen and kept (its words), or the choice failed (null). */
  onChosen: (words: string | null) => void;
  onCancel: () => void;
}

export default function PosterChooser({ titleId, name, cancelKey, onChosen, onCancel }: Props) {
  const [found, setFound] = useState<PosterChoices | null>(null);
  const choices = found?.choices ?? null;

  useEffect(() => {
    let cancelled = false;
    void posterChoices(titleId, (next) => !cancelled && setFound(next)).catch((e) =>
      console.warn('posters not listed', e)
    );
    return () => {
      cancelled = true;
    };
  }, [titleId]);

  // Onto the poster shown now, once the list is drawn (it comes after
  // Cancel, which holds the ring meanwhile) — once.
  const current = choices ? Math.max(0, choices.findIndex((c) => c.current)) : -1;
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (current < 0 || landed.current) return;
    landed.current = navFocus(choiceKey(current));
  }, [current]);

  const choose = useCallback(
    async (choice: PosterChoice) => {
      try {
        await choice.choose();
        onChosen(choice.words);
      } catch (e) {
        console.warn('poster choice not kept', e);
        onChosen(null);
      }
    },
    [onChosen]
  );

  return (
    <>
      <h2>Poster</h2>
      <p className="muted">
        The picture {name} shows everywhere in Skrin. Kept when its details are fetched again.
      </p>
      {(found === null || found.asking) && <p className="muted">Asking TMDB for its posters…</p>}
      {found?.note && <p className="muted">{found.note}</p>}
      {choices && choices.length > 0 && (
        <TileGrid className="poster-choices" count={choices.length}>
          {choices.map((choice, i) => (
            <FocusButton
              key={choice.id}
              focusKey={choiceKey(i)}
              className={`poster-choice ${choice.current ? 'version-current' : ''}`}
              label={`${choice.words}${choice.current ? ', the one shown now' : ''}`}
              onSelect={() => void choose(choice)}
            >
              <Art
                className="poster-choice-art"
                local={choice.local}
                remote={choice.remote ? sizedPoster(choice.remote, 'w500') : null}
                lazy
                fallback={<div className="poster-choice-art" />}
              />
              <span className="poster-choice-words">
                {choice.current ? '✓ ' : ''}
                {choice.words}
              </span>
            </FocusButton>
          ))}
        </TileGrid>
      )}
      <FocusButton focusKey={cancelKey} className="leave-choice" onSelect={onCancel}>
        Cancel
      </FocusButton>
    </>
  );
}
