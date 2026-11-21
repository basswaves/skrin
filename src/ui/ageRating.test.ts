import { describe, expect, it } from 'vitest';
import { localRating, systemRegions } from './ageRating';

describe('the local age rating', () => {
  const held = 'DK=15\tGB=12A\tUS=PG-13';

  it("shows the system's own country's rating", () => {
    expect(localRating(held, ['da-DK', 'en-US'])).toBe('15');
    expect(localRating(held, ['en-GB'])).toBe('12A');
    // Only the first language: a later one's country is not here.
    expect(localRating(held, ['nb', 'en-GB', 'en-US'])).toBeNull();
  });

  it('says nothing when TMDB has none for that country, rather than another one', () => {
    expect(localRating(held, ['de-DE'])).toBeNull();
    expect(localRating(held, ['en'])).toBeNull();
    expect(localRating(held, [])).toBeNull();
    expect(localRating('', ['en-US'])).toBeNull();
    expect(localRating(null, ['en-US'])).toBeNull();
  });

  it('reads regions from language codes', () => {
    expect(systemRegions(['nb-NO', 'en', 'en-US', 'nb_NO'])).toEqual(['NO', 'US']);
  });
});
