import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const API = 'https://three-mountaintops-engine.onrender.com';
const token = 'a'.repeat(64);
const open = { label: 'Website repair - booking and follow-up workflow', amount: 1250.50, status: 'open' };
test.beforeEach(async ({ page }) => {
  await page.route(API + '/**', route => route.abort());
  await page.route('https://app.cal.com/**', route => route.fulfill({ body: '' }));
  await page.route('https://js.stripe.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `window.Stripe = function () { return { initEmbeddedCheckout: async function (options) {
    window.finishPayment = options.onComplete; return { mount: function (selector) { document.querySelector(selector).textContent = 'Secure payment fixture'; }, destroy: function () { document.getElementById('payment-checkout').textContent = ''; } };
  } }; };` }));
});

for (const width of [360, 1440]) {
  test('approved checkout fits and confirms authoritative payment at ' + width, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [], payloads = [];
    page.on('pageerror', error => errors.push(error.message));
    let state = 'open';
    await page.route(API + '/api/understudy/checkout', route => {
      const body = route.request().postDataJSON(); payloads.push(body);
      return route.fulfill({ json: { ...open, status: state, ...(body.viewOnly ? {} : { clientSecret: 'fixture_secret', sessionId: 'cs_test_fixture' }) } });
    });
    await page.goto('/pay.html#' + token);
    await expect(page.locator('#service-amount')).toHaveText('$1,250.50');
    await expect(page.locator('#payment-start')).toBeVisible();
    expect(await page.locator('.brand-mark').evaluate(node => node.complete && node.naturalWidth > 0)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('approved-payment.png'), fullPage: true });
    await page.locator('#payment-start').click();
    await expect(page.locator('#payment-checkout')).toHaveText('Secure payment fixture');
    state = 'processing';
    await page.evaluate(() => window.finishPayment());
    await expect(page.locator('#payment-status')).toContainText('not yet confirmed');
    await expect(page.locator('#payment-start')).toBeHidden();
    state = 'paid';
    await page.locator('#payment-retry').click();
    await expect(page.locator('#payment-status')).toContainText('Payment received');
    await expect(page.locator('#payment-start')).toBeHidden();
    await page.reload();
    await expect(page.locator('#payment-status')).toContainText('Please do not pay again');
    expect(payloads.every(body => body.token === token && !('amount' in body) && !('email' in body))).toBeTruthy();
    expect(payloads.filter(body => !body.viewOnly)).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}
test('missing, expired or unreachable payment links never start payment', async ({ page }) => {
  let called = 0;
  await page.route(API + '/api/understudy/checkout', route => { called++; return route.fulfill({ status: 400, json: { error: 'This payment link has expired.' } }); });
  await page.goto('/pay.html');
  await expect(page.locator('#payment-status')).toContainText('personal payment link');
  expect(called).toBe(0);
  await page.goto('/pay.html#' + token);
  await expect(page.locator('#payment-status')).toContainText('expired');
  await expect(page.locator('#payment-start')).toBeHidden();
  await page.route(API + '/api/understudy/checkout', route => route.abort());
  await page.locator('#payment-retry').click();
  await expect(page.locator('#payment-status')).toContainText('could not confirm');
  await expect(page.locator('#payment-start')).toBeHidden();
});
test('inquiry retries retain the same request token and show the saved reference', async ({ page }) => {
  const bodies = [];
  await page.route(API + '/api/understudy/lead', route => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1 ? route.abort() : route.fulfill({ json: { ok: true, reference: 'lead_fixture' } });
  });
  await page.goto('/index.html#contact');
  await page.locator('#contact-name').fill('Test owner');
  await page.locator('#contact-email').fill('test@example.invalid');
  await page.locator('#contact-business').fill('A test inquiry.');
  await page.locator('#contact-send').click();
  await expect(page.locator('#contact-status')).toContainText('could not confirm');
  await page.locator('#contact-send').click();
  await expect(page.locator('#contact-status')).toContainText('lead_fixture');
  expect(bodies[0].requestId).toBe(bodies[1].requestId);
  expect(bodies[0].requestId).toHaveLength(36);
});

test('private dashboard shows failures rather than empty ledgers and creates approved links', async ({ page }, testInfo) => {
  const root = resolve(process.env.UNDERSTUDY_ENGINE_ROOT || resolve(import.meta.dirname, '../../../understudy-inquiries-checkout'), 'public') + '/';
  test.skip(!existsSync(root + 'understudy-admin.html'), 'Set UNDERSTUDY_ENGINE_ROOT to run the companion backend dashboard check.');
  await page.setViewportSize({ width: 360, height: 900 });
  await page.route('**/understudy-admin.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile(root + 'understudy-admin.html', 'utf8') }));
  await page.route('**/understudy-transactions-admin.js', async route => route.fulfill({ contentType: 'application/javascript', body: await readFile(root + 'understudy-transactions-admin.js', 'utf8') }));
  await page.route('**/api/understudy/**', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/understudy-admin.html');
  await expect(page.locator('#delivery-status')).toContainText('unavailable');
  await expect(page.locator('#inquiry-alerts')).toContainText('not an all-clear');
  await expect(page.locator('#payment-alert-title')).toContainText('unavailable');
  await expect(page.locator('#cards')).toContainText('Totals unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('admin-phone.png'), fullPage: true });
  let request;
  await page.route('**/api/understudy/payment-requests', route => {
    request = route.request().postDataJSON();
    return route.fulfill({ json: { ...open, url: 'https://understudy.consulting/pay.html#' + token, expiresAt: '2026-09-16T12:00:00.000Z' } });
  });
  await page.locator('#request-label').fill('Approved booking workflow');
  await page.locator('#request-amount').fill('1250.50');
  await page.locator('#request-agreed').check();
  await page.getByRole('button', { name: 'Create payment link' }).click();
  await expect(page.locator('#request-result a')).toHaveAttribute('href', 'https://understudy.consulting/pay.html#' + token);
  expect(request.amount).toBe('1250.50');
});
