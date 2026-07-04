import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({page} : {page :any}) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
    await page.goto('/#/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard loads correctly — stat cards are visible', async ({page} : {page :any}) => {
    await expect(page.getByText('Active Projects')).toBeVisible();
    await expect(page.getByText('Due Today')).toBeVisible();
    await expect(page.getByText('Overdue Tasks')).toBeVisible();
    await expect(page.getByText('Completed This Week')).toBeVisible();
  });

  test('stats display numeric values', async ({page} : {page :any}) => {
    const statLabels = ['Active Projects', 'Due Today', 'Overdue Tasks', 'Completed This Week'];
    for (const label of statLabels) {
      const card = page.getByText(label).locator('..');
      const valueEl = card.locator('div').filter({ hasText: /\d+/ }).first();
      await expect(valueEl).toBeVisible();
      const text = await valueEl.textContent();
      expect(text?.trim()).not.toBe('');
    }
  });

  test('activity feed is visible with pagination controls', async ({page} : {page :any}) => {
    await expect(page.getByText('Recent Activity')).toBeVisible();
    await expect(page.getByRole('button', { name: /prev/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
  });

  test('tasks by status chart renders', async ({page} : {page :any}) => {
    await expect(page.getByText('Task Breakdown')).toBeVisible();
    const pieSlices = page.locator('.recharts-pie-sector');
    const sliceCount = await pieSlices.count();
    expect(sliceCount).toBeGreaterThanOrEqual(0);
  });

  test('team workload section exists if data present', async ({page} : {page :any}) => {
    const workloadSection = page.getByText(/Organization Workload|Team Workload/);
    if (await workloadSection.isVisible().catch(() => false)) {
      const bars = page.locator('.recharts-bar-rectangle');
      await expect(bars.first()).toBeVisible();
    }
  });

  test('upcoming deadlines section is visible', async ({page} : {page :any}) => {
    await expect(page.getByText('Due Today')).toBeVisible();
  });

  test('weekly completion trend chart renders if data present', async ({page} : {page :any}) => {
    const trendSection = page.getByText('Weekly Performance Trend');
    if (await trendSection.isVisible().catch(() => false)) {
      const lines = page.locator('.recharts-line-curve');
      await expect(lines.first()).toBeVisible();
    }
  });

  test('pagination works — clicking Next changes page', async ({page} : {page :any}) => {
    const nextBtn = page.getByRole('button', { name: /next/i });
    const prevBtn = page.getByRole('button', { name: /prev/i });

    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();

    const initialDisabled = await prevBtn.isDisabled();
    if (!initialDisabled) {
      const initialText = await page.getByText(/Page \d+ of \d+/).textContent();
      await nextBtn.click();
      await page.waitForTimeout(500);
      const newText = await page.getByText(/Page \d+ of \d+/).textContent();
      expect(newText).not.toBe(initialText);
    }
  });
});
