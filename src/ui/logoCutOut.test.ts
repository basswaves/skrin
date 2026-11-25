import { describe, expect, it } from 'vitest';
import {
  cutOut,
  drawLogo,
  enclosedPlateSplit,
  isBlock,
  keepLight,
  letteringSplit,
  plateBrightness,
  removePlate,
} from './logoCutOut';

type Rgba = [number, number, number, number];

/** A logo as pixels: so many of each colour. */
function logo(...parts: [Rgba, number][]): Uint8ClampedArray {
  const pixels = parts.flatMap(([rgba, count]) => Array.from({ length: count }, () => rgba).flat());
  return new Uint8ClampedArray(pixels);
}

const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [255, 255, 255, 255];
const RED: Rgba = [230, 36, 41, 255];
const BLACK: Rgba = [10, 10, 10, 255];
const BLUE: Rgba = [30, 60, 200, 255];

describe('letteringSplit', () => {
  it('finds white lettering on a red plate', () => {
    expect(letteringSplit(logo([RED, 600], [WHITE, 300], [CLEAR, 400]))).not.toBeNull();
  });

  it('leaves a logo of one colour alone', () => {
    expect(letteringSplit(logo([BLACK, 600], [CLEAR, 400]))).toBeNull();
  });

  it('leaves two dark colours alone: a red mark beside black lettering', () => {
    expect(letteringSplit(logo([BLACK, 600], [RED, 200], [CLEAR, 400]))).toBeNull();
  });

  it('leaves a shaded mark alone', () => {
    const greys = Array.from({ length: 40 }, (_, i): [Rgba, number] => {
      const v = Math.round(20 + i * 5.5);
      return [[v, v, v, 255], 20];
    });
    expect(letteringSplit(logo(...greys, [CLEAR, 300]))).toBeNull();
  });

  it('leaves a logo that is mostly white alone', () => {
    expect(letteringSplit(logo([WHITE, 900], [BLUE, 100]))).toBeNull();
  });

  it('ignores see-through pixels whatever their colour', () => {
    expect(letteringSplit(logo([BLACK, 600], [[255, 255, 255, 0], 600]))).toBeNull();
  });
});

describe('cutOut', () => {
  it('turns the plate white and the lettering see-through', () => {
    const pixels = logo([RED, 1], [WHITE, 1], [CLEAR, 1]);
    cutOut(pixels, letteringSplit(logo([RED, 600], [WHITE, 300])) as number);
    expect([...pixels]).toEqual([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0]);
  });
});

describe('a logo that is solid all over', () => {
  const PLATE: Rgba = [35, 35, 35, 255];
  const GREY: Rgba = [130, 130, 130, 255];

  it('has the plate taken away, the name and the mark kept', () => {
    // Dark plate, a grey mark and white lettering: not two-tone enough for
    // letteringSplit, so it would have been a white block.
    const make = () => logo([PLATE, 700], [GREY, 150], [WHITE, 150]);
    expect(letteringSplit(make())).toBeNull();
    const plate = plateBrightness(make());
    expect(plate).not.toBeNull();
    const pixels = logo([PLATE, 1], [GREY, 1], [WHITE, 1]);
    removePlate(pixels, plate as number);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBeGreaterThan(200);
    expect(pixels[11]).toBe(255);
    expect([...pixels.slice(0, 3), ...pixels.slice(4, 7), ...pixels.slice(8, 11)]).toEqual(Array(9).fill(255));
  });

  it('is only for a logo with nothing see-through', () => {
    expect(plateBrightness(logo([PLATE, 700], [WHITE, 150], [CLEAR, 150]))).toBeNull();
  });

  it('leaves a logo with no plain plate alone', () => {
    const greys = Array.from({ length: 40 }, (_, i): [Rgba, number] => {
      const v = Math.round(20 + i * 5.5);
      return [[v, v, v, 255], 20];
    });
    expect(plateBrightness(logo(...greys))).toBeNull();
  });
});

/**
 * A 20 × 20 logo drawn from a picture: `.` see-through, `o` the outline's
 * colour, `#` the plate's. Rows repeat to fill the height.
 */
function drawn(rows: string[], outline: Rgba, plate: Rgba): Uint8ClampedArray {
  const colour = { '.': CLEAR, o: outline, '#': plate } as Record<string, Rgba>;
  const full = Array.from({ length: 20 }, (_, y) => rows[Math.floor((y * rows.length) / 20)]);
  return new Uint8ClampedArray(full.flatMap((row) => [...row].flatMap((c) => colour[c])));
}

const GOLD: Rgba = [240, 190, 30, 255];
const NAVY: Rgba = [20, 40, 140, 255];

describe('enclosedPlateSplit', () => {
  // A gold shield edge round a blue plate, gold letters on it.
  const shield = [
    '....................',
    '..oooooooooooooooo..',
    '..o##############o..',
    '..o##oo######oo##o..',
    '..o##oo######oo##o..',
    '..o##############o..',
    '..o##############o..',
    '...o############o...',
    '....o##########o....',
    '.....oooooooooo.....',
  ];

  it('finds a plate the outline closes all round', () => {
    expect(enclosedPlateSplit(drawn(shield, GOLD, NAVY), 20)).not.toBeNull();
  });

  it('leaves a plate open to the surroundings alone', () => {
    const open = shield.map((row) => row.replace(/^\.\.o/, '..#'));
    expect(enclosedPlateSplit(drawn(open, GOLD, NAVY), 20)).toBeNull();
  });

  it('never takes dark lettering on nothing for a plate', () => {
    const lettering = [
      '....................',
      '.##..##..###..#.....',
      '.##..##..#.#..#.....',
      '.######..###..#..oo.',
      '.##..##..#....#..oo.',
      '....................',
    ];
    expect(enclosedPlateSplit(drawn(lettering, GOLD, BLACK), 20)).toBeNull();
  });

  it('leaves two close colours alone', () => {
    expect(enclosedPlateSplit(drawn(shield, [60, 70, 160, 255], NAVY), 20)).toBeNull();
  });
});

describe('keepLight', () => {
  it('turns the outline white and the plate see-through', () => {
    const pixels = logo([GOLD, 1], [NAVY, 1], [CLEAR, 1]);
    keepLight(pixels, 0.45);
    expect([...pixels]).toEqual([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0]);
  });
});

/** A logo `width` × `height`, each pixel as `at` says. */
function picture(width: number, height: number, at: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const pixels: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.push(...at(x, y));
  return new Uint8ClampedArray(pixels);
}

/** Lettering: a few bars, as a name's strokes are. */
const inLetters = (x: number, y: number) => y >= 6 && y < 14 && x >= 8 && x < 52 && x % 6 < 3;

/**
 * The kind that showed as a white square (owner, 2026-11-25): a picture, solid
 * all over — a shaded backdrop in many colours, light lettering on it — that
 * no plate rule recognises.
 */
const PHOTO = () =>
  picture(60, 20, (x, y) => {
    if (inLetters(x, y)) return [235, 230, 220, 255];
    const v = 40 + x * 2 + ((x * 7 + y * 13) % 17);
    return [v, Math.round(v * 0.8), Math.round(v * 0.5), 255];
  });
/** Three solid squares side by side, the name in tiny letters on them. */
const SQUARES = () =>
  picture(62, 20, (x, y) => {
    if (x === 20 || x === 41) return CLEAR;
    if (y === 10 && x % 4 === 0) return [250, 250, 250, 255];
    return [[50, 50, 50, 255], [140, 140, 140, 255], [200, 200, 200, 255]][Math.floor(x / 21)] as Rgba;
  });
/** A dark mark on nothing: the usual logo. */
const MARK = () => picture(60, 20, (x, y) => (inLetters(x, y) || (y >= 2 && y < 4 && x < 56) ? BLACK : CLEAR));
/** Light lettering on a red plate, with a clear margin round it. */
const PLATE = () =>
  picture(60, 20, (x, y) => {
    if (x < 2 || x >= 58 || y < 2 || y >= 18) return CLEAR;
    return inLetters(x, y) ? WHITE : RED;
  });

describe('isBlock', () => {
  it('knows a picture solid all over is a block in white', () => {
    expect(isBlock(PHOTO(), 60)).toBe(true);
  });

  it('knows three solid squares are blocks in white', () => {
    expect(isBlock(SQUARES(), 62)).toBe(true);
  });

  it('leaves a mark on nothing alone', () => {
    expect(isBlock(MARK(), 60)).toBe(false);
  });

  it('measures what shows, not the see-through margin round it', () => {
    const pixels = PLATE();
    expect(isBlock(pixels, 60)).toBe(true);
    cutOut(pixels, letteringSplit(pixels) as number);
    expect(isBlock(pixels, 60)).toBe(false);
  });
});

describe('drawLogo', () => {
  it('shows the name for a picture that is a white square whatever is done to it', () => {
    const pixels = PHOTO();
    expect(letteringSplit(pixels)).toBeNull();
    expect(plateBrightness(pixels)).toBeNull();
    expect(drawLogo(pixels, 60)).toBe('name');
  });

  it('shows the name for solid squares', () => {
    expect(drawLogo(SQUARES(), 62)).toBe('name');
  });

  it('leaves a mark on nothing plain white', () => {
    expect(drawLogo(MARK(), 60)).toBe('plain');
  });

  it('still cuts light lettering out of a plate', () => {
    expect(drawLogo(PLATE(), 60)).toBe('changed');
  });
});
