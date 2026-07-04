import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('sidebar navigation items are visible', async ({ page }) => {
    const sidebar = page.locator('aside nav');

    const navLabels = [
      'Dashboard',
      'CRM',
      'Projects',
      'Our Teams',
      'Canvas',
      'Calendar',
      'Companies & Clients',
      'Chat',
      'Bulk Messaging',
      'Reports',
      'Settings',
    ];

    for (const label of navLabels) {
      await expect(sidebar.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('click each nav item navigates correctly', async ({ page }) => {
    const sidebar = page.locator('aside nav');

    const clickNav = async (href: string) => {
      await page.locator(`a[href="${href}"]`).click();
    };

    const expandParent = async (label: string) => {
      await sidebar.getByText(label, { exact: true }).first().click();
    };

    // Dashboard
    await page.locator('a[href="#/dashboard"]').click();
    await expect(page).toHaveURL(/#\/dashboard$/);

    // CRM -> expand parent, click Dashboard sub-item
    await expandParent('CRM');
    await clickNav('#/crm/dashboard');
    await expect(page).toHaveURL(/\/crm\/dashboard/);

    // Projects -> expand parent, click Projects sub-item
    await expandParent('Projects');
    await clickNav('#/assignments');
    await expect(page).toHaveURL(/#\/assignments$/);

    // Kanban Board (sub-item under Projects)
    await clickNav('#/tasks');
    await expect(page).toHaveURL(/#\/tasks$/);

    // Our Teams
    await clickNav('#/teams');
    await expect(page).toHaveURL(/#\/teams$/);

    // Canvas
    await clickNav('#/canvas');
    await expect(page).toHaveURL(/#\/canvas$/);

    // Calendar
    await clickNav('#/calendar');
    await expect(page).toHaveURL(/#\/calendar$/);

    // Companies & Clients
    await clickNav('#/clients');
    await expect(page).toHaveURL(/#\/clients$/);

    // Chat
    await clickNav('#/chat');
    await expect(page).toHaveURL(/#\/chat$/);

    // Bulk Messaging
    await clickNav('#/bulk-email');
    await expect(page).toHaveURL(/#\/bulk-email$/);

    // Reports -> expand parent, click Tracking sub-item
    await expandParent('Reports');
    await clickNav('#/reports/employee');
    await expect(page).toHaveURL(/#\/reports\/employee/);

    // Settings
    await clickNav('#/settings');
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('active nav item is highlighted', async ({ page }) => {
    const sidebar = page.locator('aside nav');

    // Dashboard
    await page.locator('a[href="#/dashboard"]').click();
    await expect(page.locator('a[href="#/dashboard"]')).toHaveClass(/active/);

    // Our Teams
    await page.locator('a[href="#/teams"]').click();
    await expect(page.locator('a[href="#/teams"]')).toHaveClass(/active/);

    // Canvas
    await page.locator('a[href="#/canvas"]').click();
    await expect(page.locator('a[href="#/canvas"]')).toHaveClass(/active/);

    // Calendar
    await page.locator('a[href="#/calendar"]').click();
    await expect(page.locator('a[href="#/calendar"]')).toHaveClass(/active/);

    // Companies & Clients
    await page.locator('a[href="#/clients"]').click();
    await expect(page.locator('a[href="#/clients"]')).toHaveClass(/active/);

    // Chat
    await page.locator('a[href="#/chat"]').click();
    await expect(page.locator('a[href="#/chat"]')).toHaveClass(/active/);

    // Bulk Messaging
    await page.locator('a[href="#/bulk-email"]').click();
    await expect(page.locator('a[href="#/bulk-email"]')).toHaveClass(/active/);

    // Settings
    await page.locator('a[href="#/settings"]').click();
    await expect(page.locator('a[href="#/settings"]')).toHaveClass(/active/);

    // Kanban Board sub-item under Projects
    await sidebar.getByText('Projects', { exact: true }).first().click();
    await page.locator('a[href="#/tasks"]').click();
    await expect(page.locator('a[href="#/tasks"]')).toHaveClass(/active/);

    // CRM Dashboard sub-item
    await sidebar.getByText('CRM', { exact: true }).first().click();
    await page.locator('a[href="#/crm/dashboard"]').click();
    await expect(page.locator('a[href="#/crm/dashboard"]')).toHaveClass(/active/);

    // Reports Tracking sub-item
    await sidebar.getByText('Reports', { exact: true }).first().click();
    await page.locator('a[href="#/reports/employee"]').click();
    await expect(page.locator('a[href="#/reports/employee"]')).toHaveClass(/active/);
  });

  test('header elements visible', async ({ page }) => {
    // Global search input
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();

    // Theme toggle button
    const themeToggle = page.getByTitle('Toggle theme');
    await expect(themeToggle).toBeVisible();

    // Notification bell icon
    const bellIcon = page.locator('header .lucide-bell');
    await expect(bellIcon).toBeVisible();

    // User avatar and role label
    const roleLabel = page.locator('header').getByText('Admin').first();
    await expect(roleLabel).toBeVisible();

    // User avatar element (renders as a div with title attribute)
    const avatar = page.locator('header [title]').first();
    await expect(avatar).toBeVisible();
  });
});
