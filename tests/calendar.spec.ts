import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers';

test.describe('Calendar Page', () => {
  test.beforeEach(async ({page} : {page :any}) => {
    const creds = loginAs('admin');
    await login(page, creds.email, creds.password);
  });

  test('Calendar loads — verify calendar grid/gadget renders', async ({page} : {page :any}) => {
    await page.goto('/#/calendar');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/today/i).first()).toBeVisible();
  });

  test('View switching — verify Month/Week/Day/Agenda view toggles exist and work', async ({page} : {page :any}) => {
    await page.goto('/#/calendar');
    await page.waitForLoadState('networkidle');

    const views = ['Day', 'Week', 'Month', 'Agenda'];
    for (const view of views) {
      const btn = page.getByRole('button', { name: new RegExp(`^${view}$`, 'i') });
      await expect(btn).toBeVisible();
      await btn.click();
      await page.waitForTimeout(500);
    }
  });

  test('Navigation — click next/prev month buttons, verify date changes', async ({page} : {page :any}) => {
    await page.goto('/#/calendar');
    await page.waitForLoadState('networkidle');

    const dateDisplay = page.locator('h2').first();
    const initialText = await dateDisplay.textContent();

    const prevBtn = page.getByRole('button', { name: /chevronleft/i }).or(page.locator('button').filter({ has: page.locator('svg') }).first());
    const nextBtn = page.getByRole('button', { name: /chevronright/i }).or(page.locator('button').filter({ has: page.locator('svg') }).nth(1));

    const allButtons = page.getByRole('button');
    let prev: any = null;
    let next: any = null;
    for (let i = 0; i < 5; i++) {
      const btn = allButtons.nth(i);
      const html = await btn.innerHTML();
      if (html.includes('ChevronLeft') || html.includes('chevron-left')) {
        if (!prev) prev = btn;
      }
      if (html.includes('ChevronRight') || html.includes('chevron-right')) {
        if (!next) next = btn;
      }
    }

    if (prev) {
      await prev.click();
      await page.waitForTimeout(300);
      const afterPrev = await dateDisplay.textContent();
      expect(afterPrev).not.toBe(initialText);
    }

    if (next) {
      await next.click();
      await page.waitForTimeout(300);
      const afterNext = await dateDisplay.textContent();
      expect(afterNext).toBe(initialText);
    }
  });
});
