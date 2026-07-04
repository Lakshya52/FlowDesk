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
  
  const ts = Date.now();
  const title = 'E2E Create Project ' + ts;
  await page.goto('http://localhost:5173/#/assignments');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  
  await page.getByRole('button', { name: /new project/i }).click({ force: true });
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Project title').fill(title);
  await page.getByPlaceholder('Search or enter company name').fill('Client ' + ts);
  await page.waitForTimeout(300);
  const addNew = page.getByText(/Add.*as new company/);
  if (await addNew.isVisible().catch(() => false)) {
    await addNew.click();
    await page.waitForTimeout(500);
  }
  await page.getByPlaceholder('Description...').fill('Description');
  const ps = page.locator('select').filter({ has: page.locator('option[value="high"]') });
  await ps.first().selectOption('high');
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill('2026-07-01');
  await dates.nth(1).fill('2026-08-01');
  await page.getByRole('button', { name: /create project/i }).click();
  await page.waitForURL(/\/assignments\//, { timeout: 10000 });
  await page.waitForTimeout(2000);
  
  console.log('URL:', page.url());
  const headings = await page.locator('h1, h2, h3, h4').evaluateAll((els) => els.map((el) => ({ tag: el.tagName, text: el.textContent })));
  console.log('Headings:', JSON.stringify(headings, null, 2));
  
  // Check all elements with large text
  const largeTexts = await page.locator('[style*="font-size"], [style*="fontWeight"], h1, h2, h3').evaluateAll((els) => els.map((el) => ({ tag: el.tagName, text: el.textContent.substring(0, 100), fontSize: el.style.fontSize })));
  console.log('Styled texts:', JSON.stringify(largeTexts, null, 2));
  
  await browser.close();
})();
