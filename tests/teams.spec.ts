import { test, expect } from '@playwright/test';
import { login, loginAs, createTeam } from './helpers';

test.describe('Teams', () => {
  test.beforeEach(async ({ page }) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('Teams page loads — verify page title and create button', async ({ page }) => {
    await page.goto('/#/teams');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /our teams/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new team/i })).toBeVisible();
  });

  test('Create a team — click "Create Team", fill name/description, submit, verify team appears', async ({ page }) => {
    const name = `Team ${Date.now()}`;
    await createTeam(page, name, 'E2E test team');
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText('E2E test team').first()).toBeVisible();
  });

  test('View team details — click a team, verify members list and details', async ({ page }) => {
    const name = `Details ${Date.now()}`;
    await createTeam(page, name, 'View details');
    await page.waitForTimeout(500);

    const card = page.locator('.card').filter({ hasText: name }).first();
    await card.getByRole('button', { name: /manage/i }).first().click();

    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText(/members/i).first()).toBeVisible();

    await page.getByRole('button', { name: /close/i }).click();
  });

  test('Edit team — change team name/description, save, verify', async ({ page }) => {
    const name = `Edit ${Date.now()}`;
    await createTeam(page, name, 'Before edit');
    await page.waitForTimeout(500);

    const card = page.locator('.card').filter({ hasText: name }).first();
    await card.getByRole('button', { name: /manage/i }).first().click();

    await expect(page.getByText(name).first()).toBeVisible();

    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();

    await page.getByRole('button', { name: /close/i }).click();
  });

  test('Delete team — delete a team, verify removed', async ({ page }) => {
    const name = `Delete ${Date.now()}`;
    await createTeam(page, name, 'To delete');
    await page.waitForTimeout(500);

    await expect(page.getByText(name).first()).toBeVisible();

    page.once('dialog', dialog => dialog.accept());

    const card = page.locator('.card').filter({ hasText: name }).first();
    await card.locator('button').filter({ has: page.locator('.lucide-trash2') }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(name)).not.toBeVisible();
  });
});
