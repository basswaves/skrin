/**
 * A big new Videos folder (GitHub #28): the frames for the tiles on screen are
 * taken first, and a scroll moves the next ones to what is now on screen.
 * Against `dev:mock` with 600 clips whose frames take 40 ms each, every ask
 * written down in `window.__frameAsks` (mockBackend.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { focused, open, press, settled } from './kb';

const asks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frameAsks?: number[] }).__frameAsks ?? []);

/** The ids of the tiles on screen now. */
const onScreen = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.videos-page [data-video]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight && r.width > 0;
      })
      .map((el) => Number(el.dataset.video))
  );

test('the tiles on screen get their frames first, also after a scroll', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kinemaMockVideos', '600'));
  await open(page, 'windows');
  await press(page, 'ArrowUp');
  for (let i = 0; i < 6 && (await focused(page)) !== 'Library'; i++) await press(page, 'ArrowRight');
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toContain('Home videos');
  await press(page, 'Enter');
  await expect.poll(() => focused(page), { timeout: 15_000 }).toContain('Birthday 2024-05-02');

  // Far down, out of page order's reach for a long while (600 × 40 ms).
  await press(page, 'ArrowDown', 40);
  await settled(page);
  const screen = await onScreen(page);
  expect(Math.min(...screen), 'the page has scrolled well past the top').toBeGreaterThan(20100);
  const asked = await asks(page);
  const before = asked.length;
  // Those on screen not asked yet (a few may have gone while the page moved).
  const left = screen.filter((id) => !asked.includes(id));
  expect(left.length, 'most of the screen still waits').toBeGreaterThan(screen.length / 2);
  await expect.poll(async () => (await asks(page)).length, { timeout: 10_000 }).toBeGreaterThan(before + left.length + 2);
  const after = (await asks(page)).slice(before);
  // The first ask after the scroll may have been in flight already.
  // At most one ask was already in flight when the page stopped; after it,
  // every tile left on screen, before anything else.
  const window = after.slice(0, left.length + 1);
  expect(left.filter((id) => !window.includes(id)), 'the tiles on screen come next').toEqual([]);
  // Then the ones just below the screen, not back at the top.
  expect(after[left.length + 1], 'then on downwards').toBeGreaterThan(Math.max(...screen));
  expect(new Set(after).size, 'no frame asked twice').toBe(after.length);
});
