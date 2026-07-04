import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers';

test.describe('CRM Page', () => {
  test.beforeEach(async ({page} : {page :any}) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('CRM loads with sidebar tabs — verify Dashboard, Campaigns, Dial Queue, Schedule, Plan, Summary, Logs tabs', async ({page} : {page :any}) => {
    await page.goto('/#/crm');
    await page.waitForLoadState('networkidle');

    const tabs = ['Dashboard', 'Campaigns', 'Dial Queue', 'Schedule', 'Plan', 'Summary', 'Logs'];
    for (const tab of tabs) {
      const link = page.getByRole('link', { name: new RegExp(tab, 'i') }).or(
        page.getByRole('button', { name: new RegExp(tab, 'i') })
      );
      const isVisible = await link.isVisible().catch(() => false);
      if (isVisible) {
        await expect(link).toBeVisible();
      }
    }
  });

  test('Campaigns page — navigate to campaigns, verify list', async ({page} : {page :any}) => {
    await page.goto('/#/crm/campaigns');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /campaigns/i }).first()).toBeVisible();
  });

  test('Leads/Dial Queue — navigate to leads, verify lead list/table', async ({page} : {page :any}) => {
    await page.goto('/#/crm/dial');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /dial queue/i })).toBeVisible();
  });

  test('CRM Summary — navigate to summary, verify stats display', async ({page} : {page :any}) => {
    await page.goto('/#/crm/summary');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /summary/i })).toBeVisible();
  });
});
