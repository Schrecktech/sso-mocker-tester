import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ISSUER = process.env.OIDC_ISSUER || 'http://localhost:9090';
const ADMIN_URL = `${ISSUER}/admin/v1`;

test.describe('SSO Mocker OIDC Integration', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies for all domains (SPA + mocker)
    await context.clearCookies();
    // Clear SPA sessionStorage
    await page.goto(BASE_URL);
    await page.evaluate(() => sessionStorage.clear());
    // Navigate to mocker to clear its cookies from browser too
    await page.goto(`${ISSUER}/health`);
    // Reset mocker server state (sessions, tokens, users)
    await fetch(`${ADMIN_URL}/reset`, { method: 'POST' });
  });

  test('landing page shows unauthenticated state', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByTestId('app-title')).toHaveText('SSO Mocker Test App');
    await expect(page.getByTestId('status')).toContainText('Not authenticated');
    await expect(page.getByTestId('login-btn')).toBeVisible();

    await page.screenshot({ path: 'screenshots/01-landing-unauthenticated.png', fullPage: true });
  });

  test('full OIDC login flow with form mode', async ({ page }) => {
    // Switch mocker to form mode for this test
    await fetch(`${ADMIN_URL}/config/login`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'form' }),
    });

    await page.goto(BASE_URL);
    await page.screenshot({ path: 'screenshots/02-before-login.png', fullPage: true });

    // Click login
    await page.getByTestId('login-btn').click();

    // Should redirect to SSO Mocker login page
    await page.waitForURL('**/interaction/**');
    await page.screenshot({ path: 'screenshots/03-sso-mocker-login-form.png', fullPage: true });

    // Select Alice's radio button and sign in
    await page.getByTestId('user-alice').locator('input[type="radio"]').click();
    await page.getByTestId('sign-in').click();

    // Should redirect back to SPA with claims displayed
    await page.waitForURL(`${BASE_URL}/**`);
    await page.waitForSelector('[data-testid="user-name"]');
    await page.screenshot({ path: 'screenshots/04-authenticated-alice.png', fullPage: true });

    // Verify claims
    await expect(page.getByTestId('status')).toContainText('Authenticated as');
    await expect(page.getByTestId('user-name')).toHaveText('Alice Admin');
    await expect(page.getByTestId('claim-sub')).toHaveText('alice');
    await expect(page.getByTestId('claim-email')).toHaveText('alice@example.com');
    await expect(page.getByTestId('claim-role')).toHaveText('admin');
  });

  test('auto-login mode skips login form', async ({ page }) => {
    // Ensure mocker is in auto mode (default for integration)
    await fetch(`${ADMIN_URL}/config/login`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto', autoLoginUser: 'alice' }),
    });

    await page.goto(BASE_URL);
    await page.getByTestId('login-btn').click();

    // Auto-login should skip the form and return directly
    await page.waitForSelector('[data-testid="user-name"]');
    await page.screenshot({ path: 'screenshots/05-auto-login-alice.png', fullPage: true });

    await expect(page.getByTestId('user-name')).toHaveText('Alice Admin');
    await expect(page.getByTestId('claim-role')).toHaveText('admin');
  });

  test('switch users shows different claims', async ({ browser }) => {
    // Fresh browser context — no cookies from previous tests
    const context = await browser.newContext();
    const page = await context.newPage();

    // Reset server state and switch auto-login to Carol
    await fetch(`${ADMIN_URL}/reset`, { method: 'POST' });
    await fetch(`${ADMIN_URL}/config/login`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto', autoLoginUser: 'carol' }),
    });

    await page.goto(BASE_URL);
    await page.screenshot({ path: 'screenshots/06-before-carol-login.png', fullPage: true });

    await page.getByTestId('login-btn').click();
    await page.waitForSelector('[data-testid="user-name"]');
    await page.screenshot({ path: 'screenshots/07-authenticated-carol.png', fullPage: true });

    // Verify Carol's claims are different from Alice
    await expect(page.getByTestId('user-name')).toHaveText('Carol Viewer');
    await expect(page.getByTestId('claim-sub')).toHaveText('carol');
    await expect(page.getByTestId('claim-role')).toHaveText('viewer');

    await context.close();
  });

  test('logout returns to unauthenticated state', async ({ page }) => {
    // Auto-login first
    await fetch(`${ADMIN_URL}/config/login`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto', autoLoginUser: 'alice' }),
    });

    await page.goto(BASE_URL);
    await page.getByTestId('login-btn').click();
    await page.waitForSelector('[data-testid="user-name"]');

    // Now logout
    await page.getByTestId('logout-btn').click();
    await page.waitForSelector('[data-testid="login-btn"]');
    await page.screenshot({ path: 'screenshots/08-after-logout.png', fullPage: true });

    await expect(page.getByTestId('status')).toContainText('Not authenticated');
  });
});
