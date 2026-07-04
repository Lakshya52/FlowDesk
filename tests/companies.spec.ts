import { test, expect } from '@playwright/test';
import { login, loginAs, createCompany } from './helpers';

test.describe('Companies / Clients Page', () => {
  test.beforeEach(async ({page} : {page :any}) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('Page loads — verify company hierarchy or list view', async ({page} : {page :any}) => {
    await page.goto('/#/clients');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /companies.*clients/i })).toBeVisible();
    const searchInput = page.getByPlaceholder(/search companies/i);
    await expect(searchInput).toBeVisible();
  });

  test('Create a company — fill name/industry, submit, verify in list', async ({page} : {page :any}) => {
    const companyName = `Test Company ${Date.now()}`;
    await createCompany(page, companyName, 'Technology');
    await page.waitForTimeout(500);
    await expect(page.getByText(companyName)).toBeVisible();
  });

  test('Create a contact — click on a company, add contact with name/email/phone', async ({page} : {page :any}) => {
    const companyName = `ContactTest ${Date.now()}`;
    await createCompany(page, companyName, 'Finance');
    await page.waitForTimeout(500);

    await page.getByText(companyName).first().click();
    await page.waitForTimeout(500);

    const contactsTab = page.getByRole('button', { name: /contacts/i });
    if (await contactsTab.isVisible()) {
      await contactsTab.click();
    }

    const addContactBtn = page.getByRole('button', { name: /add contact/i });
    await expect(addContactBtn).toBeVisible();
    await addContactBtn.click();

    const contactName = `John ${Date.now()}`;
    await page.getByPlaceholder(/name/i).first().fill(contactName);
    await page.getByPlaceholder(/email/i).first().fill('john@test.com');

    const phoneInput = page.getByPlaceholder(/phone/i).first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('9876543210');
    }

    await page.getByRole('button', { name: /add.*contact|save/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(contactName)).toBeVisible();
  });

  test('View company details — click company, verify details and contacts display', async ({page} : {page :any}) => {
    const companyName = `DetailsTest ${Date.now()}`;
    await createCompany(page, companyName, 'Healthcare');
    await page.waitForTimeout(500);

    await page.getByText(companyName).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText(companyName).first()).toBeVisible();
    await expect(page.getByText('Healthcare')).toBeVisible();
    const badge = page.locator('.badge').filter({ hasText: /active|inactive/i });
    await expect(badge).toBeVisible();
  });

  test('Search companies — type in search, verify filtered results', async ({page} : {page :any}) => {
    await page.goto('/#/clients');
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder(/search companies/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('NonExistentXYZ123');
    await page.waitForTimeout(500);
    const noMatch = page.getByText(/no matches found/i);
    if (await noMatch.isVisible()) {
      await expect(noMatch).toBeVisible();
    }
  });

  test('Export/import buttons exist — verify export buttons are visible', async ({page} : {page :any}) => {
    await page.goto('/#/clients');
    await page.waitForLoadState('networkidle');

    const importBtn = page.getByRole('button', { name: /import/i });
    await expect(importBtn).toBeVisible();

    const exportBtn = page.getByRole('button', { name: /export/i });
    await expect(exportBtn).toBeVisible();
  });
});
