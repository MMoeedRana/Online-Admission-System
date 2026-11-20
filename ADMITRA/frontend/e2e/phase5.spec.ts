import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, settle, SUPER_ADMIN_PASSWORD } from './helpers';

test.describe('branding (BRAND-1, BRAND-2, BRAND-5)', () => {
  test('the institution workspace uses its own colours and logo', async ({ page, isMobile }) => {
    await login(page, ACCOUNTS.ritAdmin);
    await page.goto('/institution/dashboard');
    await settle(page);
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    );
    expect(primary.toUpperCase()).toBe('#0F766E');
    if (!isMobile) await expect(page.locator('aside img').first()).toBeVisible();
  });

  test('the Super Admin previews colours before saving them', async ({ page }) => {
    await login(page, ACCOUNTS.superAdmin, SUPER_ADMIN_PASSWORD);
    await page.goto('/platform/branding');
    await settle(page);
    await page.getByRole('button', { name: 'Use #B91C1C' }).first().click();
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save branding' })).toBeEnabled();
  });
});

test.describe('Mitra (AGENT-2, AGENT-6, AGENT-7)', () => {
  test('the briefing and the integrity alerts are shown', async ({ page }) => {
    await login(page, ACCOUNTS.superAdmin, SUPER_ADMIN_PASSWORD);
    await page.goto('/platform/mitra');
    await settle(page);
    await page.getByRole('tab', { name: 'Briefing' }).click();
    await expect(page.getByText(/In the last 24 hours/).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Integrity alerts' }).click();
    await expect(page.getByText('Alerts are patterns found by fixed rules')).toBeVisible();
  });

  test('a question is answered with the platform data when a provider is connected', async ({ page }) => {
    await login(page, ACCOUNTS.superAdmin, SUPER_ADMIN_PASSWORD);
    await page.goto('/platform/mitra');
    await settle(page);
    const notConnected = await page.getByText(/is not connected to an AI provider yet/).isVisible();
    test.skip(notConnected, 'No AI provider is configured (set AI_PROVIDER and AI_API_KEY, or AI_PROVIDER=mock).');
    await page.locator('textarea[id^=mitra-input]').fill('Is there any suspicious activity?');
    await page.keyboard.press('Enter');
    await expect(
      page
        .locator('main')
        .getByText(/integrity|alert/i)
        .last(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('an institution on a plan without the copilot sees why', async ({ page }) => {
    await login(page, ACCOUNTS.cvuAdmin);
    await page.goto('/institution/mitra');
    await settle(page);
    await expect(page.getByText(/included in plans with AI Copilot/)).toBeVisible();
  });
});
