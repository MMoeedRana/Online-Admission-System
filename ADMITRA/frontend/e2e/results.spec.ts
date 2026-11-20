import { expect, test } from '@playwright/test';
import { login, settle } from './helpers';

test.describe('My Results (FIND-1, FIND-2, FIND-4, FIND-8) and confirmations (SAFE-7)', () => {
  test('a selected applicant sees position, aggregate, deadline, accept / decline and the breakdown', async ({
    page,
  }) => {
    await login(page, 'ayesha.noor@example.com');
    await page.goto('/applicant/results');
    await settle(page);
    const card = page.locator('main').getByText('Accept offer').first();
    await expect(card).toBeVisible();
    await expect(page.getByText('Merit position').first()).toBeVisible();
    await expect(page.getByText(/Accept by /).first()).toBeVisible();
    await page.getByRole('button', { name: 'How my aggregate was calculated' }).first().click();
    await expect(page.getByRole('columnheader', { name: 'Contribution' }).first()).toBeVisible();
    // SAFE-7: declining asks for confirmation first, and cancelling changes nothing.
    await page.getByRole('button', { name: 'Decline', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Accept offer').first()).toBeVisible();
  });

  test('a not selected applicant sees the gap to the last selected aggregate and other programs', async ({ page }) => {
    await login(page, 'danish.iqbal@example.com');
    await page.goto('/applicant/results');
    await settle(page);
    await expect(page.getByText('Not selected').first()).toBeVisible();
    await expect(page.getByText('Last selected').first()).toBeVisible();
    await expect(page.getByText(/You were [\d.]+ marks below the last selected aggregate/).first()).toBeVisible();
  });
});
