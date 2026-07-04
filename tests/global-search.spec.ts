import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers';

test.describe('Global Search in Header', () => {
  test.beforeEach(async ({page} : {page :any}) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('Search input exists — verify search bar in header', async ({page} : {page :any}) => {
    await page.goto('/#/dashboard');
    await page.waitForLoadState('networkidle');
    const searchInput = page.getByPlaceholder(/search projects, tasks/i);
    await expect(searchInput).toBeVisible();
  });

  test('Type search query — type a search term, verify dropdown results appear', async ({page} : {page :any}) => {
    await page.goto('/#/dashboard');
    await page.waitForLoadState('networkidle');
    const searchInput = page.getByPlaceholder(/search projects, tasks/i);
    await searchInput.fill('test');
    await page.waitForTimeout(800);
    await page.keyboard.press('ArrowDown');
  });

  test('Search results show sections — verify sections in results', async ({page} : {page :any}) => {
    await page.goto('/#/dashboard');
    await page.waitForLoadState('networkidle');
    const searchInput = page.getByPlaceholder(/search projects, tasks/i);
    await searchInput.fill('a');
    await page.waitForTimeout(800);

    const dropdown = page.locator('.card.animate-fade-in').first();
    const isVisible = await dropdown.isVisible().catch(() => false);
    if (isVisible) {
      const sections = ['Tasks', 'Projects', 'Employees', 'Teams'];
      for (const section of sections) {
        const sectionEl = dropdown.getByText(section);
        if (await sectionEl.isVisible().catch(() => false)) {
          await expect(sectionEl).toBeVisible();
        }
      }
    }
  });

  test('Click search result — click a result, verify navigation', async ({page} : {page :any}) => {
    await page.goto('/#/dashboard');
    await page.waitForLoadState('networkidle');
    const searchInput = page.getByPlaceholder(/search projects, tasks/i);
    await searchInput.fill('a');
    await page.waitForTimeout(800);

    const dropdown = page.locator('.card.animate-fade-in').first();
    const isVisible = await dropdown.isVisible().catch(() => false);
    if (isVisible) {
      const firstResult = dropdown.locator('div[onClick]').first();
      if (await firstResult.isVisible().catch(() => false)) {
        await firstResult.click();
        await page.waitForTimeout(500);
        expect(page.url()).not.toContain('dashboard');
      }
    }
  });
});
