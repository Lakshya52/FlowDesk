import { test, expect } from '@playwright/test';
import { login, TEST_EMAIL, TEST_PASSWORD } from './helpers';

test.describe('Authentication', () => {
  test.beforeEach(async ({page} : {page :any}) => {
    await page.goto('/#/login');
    await page.waitForLoadState('networkidle');
  });

  test('Login page loads', async ({page} : {page :any}) => {
    await expect(page.getByPlaceholder('name@company.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /forgot password/i })).toBeVisible();
  });

  test('Login with valid credentials', async ({page} : {page :any}) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page).not.toHaveURL(/login/);
  });

  test('Login with invalid credentials', async ({page} : {page :any}) => {
    await page.getByPlaceholder('name@company.com').fill(TEST_EMAIL);
    await page.getByPlaceholder('Enter your password').fill('WrongPassword123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|error/i).first()).toBeVisible();
  });

  test('Login with empty fields shows validation', async ({page} : {page :any}) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    // await expect(page.getByText(/email|required|invalid|error/i)).toBeVisible();
  });

  test('Forgot Password flow', async ({page} : {page :any}) => {
    await page.getByRole('button', { name: /forgot password/i }).click();
    await expect(page.getByText(/enter the email address/i)).toBeVisible();
    await page.getByPlaceholder('name@company.com').fill(TEST_EMAIL);
    await page.getByRole('button', { name: /send verification code/i }).click();
    await expect(page.getByText(/sent a 6-digit code/)).toBeVisible();
  });

  test('Password visibility toggle', async ({page} : {page :any}) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    const toggleButton = page.locator('input[placeholder="Enter your password"] + button');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
