import { test, expect } from '@playwright/test';
import { login, loginAs, createAssignment } from './helpers';

test.describe('Assignments / Projects', () => {
  test.beforeEach(async ({ page }) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('1. Assignments page loads', async ({ page }) => {
    await page.goto('/#/assignments');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('button', { name: /new project/i })).toBeVisible();
  });

  test('2. Create a new project', async ({ page }) => {
    const ts = Date.now();
    const title = `E2E Create Project ${ts}`;
    await createAssignment(page, {
      title,
      clientName: `E2E Client ${ts}`,
      description: 'Project created by Playwright e2e test',
      priority: 'high',
      startDate: '2026-07-01',
      dueDate: '2026-08-01',
    });
    await expect(page).toHaveURL(/\/assignments\//);
    await expect(page.getByRole('heading', { name: new RegExp(title, 'i') })).toBeVisible();
  });

  test('3. Project filtering by search', async ({ page }) => {
    const ts = Date.now();
    await createAssignment(page, { title: `Filter First ${ts}`, clientName: `Client A ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-01' });
    await page.goto('/#/assignments');
    await page.waitForLoadState('networkidle');
    await createAssignment(page, { title: `Filter Second ${ts}`, clientName: `Client B ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-15' });
    await page.goto('/#/assignments');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Search projects...').fill(`Filter First ${ts}`);
    await page.waitForTimeout(500);
    await expect(page.getByText(`Filter First ${ts}`)).toBeVisible();
    await expect(page.getByText(`Filter Second ${ts}`)).not.toBeVisible();
  });

  test('4. Click a project card navigates to detail', async ({ page }) => {
    const ts = Date.now();
    const title = `Card Click ${ts}`;
    await createAssignment(page, { title, clientName: `Card Client ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-01' });
    await page.goto('/#/assignments');
    await page.waitForLoadState('networkidle');
    await page.locator('.card').filter({ hasText: title }).first().click();
    await expect(page).toHaveURL(/\/assignments\//);
    await expect(page.getByRole('heading', { name: new RegExp(title, 'i') })).toBeVisible();
  });

  test('5. Project detail page tabs render', async ({ page }) => {
    const ts = Date.now();
    await createAssignment(page, { title: `Tab Check ${ts}`, clientName: `Tab Client ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-01' });
    await expect(page.getByRole('button', { name: /tasks/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /chat/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /files/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /whiteboard/i }).first()).toBeVisible();
  });

  test('6. Edit project from detail page', async ({ page }) => {
    const ts = Date.now();
    const originalTitle = `Edit Original ${ts}`;
    const updatedTitle = `Edit Updated ${ts}`;
    await createAssignment(page, { title: originalTitle, clientName: `Edit Client ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-01' });
    await page.getByTitle('Edit Project Details').click();
    await page.getByPlaceholder('Project Title').clear();
    await page.getByPlaceholder('Project Title').fill(updatedTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: new RegExp(updatedTitle, 'i') })).toBeVisible();
  });

  test('7. Create task within project', async ({ page }) => {
    const ts = Date.now();
    const taskTitle = `Task Item ${ts}`;
    await createAssignment(page, { title: `Task Proj ${ts}`, clientName: `Task Client ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-01' });
    await page.getByRole('button', { name: /tasks/i }).first().click();
    await page.getByRole('button', { name: /add task/i }).click();
    await page.getByPlaceholder('Enter task title').fill(taskTitle);
    await page.getByPlaceholder('Enter task description...').fill('Task created by Playwright e2e test');
    const selects = page.locator('form select');
    if (await selects.count() > 0) {
      const firstSelect = selects.first();
      const opts = await firstSelect.locator('option').count();
      if (opts > 1) await firstSelect.selectOption({ index: 1 });
    }
    const dateInput = page.locator('form input[type="date"]');
    if (await dateInput.isVisible()) {
      await dateInput.fill('2026-08-15');
    }
    await page.getByRole('button', { name: /create task/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  test('8. Delete project', async ({ page }) => {
    const ts = Date.now();
    const title = `Delete Me ${ts}`;
    await createAssignment(page, { title, clientName: `Del Client ${ts}`, startDate: '2026-07-01', dueDate: '2026-08-01' });
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTitle('Delete Project').click();
    await expect(page).toHaveURL(/\/assignments$/);
    await expect(page.getByText(title)).not.toBeVisible();
  });
});
