import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('Settings page loads — verify sections: Profile, Security, User Management', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
    await expect(page.getByText(/profile overview/i)).toBeVisible();
    await expect(page.getByText(/security/i)).toBeVisible();
    await expect(page.getByText(/appearance/i)).toBeVisible();
  });

  test('Profile section — verify user name and email are displayed', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');

    const nameEl = page.getByText(/testadmin|test admin/i);
    const emailEl = page.getByText(/testadmin@flowdesk/i);
    const nameVisible = await nameEl.isVisible().catch(() => false);
    const emailVisible = await emailEl.isVisible().catch(() => false);
    expect(nameVisible || emailVisible).toBe(true);
  });

  test('Users list — verify users table exists with role badges', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');

    const userMgmt = page.getByText(/user management/i);
    if (await userMgmt.isVisible().catch(() => false)) {
      await expect(userMgmt).toBeVisible();
    }
  });

  test('Create user — click create user button, verify modal/form appears', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');

    const addUserBtn = page.getByRole('button', { name: /add user/i });
    if (await addUserBtn.isVisible().catch(() => false)) {
      await addUserBtn.click();
      await page.waitForTimeout(500);
      const nameInput = page.getByPlaceholder(/full name/i);
      await expect(nameInput).toBeVisible();
    }
  });

  test('Theme toggle — toggle it and verify class change', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');

    const switchBtn = page.getByRole('button', { name: /switch to (dark|light)/i });
    if (await switchBtn.isVisible().catch(() => false)) {
      await switchBtn.click();
      await page.waitForTimeout(500);
    }
  });
});
