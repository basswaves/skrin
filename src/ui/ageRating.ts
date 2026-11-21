/**
 * The age rating the page shows: the one TMDB holds for the system's own
 * country (`titles.certifications`, tab-separated `DK=15`), and nothing when
 * it has none for it — never another country's, never a guess.
 *
 * The country is the region of the system's language (`da-DK` → `DK`).
 * A language with no region (`en`) names no country, so it shows nothing.
 */

/** The regions the system's languages name, first choice first. */
export function systemRegions(languages: readonly string[]): string[] {
  const regions: string[] = [];
  for (const code of languages) {
    const region = /^[A-Za-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(code)?.[1]?.toUpperCase();
    if (region && !regions.includes(region)) regions.push(region);
  }
  return regions;
}

/** The rating for the first of the system's regions TMDB has one for, or null. */
export function localRating(
  certifications: string | null | undefined,
  languages: readonly string[]
): string | null {
  if (!certifications) return null;
  const held = new Map<string, string>();
  for (const part of certifications.split('\t')) {
    const [country, rating] = part.split('=');
    if (country && rating) held.set(country, rating);
  }
  // Only the first region: a second language's country is not "here".
  const [region] = systemRegions(languages);
  return (region && held.get(region)) || null;
}

/** The running system's languages, as the webview reports them. */
export function systemLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language];
}
