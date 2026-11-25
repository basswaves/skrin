/**
 * A big new Videos folder (GitHub #28): the frames for the tiles on screen are
 * taken first, and a scroll moves the next ones to what is now on screen.
 * Against `dev:mock` with 600 clips, every ask written down in
 * `window.__frameAsks` and every frame held behind `window.__holdFrames` until
 * the page has stopped where the test took it (mockBackend.ts) — so the order
 * does not hang on how fast a loaded machine scrolls.
 */
import { expect, test, type Page } from '@playwright/test';
import { focused, open, press, settled } from './kb';

type Frames = { __frameAsks?: number[]; __holdFrames?: Promise<void>; __releaseFrames?: () => void };

const asks = (page: Page) => page.evaluate(() => (window as unknown as Frames).__frameAsks ?? []);

/** The ids of the tiles on screen now: inside both the scrolling page and the window. */
const onScreen = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.browse')!.getBoundingClientRect();
    const top = Math.max(0, box.top);
    const bottom = Math.min(innerHeight, box.bottom);
    return Array.from(document.querySelectorAll<HTMLElement>('.videos-page [data-video]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > top && r.top < bottom;
      })
      .map((el) => Number(el.dataset.video));
  });

/** The page has stopped moving, and has drawn twice since (what is on screen has been counted). */
const still = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    const at = document.querySelector('.browse')!.scrollTop;
    await frame();
    await frame();
    return document.querySelector('.browse')!.scrollTop === at;
  });

test('the tiles on screen get their frames first, also after a scroll', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kinemaMockVideos', '600');
    const w = window as unknown as Frames;
    w.__holdFrames = new Promise((r) => (w.__releaseFrames = r));
  });
  await open(page, 'windows');
  await press(page, 'ArrowUp');
  for (let i = 0; i < 6 && (await focused(page)) !== 'Library'; i++) await press(page, 'ArrowRight');
  await press(page, 'Enter');
  await expect.poll(() => focused(page)).toContain('Home videos');
  await press(page, 'Enter');
  await expect.poll(() => focused(page), { timeout: 15_000 }).toContain('Birthday 2024-05-02');
  // One frame asked for, and held: nothing else goes while the page moves.
  await expect.poll(async () => (await asks(page)).length).toBe(1);

  await press(page, 'ArrowDown', 40);
  await settled(page);
  await expect.poll(() => still(page), { timeout: 10_000 }).toBe(true);
  const screen = await onScreen(page);
  expect(Math.min(...screen), 'the page has scrolled well past the top').toBeGreaterThan(20100);
  expect(await asks(page), 'still only the one held').toHaveLength(1);

  await page.evaluate(() => (window as unknown as Frames).__releaseFrames!());
  await expect.poll(async () => (await asks(page)).length, { timeout: 15_000 }).toBeGreaterThan(screen.length + 2);
  const after = (await asks(page)).slice(1);
  // Every tile on screen next, before anything else…
  expect([...after.slice(0, screen.length)].sort(), 'the tiles on screen come next').toEqual([...screen].sort());
  // …then the ones just below the screen, not back at the top.
  expect(after[screen.length], 'then on downwards').toBeGreaterThan(Math.max(...screen));
  expect(new Set(after).size, 'no frame asked twice').toBe(after.length);
});
