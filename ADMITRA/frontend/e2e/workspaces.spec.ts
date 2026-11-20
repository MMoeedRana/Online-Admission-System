import { expect, test } from '@playwright/test';
import { ACCOUNTS, checkPage, login, settle, SUPER_ADMIN_PASSWORD, watchErrors } from './helpers';

test.describe('applicant portal', () => {
  test('dashboard, profile, records, applications, results and shortlist', async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, ACCOUNTS.applicant);
    for (const path of [
      '/applicant/dashboard',
      '/applicant/profile',
      '/applicant/records',
      '/applicant/applications',
      '/applicant/results',
      '/applicant/shortlist',
      '/applicant/advisor',
    ])
      await checkPage(page, path);
    expect(errors).toEqual([]);
  });
});

test.describe('institution workspace', () => {
  test('every admin screen is responsive and accessible', async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, ACCOUNTS.ritAdmin);
    for (const path of [
      '/institution/dashboard',
      '/institution/analytics',
      '/institution/applications',
      '/institution/verifications',
      '/institution/payments',
      '/institution/merit-formulas',
      '/institution/merit-lists',
      '/institution/offers',
      '/institution/campaigns',
      '/institution/programs',
      '/institution/structure',
      '/institution/staff',
      '/institution/document-requirements',
      '/institution/email-templates',
      '/institution/directory',
      '/institution/support',
      '/institution/audit-log',
      '/institution/settings',
    ])
      await checkPage(page, path);
    expect(errors).toEqual([]);
  });

  test('analytics shows the funnel and the daily submissions (RPT-1)', async ({ page }) => {
    await login(page, ACCOUNTS.ritAdmin);
    await page.goto('/institution/analytics');
    await settle(page);
    for (const step of ['Submitted', 'Fee paid', 'Verified', 'Offered', 'Accepted', 'Enrolled'])
      await expect(page.getByText(step, { exact: true }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Last 30 days' }).click();
    await expect(page.getByText(/in the last 30 days/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demand per program' })).toBeVisible();
  });

  test('an institution opens a support ticket and sees only its own tickets (SUP-1, SUP-2)', async ({ page }, info) => {
    await login(page, ACCOUNTS.cvuAdmin);
    await page.goto('/institution/support');
    await settle(page);
    await expect(page.getByText('Merit list 2 shows a candidate twice')).toHaveCount(0); // a RIT ticket
    await page.getByRole('button', { name: 'New ticket' }).click();
    const subject = `Test ticket ${info.project.name} ${Date.now()}`;
    await page.fill('#tk-subject', subject);
    await page.selectOption('#tk-category', 'TECHNICAL');
    await page.selectOption('#tk-priority', 'HIGH');
    await page.fill('#tk-message', 'Created by the end-to-end test to check the support flow.');
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await page.waitForURL(/\/institution\/support\/[a-f0-9]{24}$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(subject);
    await expect(page.getByText('High · 8 h').first()).toBeVisible();
  });

  test('an admission officer does not see analytics, support or the audit log', async ({ page }) => {
    await login(page, ACCOUNTS.officer);
    const nav = page.getByRole('navigation', { name: 'Workspace' });
    if (await nav.isHidden()) await page.getByRole('button', { name: /menu/i }).first().click();
    await expect(page.getByRole('link', { name: 'Applications' }).first()).toBeVisible();
    for (const name of ['Analytics & Reports', 'Support', 'Audit Log'])
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  });
});

test.describe('platform (Super Admin)', () => {
  test('every platform screen is responsive and accessible', async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, ACCOUNTS.superAdmin, SUPER_ADMIN_PASSWORD);
    for (const path of [
      '/platform/dashboard',
      '/platform/institutions',
      '/platform/plans',
      '/platform/registry',
      '/platform/directory',
      '/platform/analytics',
      '/platform/support',
      '/platform/audit-log',
    ])
      await checkPage(page, path);
    expect(errors).toEqual([]);
  });

  test('the platform team replies to a ticket and sets its status (SUP-3)', async ({ page }) => {
    await login(page, ACCOUNTS.superAdmin, SUPER_ADMIN_PASSWORD);
    await page.goto('/platform/support');
    await settle(page);
    await page.getByLabel('Search tickets').fill('contact person');
    await page
      .locator('main')
      .getByText('Change of the institution contact person')
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForURL(/\/platform\/support\/[a-f0-9]{24}$/);
    await page.fill('#tk-reply', 'Thank you, we are updating the contact person now.');
    await page.selectOption('#tk-status', 'IN_PROGRESS');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Thank you, we are updating the contact person now.').last()).toBeVisible();
    await expect(page.getByText('In progress').first()).toBeVisible();
  });

  test('the audit log can be filtered and exported', async ({ page }) => {
    await login(page, ACCOUNTS.superAdmin, SUPER_ADMIN_PASSWORD);
    await page.goto('/platform/audit-log');
    await settle(page);
    await page.getByLabel('Filter by action').selectOption('PLAN_CREATED');
    await expect(
      page
        .locator('main span', { hasText: /^Plan created$/ })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toBe('audit-log.csv');
  });
});
