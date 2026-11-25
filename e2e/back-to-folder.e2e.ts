/**
 * Back to a big Videos folder (GitHub #30): the page comes back where it was
 * left, on the clip that was played, even when the folder takes a moment to
 * read and the pointer moves meanwhile. Against `dev:mock` with 600 clips read
 * back after 400 ms (`kinemaMockVideos`); see kb.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { drawn, focusKey, focused, mpv, open, press, settled } from './kb';

const scrollTop = (page: Page) => page.evaluate(() => Math.round(document.querySelector('.browse')!.scrollTop));

/** Into the folder, down to a clip far below the top, and play it. */
async function playFarDown(page: Page): Promise<{ key: string | null; scroll: number }> {
  await page.addInitScript(() => localStorage.setItem('kinemaMockVideos', '600'));
  await open(page, 'windows');
  await page.evaluate(async () => {
    const path = '/src/ui/lightLook.ts';
    (await import(/* @vite-ignore */ path)).setLook('full');
  });
  await press(page, 'ArrowUp');
  for (let i = 0; i < 6 && (await focused(page)) !== 'Library'; i++) await press(page, 'ArrowRight');
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toContain('Home videos');
  await press(page, 'Enter');
  await expect.poll(() => focused(page), { timeout: 15_000 }).toContain('Birthday 2024-05-02');
  await press(page, 'ArrowDown', 25);
  await settled(page);
  const key = await focusKey(page);
  const scroll = await scrollTop(page);
  expect(scroll, 'the page has scrolled well down').toBeGreaterThan(2000);
  await press(page, 'Enter');
  await expect.poll(async () => (await mpv(page)).path).toContain('clip ');
  return { key, scroll };
}

async function leavePlayer(page: Page): Promise<void> {
  for (let i = 0; i < 5 && (await page.locator('.player').count()) > 0; i++) {
    await press(page, 'Escape');
    await drawn(page);
  }
  await expect(page.locator('.player')).toHaveCount(0);
}

test('Back by keys lands on the clip that was played, the page where it was', async ({ page }) => {
  const { key, scroll } = await playFarDown(page);
  await leavePlayer(page);
  await expect.poll(() => focusKey(page), { timeout: 10_000 }).toBe(key);
  await settled(page);
  expect(Math.abs((await scrollTop(page)) - scroll)).toBeLessThan(40);
});

test('the pointer moving while the folder is read does not lose the place (GitHub #30)', async ({ page }) => {
  const { key, scroll } = await playFarDown(page);
  await leavePlayer(page);
  // A hand on the mouse while the folder is read back: a real move, not a click.
  await page.mouse.move(400, 300);
  await page.mouse.move(420, 320);
  await page.mouse.move(440, 340);
  await expect(page.locator('.video-tile').nth(100)).toBeAttached({ timeout: 10_000 });
  await settled(page);
  expect(Math.abs((await scrollTop(page)) - scroll), 'the page is where it was left').toBeLessThan(40);
  expect(await focusKey(page), 'the keys go on from the clip that was played').toBe(key);
});
