import { Page, expect } from '@playwright/test';

export const TEST_EMAIL = 'lakshya0425@gmail.com';
export const TEST_PASSWORD = 'L!ak2shya';

export const login = async (page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) => {
  await page.goto('/#/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('name@company.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/#\/(dashboard|assignments|tasks|teams|clients)/);
};

export const loginAs = (role: 'admin' | 'manager' | 'member') => {
  const creds: Record<string, { email: string; password: string }> = {
    admin: { email: process.env.TEST_ADMIN_EMAIL || 'testadmin@flowdesk.com', password: process.env.TEST_ADMIN_PASSWORD || 'Test@123456' },
    manager: { email: process.env.TEST_MANAGER_EMAIL || 'testmanager@flowdesk.com', password: process.env.TEST_MANAGER_PASSWORD || 'Test@123456' },
    member: { email: process.env.TEST_MEMBER_EMAIL || 'testmember@flowdesk.com', password: process.env.TEST_MEMBER_PASSWORD || 'Test@123456' },
  };
  return creds[role];
};

export const navigateTo = async (page: Page, route: string) => {
  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
};

export const createAssignment = async (page: Page, data: {
  title: string;
  clientName?: string;
  description?: string;
  priority?: string;
  startDate?: string;
  dueDate?: string;
}) => {
  await page.goto('/#/assignments');
  await page.waitForLoadState('networkidle');
  // Directly open the create dialog via page.evaluate — this bypasses overlay issues
  await page.evaluate(() => {
    // Click all buttons with "New Project" text via DOM API (bypasses React event delegation issues)
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.includes('New Project')) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        break;
      }
    }
  });
  await page.waitForTimeout(1000);
  // Ensure the dialog is fully rendered before filling
  await page.getByPlaceholder('Project title').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  await page.getByPlaceholder('Project title').fill(data.title);

  // Fill all fields BEFORE clicking any submit/confirm button.
  // The "Add as new company" dropdown option triggers handleAddCompany(true)
  // which creates the project immediately — so we fill everything first,
  // then submit via the main "Create Project" button, and handle the
  // company-not-found confirmation dialog that follows.

  if (data.clientName) {
    const clientInput = page.getByPlaceholder('Search or enter company name');
    if (await clientInput.isVisible()) {
      await clientInput.fill(data.clientName);
      await page.waitForTimeout(300);
    }
  }
  if (data.description) {
    const descInput = page.getByPlaceholder('Description...');
    if (await descInput.isVisible()) {
      await descInput.fill(data.description);
    }
  }
  if (data.priority) {
    const prioritySelect = page.locator('select').filter({ has: page.locator(`option[value="${data.priority}"]`) }).first();
    if (await prioritySelect.isVisible().catch(() => false)) {
      await prioritySelect.selectOption(data.priority);
    }
  }
  if (data.startDate) {
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(data.startDate);
  }
  if (data.dueDate) {
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(1).fill(data.dueDate);
  }

  // Submit the form — use force:true in case a backdrop/overlay is present
  await page.getByRole('button', { name: /create project/i }).click({ force: true });
  await page.waitForTimeout(500);

  // If company confirmation dialog appears, confirm it
  const confirmBtn = page.getByRole('button', { name: /yes, create and continue/i });
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  // Wait for navigation to detail page (hashes like #/assignments/<id>)
  const currentHash = new URL(page.url()).hash;
  await page.waitForFunction(
    (oldHash) => window.location.hash !== oldHash && window.location.hash.startsWith('#/assignments/') && window.location.hash.length > '#/assignments/'.length + 5,
    currentHash,
    { timeout: 15000 },
  ).catch(() => {});
};

export const createTask = async (page: Page, data: {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
}) => {
  await page.goto('/#/tasks');
  await page.waitForLoadState('networkidle');
  const createBtn = page.getByRole('button', { name: /create.*task|new.*task|add.*task/i }).first();
  if (await createBtn.isVisible()) {
    await createBtn.click();
    await page.waitForTimeout(500);
  }
  await page.getByPlaceholder('e.g. Design landing page').fill(data.title);
  if (data.description) {
    const descInput = page.getByPlaceholder('Task details...');
    if (await descInput.isVisible()) {
      await descInput.fill(data.description);
    }
  }
  if (data.priority) {
    const prioritySelect = page.locator('select').filter({ has: page.locator(`option[value="${data.priority}"]`) }).first();
    if (await prioritySelect.isVisible().catch(() => false)) {
      await prioritySelect.selectOption(data.priority);
    }
  }
  if (data.dueDate) {
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill(data.dueDate);
    }
  }
  const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /create task/i }).first();
  if (await submitBtn.isVisible()) {
    await submitBtn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(1000);
  }
};

export const createTeam = async (page: Page, name: string, description?: string) => {
  await page.goto('/#/teams');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /create.*team|new.*team|add.*team/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Engineering, Finance, Design...').fill(name);
  if (description) {
    const descInput = page.getByPlaceholder('What does this team focus on?');
    if (await descInput.isVisible()) {
      await descInput.fill(description);
    }
  }
  await page.getByRole('button', { name: /create team/i }).click();
  await page.waitForTimeout(1000);
};

export const createCompany = async (page: Page, name: string, industry?: string) => {
  await page.goto('/#/clients');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /create.*compan|add.*compan|new.*compan/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Enter company name').fill(name);
  if (industry) {
    const indInput = page.getByPlaceholder('e.g., Technology, Healthcare');
    if (await indInput.isVisible()) {
      await indInput.fill(industry);
    }
  }
  await page.getByRole('button', { name: /create company/i }).click();
  await page.waitForTimeout(1000);
};
