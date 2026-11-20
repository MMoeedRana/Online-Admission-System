import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Admitra@123';
export const ACCOUNTS = {
  applicant: 'ayesha.noor@example.com',
  ritAdmin: 'admin@rit.example.edu.pk',
  cvuAdmin: 'admin@cvu.example.edu.pk',
  officer: 'officer@cvu.example.edu.pk',
  superAdmin: 'admin@admitra.local',
};
export const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'Admin@12345';

/** Collects uncaught page errors so a test can assert there were none. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await expect(page.locator('#email')).toHaveAttribute('placeholder', /.+/);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Waits for the data of a page and scrolls through it so that every animated section is shown. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}

/** The page must never scroll sideways (responsive layout). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

/** WCAG 2.2 AA check with axe-core: no serious or critical violations are allowed. */
export async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('nextjs-portal')
    .analyze();
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} -> ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

/** Opens a page, waits for it, and runs the layout and accessibility checks. */
export async function checkPage(page: Page, path: string, heading?: RegExp) {
  await page.goto(path);
  await settle(page);
  if (heading) await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
}
