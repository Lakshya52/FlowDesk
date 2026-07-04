const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Login
  await page.goto('http://localhost:5173/#/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('name@company.com').fill('testadmin@flowdesk.com');
  await page.getByPlaceholder('Enter your password').fill('Test@123456');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/#\/(dashboard|assignments|tasks)/);
  
  // Go to assignments
  await page.goto('http://localhost:5173/#/assignments');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Click New Project
  await page.getByRole('button', { name: /new project/i }).first().click({ force: true });
  await page.waitForTimeout(1000);
  
  // Fill title
  const ts = Date.now();
  await page.getByPlaceholder('Project title').fill('Debug Test ' + ts);
  
  // Fill client - this creates a new company
  await page.getByPlaceholder('Search or enter company name').fill('Debug Client ' + ts);
  await page.waitForTimeout(300);
  
  // Click "Add as new company" dropdown option
  const addNew = page.getByText(/Add.*as new company/);
  const addNewVisible = await addNew.isVisible().catch(() => false);
  console.log('Add as new company visible:', addNewVisible);
  if (addNewVisible) {
    await addNew.click();
    console.log('Clicked add as new company');
    await page.waitForTimeout(1000);
  }
  
  // Fill description
  await page.getByPlaceholder('Description...').fill('Debug description');
  
  // Set priority
  const prioritySelect = page.locator('select').filter({ has: page.locator('option[value="high"]') }).first();
  await prioritySelect.selectOption('high');
  console.log('Priority set');
  
  // Fill dates
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-07-01');
  await dateInputs.nth(1).fill('2026-08-01');
  console.log('Dates filled');
  
  // Submit - click Create Project
  const createBtn = page.getByRole('button', { name: /create project/i });
  const createBtnText = await createBtn.textContent();
  console.log('Create button text:', createBtnText);
  await createBtn.click();
  console.log('Clicked Create Project');
  
  await page.waitForTimeout(1000);
  console.log('URL after 1s:', page.url());
  
  // Check if confirmation dialog appeared
  const confirmBtn = page.getByRole('button', { name: /yes, create and continue/i });
  const confirmVisible = await confirmBtn.isVisible().catch(() => false);
  console.log('Confirm button visible:', confirmVisible);
  if (confirmVisible) {
    await confirmBtn.click();
    console.log('Clicked confirm');
    await page.waitForTimeout(3000);
    console.log('URL after confirm:', page.url());
  }
  
  // Check if page shows an alert/error
  const bodyText = await page.locator('body').innerText();
  if (bodyText.includes('error') || bodyText.includes('Error')) {
    console.log('Error found in page');
  }
  console.log('URL at end:', page.url());
  
  await browser.close();
})();
