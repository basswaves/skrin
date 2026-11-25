/**
 * Play on a library file that is not there, by keys alone (round 12b;
 * missing_file.rs, MissingFile.tsx). The mock's `kinemaMockGone` says what
 * the look in the library folders finds: moved (one file of the same name and
 * size), not_found, several, or offline (the drive cannot be reached).
 * `kinemaMockPick` is what Find it…'s file window gives.
 */
import { expect, test, type Page } from '@playwright/test';
import { focused, mpv, open, press } from './kb';

const DAY = '2026-10-02T12:00:00';

async function home(page: Page, gone: string, pick?: string): Promise<void> {
  await page.clock.setFixedTime(new Date(DAY));
  await page.addInitScript(
    ([g, p]) => {
      localStorage.removeItem('kinemaMockSystem');
      localStorage.setItem('kinemaMockGone', g);
      if (p) localStorage.setItem('kinemaMockPick', p);
    },
    [gone, pick ?? '']
  );
  await page.goto('/');
  await expect.poll(() => focused(page)).toContain('Play');
  await page.clock.setSystemTime(new Date(DAY));
}

const dialog = (page: Page) => page.locator('.missing-file');
const missingFile = (page: Page) =>
  page.evaluate(() => (window as unknown as { __missingFile?: unknown }).__missingFile ?? null);

test('moved: "It moved to … — use it?", and Use it plays it there', async ({ page }) => {
  await home(page, 'moved');
  const play = await focused(page);
  await press(page, 'Enter');
  await expect(dialog(page)).toContainText('moved to E:\\Sorted\\Films — use it?');
  await expect(page.locator('.player')).toHaveCount(0);
  await expect.poll(() => focused(page)).toBe('Use it');
  await press(page, 'ArrowDown');
  await expect.poll(() => focused(page)).toBe('Cancel');
  await press(page, 'ArrowUp');
  await press(page, 'Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.player')).toBeAttached();
  await expect.poll(async () => (await mpv(page)).path).toBe('E:\\Sorted\\Films\\moved.mkv');
  expect(await missingFile(page)).toMatchObject({ path: 'E:\\Sorted\\Films\\moved.mkv' });

  // Back from the player returns to Play, where it started.
  await expect
    .poll(async () => {
      if (await page.locator('.player').count()) await press(page, 'Escape');
      return focused(page);
    })
    .toBe(play);
});

test('not found: Find it… refuses what is not a video, Remove takes it out', async ({ page }) => {
  await home(page, 'not_found', 'E:\\Elsewhere\\notes.txt');
  await press(page, 'Enter');
  await expect(dialog(page)).toContainText('no file of the same name and size');
  await expect.poll(() => focused(page)).toBe('Find it…');
  await press(page, 'Enter');
  await expect(dialog(page)).toContainText('That is not a video file Skrin can play');
  await expect(page.locator('.player')).toHaveCount(0);

  await press(page, 'ArrowDown');
  await expect.poll(() => focused(page)).toBe('Remove from library');
  await press(page, 'Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.missing-file-removed')).toContainText('from the library. If the file comes back');
  expect(await missingFile(page)).toMatchObject({ removed: expect.any(Number) });
  await expect(page.locator('.player')).toHaveCount(0);
});

test('not found: Find it… with a video plays the file picked', async ({ page }) => {
  await home(page, 'not_found', 'E:\\Elsewhere\\film.mkv');
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toBe('Find it…');
  await press(page, 'Enter');
  await expect(page.locator('.player')).toBeAttached();
  await expect.poll(async () => (await mpv(page)).path).toBe('E:\\Elsewhere\\film.mkv');
});

test('Cancel, or Back, leaves everything as it was', async ({ page }) => {
  await home(page, 'several');
  const play = await focused(page);
  await press(page, 'Enter');
  await expect(dialog(page)).toContainText('2 files of the same name and size');
  await press(page, 'Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => focused(page)).toBe(play);
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toBe('Find it…');
  await press(page, 'ArrowDown', 2);
  await expect.poll(() => focused(page)).toBe('Cancel');
  await press(page, 'Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => focused(page)).toBe(play);
  expect(await missingFile(page)).toBeNull();
  await expect(page.locator('.player')).toHaveCount(0);
});

test('a drive that cannot be reached is said as such, with no Remove', async ({ page }) => {
  await home(page, 'offline');
  await press(page, 'Enter');
  await expect(dialog(page)).toContainText('is on F:\\Films, which Skrin cannot reach now');
  await expect(dialog(page).getByText('Remove from library')).toHaveCount(0);
  await expect.poll(() => focused(page)).toBe('Find it…');
  await press(page, 'ArrowDown');
  await expect.poll(() => focused(page)).toBe('Cancel');
});

test('a Videos folder page drops a tile taken out of the library at once', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kinemaMockGone', 'not_found'));
  await open(page, 'windows');
  await press(page, 'ArrowUp');
  for (let i = 0; i < 6 && (await focused(page)) !== 'Library'; i++) await press(page, 'ArrowRight');
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toContain('Home videos');
  await press(page, 'Enter');
  await expect.poll(() => focused(page), { timeout: 15_000 }).toContain('Birthday 2024-05-02');
  const tiles = page.locator('.video-tile');
  const before = await tiles.count();
  const name = (await focused(page)) ?? '';
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toBe('Find it…');
  await press(page, 'ArrowDown');
  await expect.poll(() => focused(page)).toBe('Remove from library');
  await press(page, 'Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(tiles, 'the removed tile is gone without leaving the page').toHaveCount(before - 1);
  await expect(page.locator('.video-tile', { hasText: name.split('\n')[0] })).toHaveCount(0);
});
