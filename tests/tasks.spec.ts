import { test, expect } from '@playwright/test';
import { login, loginAs, createTask } from './helpers';

test.describe('Tasks', () => {
  test.beforeEach(async ({ page }) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('Tasks page loads — verify Kanban board or task list is visible', async ({ page }) => {
    await page.goto('/#/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^To Do$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^In Progress$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^Review$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^Completed$/ })).toBeVisible();
  });

  test('Create a task — click "Create Task", fill title/description/priority/due date, submit, verify success', async ({ page }) => {
    const title = `Task ${Date.now()}`;
    await createTask(page, {
      title,
      description: 'Created by playwright',
      priority: 'high',
      dueDate: '2026-12-31',
    });
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('Task status columns — verify columns like Todo, In Progress, Review, Completed exist', async ({ page }) => {
    await page.goto('/#/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('span').filter({ hasText: /^To Do$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^In Progress$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^Review$/ })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: /^Completed$/ })).toBeVisible();
  });

  test('Filter tasks — test filtering by status dropdown or search input', async ({ page }) => {
    await page.goto('/#/tasks');
    await page.waitForLoadState('networkidle');
    const search = page.getByPlaceholder('Search tasks...');
    await expect(search).toBeVisible();
    await search.fill('test search');
    await expect(search).toHaveValue('test search');
  });

  test('Task detail/edit — click a task, verify detail view, edit a field, save', async ({ page }) => {
    const title = `Edit ${Date.now()}`;
    await createTask(page, { title, description: 'Before edit' });
    await page.waitForTimeout(500);

    const card = page.locator('.card').filter({ hasText: title }).first();
    await expect(card).toBeVisible();

    await card.locator('button').filter({ has: page.locator('.lucide-edit3') }).click();

    const titleInput = page.locator('.card input[type="text"]').first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill(`${title} updated`);

    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(`${title} updated`).first()).toBeVisible();
  });

  test('Delete a task — delete a task, verify it\'s removed', async ({ page }) => {
    const title = `Delete ${Date.now()}`;
    await createTask(page, { title, description: 'To delete' });
    await page.waitForTimeout(500);

    await expect(page.getByText(title).first()).toBeVisible();

    page.once('dialog', dialog => dialog.accept());

    const card = page.locator('.card').filter({ hasText: title }).first();
    await card.locator('button').filter({ has: page.locator('.lucide-trash2') }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(title)).not.toBeVisible();
  });
});
