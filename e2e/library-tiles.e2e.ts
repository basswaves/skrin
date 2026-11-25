/**
 * The Library page by keys alone (GitHub #31): Playlists and Add a folder
 * (Folders in TV mode) a small row of plain buttons on top, the Videos
 * folders below, each tile with up to four pictures from inside it — four two
 * by two, fewer as they are, none as the plain tile. `kinemaMockFrames=N`
 * gives the first N of the folder's four picks a frame (mockBackend.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { focused, open, press, tvMode } from './kb';

async function moveTo(page: Page, key: string, text: string): Promise<void> {
  for (let i = 0; i < 6 && !(await focused(page))?.startsWith(text); i++) await press(page, key);
  expect(await focused(page)).toMatch(new RegExp(`^${text}`));
}

async function library(page: Page, frames: number): Promise<void> {
  await page.addInitScript((n) => localStorage.setItem('kinemaMockFrames', String(n)), frames);
  await open(page, 'windows');
  await press(page, 'ArrowUp', 2);
  await moveTo(page, 'ArrowRight', 'Library');
  await press(page, 'Enter');
  await expect(page.locator('.library-page')).toBeVisible();
  await expect.poll(() => focused(page)).toMatch(/^Home videos/);
}

test('Playlists and Add a folder sit above the folders, apart from them', async ({ page }) => {
  await library(page, 4);
  // Only folders are tiles; the two others are plain buttons in their own row.
  await expect(page.locator('.library-tile')).toHaveCount(1);
  await expect(page.locator('.library-actions button')).toHaveText(['Playlists', 'Add a folder']);
  const tile = page.locator('.library-tile', { hasText: 'Home videos' });
  await expect(tile.locator('.library-tile-pics.pics-4 > *')).toHaveCount(4);

  await press(page, 'ArrowUp');
  await expect.poll(() => focused(page)).toBe('Playlists');
  await press(page, 'ArrowRight');
  await expect.poll(() => focused(page)).toBe('Add a folder');
  await press(page, 'ArrowDown');
  await expect.poll(() => focused(page)).toMatch(/^Home videos/);
  await press(page, 'Enter');
  await expect(page.locator('.videos-page')).toBeVisible();

  // TV mode: Folders, Skrin's own browser, in Add a folder's place.
  await press(page, 'Escape');
  await expect(page.locator('.library-page')).toBeVisible();
  await tvMode(page);
  await expect(page.locator('.library-actions button')).toHaveText(['Playlists', 'Folders']);
  await moveTo(page, 'ArrowUp', 'Playlists');
  await press(page, 'ArrowRight');
  await expect.poll(() => focused(page)).toBe('Folders');
  await press(page, 'Enter');
  await expect(page.locator('.folders-page')).toBeVisible();
});

test('a folder with fewer pictures shows what it has, and with none the plain tile', async ({ page }) => {
  await library(page, 3);
  const tile = page.locator('.library-tile', { hasText: 'Home videos' });
  await expect(tile.locator('.library-tile-pics.pics-3 > *')).toHaveCount(3);
  await expect(tile).toHaveClass(/library-tile-pictured/);
});

test('a folder whose frames cannot be taken keeps its plain tile', async ({ page }) => {
  await library(page, 0);
  const tile = page.locator('.library-tile', { hasText: 'Home videos' });
  await expect(tile.locator('.library-tile-pics')).toHaveCount(0);
  await expect(tile).not.toHaveClass(/library-tile-pictured/);
  await expect(tile.locator('.library-tile-name')).toHaveText('Home videos');
});
