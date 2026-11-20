import { expect, test } from '@playwright/test';
import { checkPage, watchErrors } from './helpers';

const PAGES: [string, RegExp?][] = [
  ['/'],
  ['/programs'],
  ['/institutions'],
  ['/directory'],
  ['/advisor'],
  ['/merit-lists'],
  ['/status'],
  ['/login'],
  ['/register'],
  ['/register-institution'],
  ['/forgot-password'],
];

test.describe('public pages', () => {
  for (const [path, heading] of PAGES) {
    test(`${path} is responsive and accessible`, async ({ page }) => {
      const errors = watchErrors(page);
      await checkPage(page, path, heading);
      expect(errors).toEqual([]);
    });
  }

  test('every form field on the sign-in and sign-up pages has a placeholder', async ({ page }) => {
    for (const path of ['/login', '/register', '/forgot-password']) {
      await page.goto(path);
      const missing = await page.$$eval('main input:not([type=checkbox]):not([type=hidden]), main textarea', (els) =>
        els.filter((e) => !(e as HTMLInputElement).placeholder).map((e) => e.id || e.getAttribute('name')),
      );
      expect(missing, path).toEqual([]);
    }
  });

  test('buttons and links show the pointer cursor in light and dark mode', async ({ page }) => {
    await page.goto('/login');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      const cursors = await page.$$eval('button:not(:disabled), a[href]', (els) => [
        ...new Set(els.map((e) => getComputedStyle(e).cursor)),
      ]);
      expect(cursors, theme).toEqual(['pointer']);
    }
  });
});
