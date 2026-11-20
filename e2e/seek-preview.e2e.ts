/**
 * Seek preview pictures (round 10): the picture above the seek bar where a
 * held Left/Right takes the film — by keyboard and remote alone, the mouse
 * untouched — and its own line in Settings → Advanced, with the space used
 * and a Delete reached by keys. Android makes none, and says so.
 *
 * The mock draws each picture with its second on it (mockBackend.ts), so the
 * test reads which one is shown from `data-at`.
 */
import { expect, test, type Page } from '@playwright/test';
import { focused, open, pause, press } from './kb';

interface FakeMpv {
  position: number;
  commands: { name: string }[];
}

const position = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fakeMpv: FakeMpv }).__fakeMpv.position);

async function play(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00'));
  await open(page, 'windows');
  await press(page, 'Enter');
  await expect(page.locator('.player')).toBeAttached();
  await page.clock.setSystemTime(new Date('2026-10-02T12:00:00'));
  await expect.poll(() => position(page)).toBeGreaterThan(0.5);
}

/** The control the ring is on, by its spoken name (the seek bar has no text). */
const ringOn = (page: Page) =>
  page.evaluate(() => document.querySelector('.focused')?.getAttribute('aria-label'));

const preview = (page: Page) => page.locator('.seek-preview');

test('a held key shows the picture where the seek will land, and it goes when the seek is sent', async ({
  page,
}) => {
  await play(page);
  await expect(preview(page)).toHaveCount(0);

  // Watching: Right held steers a seek; the picture follows the target.
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 8; i++) {
    await pause(page, 60, 'input pacing: a held-key repeat');
    await page.keyboard.down('ArrowRight');
  }
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator('img.seek-preview-picture')).toBeVisible();
  const at = Number(await preview(page).getAttribute('data-at'));
  expect(at).toBeGreaterThan(0);
  expect(at % 10).toBe(0);
  // The time under the picture is the target's, not the play head's.
  await expect(preview(page).locator('.seek-preview-time')).not.toHaveText('0:00');
  await page.keyboard.up('ArrowRight');
  // Sent: the film is there, and the picture is gone.
  await expect.poll(() => position(page)).toBeGreaterThan(at - 15);
  await expect(preview(page)).toHaveCount(0);

  // On the seek bar, a remote's taps: the same picture, the ring stays on the bar.
  await press(page, 'ArrowDown');
  await press(page, 'ArrowUp');
  await expect.poll(() => ringOn(page)).toBe('Position');
  // Three taps back, well clear of where the film has played on to.
  await press(page, 'ArrowLeft', 3);
  await expect(preview(page)).toBeVisible();
  await expect.poll(async () => Number(await preview(page).getAttribute('data-at'))).toBeLessThan(at);
  expect(await ringOn(page)).toBe('Position');
});

async function advancedSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('.settings-nav button', { hasText: 'Advanced' }).first().click();
  return page.locator('.settings-section', { hasText: 'Seek previews' });
}

test('Settings shows the space seek previews take, and deletes them by keys', async ({ page }) => {
  await open(page, 'windows');
  const section = await advancedSettings(page);
  await expect(section).toContainText('1440 pictures');

  await press(page, 'ArrowRight');
  for (let i = 0; i < 20 && (await focused(page)) !== 'Delete seek previews'; i++) {
    await press(page, 'ArrowDown');
  }
  expect(await focused(page)).toBe('Delete seek previews');
  await press(page, 'Enter');
  await expect(section).toContainText('Deleted 1440 pictures.');
  await expect(section).toContainText('0 pictures');
});

test('Android makes no seek previews, and Settings says it is a computer’s', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kinemaMockSystem', 'android'));
  await page.goto('/');
  await expect.poll(() => focused(page), { timeout: 30_000 }).toContain('Play');
  const section = await advancedSettings(page);
  await expect(section).toContainText('made on a computer only');
  await expect(section.getByRole('button', { name: 'Delete seek previews' })).toHaveCount(0);
});
