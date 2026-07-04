const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/#/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('name@company.com').fill('testadmin@flowdesk.com');
  await page.getByPlaceholder('Enter your password').fill('Test@123456');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/#\/(dashboard|assignments|tasks)/);
  await page.goto('http://localhost:5173/#/assignments');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /new project/i }).first().click({ force: true });
  await page.waitForTimeout(1000);
  
  // Fill title
  await page.getByPlaceholder('Project title').fill('Debug Test ' + Date.now());
  // Fill client
  await page.getByPlaceholder('Search or enter company name').fill('Debug Client');
  // Fill description
  await page.getByPlaceholder('Description...').fill('Debug description');
  
  // Try filtering approach for priority select
  const filteredPriority = page.locator('select').filter({ has: page.locator('option[value="high"]') });
  const count = await filteredPriority.count();
  console.log('Filtered priority selects count:', count);
  if (count > 0) {
    await filteredPriority.first().selectOption('high');
    console.log('Priority set to high via filter');
  }
  
  // Fill dates
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-07-01');
  console.log('Start date filled');
  await dateInputs.nth(1).fill('2026-08-01');
  console.log('Due date filled');
  
  // Submit
  await page.getByRole('button', { name: /create project/i }).click();
  await page.waitForTimeout(3000);
  console.log('URL after submit:', page.url());
  
  await browser.close();
})();
