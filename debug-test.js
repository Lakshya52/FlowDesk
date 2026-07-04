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
  const selectCount = await page.locator('select').count();
  console.log('selects:', selectCount);
  for (let i=0; i<selectCount; i++) {
    const vals = await page.locator('select').nth(i).locator('option').evaluateAll((opts) => opts.map((o) => o.value));
    console.log('s'+i+':', JSON.stringify(vals));
  }
  console.log('dates:', await page.locator('input[type="date"]').count());
  await browser.close();
})();
