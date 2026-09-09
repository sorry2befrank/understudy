import { test, expect } from '@playwright/test';

const pages = ['/business-automation-atlanta.html', '/website-development-atlanta.html'];
test.beforeEach(async ({ page }) => {
  await page.route('https://js.stripe.com/**', route => route.fulfill({ body: '' }));
  await page.route('https://three-mountaintops-engine.onrender.com/**', route => route.abort());
  await page.route('https://app.cal.com/**', route => route.fulfill({ body: '' }));
});

for (const width of [360, 768, 1440]) {
  for (const path of pages) {
    test(`${path} is readable and interactive at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('body')).toContainText('Atlanta');
      await expect(page.locator('#workflows, #deliverables').first()).toBeAttached();
      const images = await page.locator('img').evaluateAll(async images => {
        await Promise.all(images.map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); }));
        return images.map(img => ({ src: img.getAttribute('src'), loaded: img.naturalWidth > 0 }));
      });
      expect(images.every(img => img.loaded), JSON.stringify(images)).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const clipped = await page.locator('h1,h2,h3,.btn').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 2).map(n => n.textContent));
      expect(clipped).toEqual([]);
      await page.locator('details summary').first().click();
      await expect(page.locator('details').first()).toHaveAttribute('open', '');
      await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('light.png'), fullPage: true });
      await page.locator('#theme-toggle').click();
      if (width < 761) {
        await page.locator('.nav-menu-toggle').click();
        await expect(page.locator('.nav-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Escape');
        await expect(page.locator('.nav-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('dark.png'), fullPage: true });
      await page.screenshot({ path: testInfo.outputPath('first-screen.png') });
      expect(errors).toEqual([]);
    });
  }
}

test('homepage local services and inquiry form fit a phone screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText('Atlanta');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('home-phone.png') });
  await page.locator('#contact-name').scrollIntoViewIfNeeded();
  await expect(page.locator('#contact-send')).toBeEnabled();
  await expect(page.locator('#contact-form')).toHaveCSS('opacity', '1');
  const clipped = await page.locator('#contact input, #contact button').evaluateAll(nodes => nodes.filter(n => {
    const box = n.getBoundingClientRect();
    return box.left < 0 || box.right > innerWidth || n.scrollWidth > n.clientWidth + 2;
  }).map(n => n.id));
  expect(clipped).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('inquiry-phone.png') });
  expect(errors).toEqual([]);
});

test('referral survives service page to booking and reaches the Cal embed configuration', async ({ page }) => {
  await page.goto(pages[0] + '?utm_source=chatgpt.com&email=never-forward@example.org');
  await page.locator('main a[href^="/book.html"]').first().click();
  await expect(page).toHaveURL(/book.html\?utm_source=chatgpt/);
  expect(page.url()).not.toContain('never-forward');
  const inline = await page.evaluate(() => window.Cal.ns['30min'].q.map(args => Array.from(args)).find(args => args[0] === 'inline'));
  expect(inline[1].calLink).toBe('frank-epps-ujdwu4/30min');
  expect(inline[1].config.utm_source).toBe('chatgpt');
  expect(inline[1].config.utm_content).toBe('business-automation-atlanta');
});

test('inquiry submits exactly once with source and reports success only after acknowledgement', async ({ page }) => {
  const requests = [];
  await page.route('https://three-mountaintops-engine.onrender.com/api/understudy/lead', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto(pages[0] + '?utm_source=chatgpt.com');
  await page.locator('a[href="index.html#contact"]').click();
  await page.locator('#contact-name').fill('Test owner');
  await page.locator('#contact-email').fill('test@example.org');
  await page.locator('#contact-business').fill('Please connect our booking workflow.');
  await page.locator('#contact-send').click();
  await expect(page.locator('#contact-status')).toContainText('has been received');
  await expect(page.locator('#contact-send')).toBeDisabled();
  expect(requests).toHaveLength(1);
  expect(requests[0].summary).toContain('chatgpt; landing page: /business-automation-atlanta.html');
  expect(page.url()).not.toContain('test@example.org');
});

test('inquiry failure keeps entered information and allows a deliberate retry', async ({ page }) => {
  await page.route('https://three-mountaintops-engine.onrender.com/api/understudy/lead', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }));
  await page.goto('/index.html#contact');
  await page.locator('#contact-name').fill('Test owner');
  await page.locator('#contact-email').fill('test@example.org');
  await page.locator('#contact-business').fill('Please inspect our site.');
  await page.locator('#contact-send').click();
  await expect(page.locator('#contact-status')).toContainText('could not confirm');
  await expect(page.locator('#contact-send')).toBeEnabled();
  await expect(page.locator('#contact-business')).toHaveValue('Please inspect our site.');
});

test('service content remains available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4387' + pages[0]);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main a[href="book.html"]').first()).toBeVisible();
  await page.goto('http://127.0.0.1:4387/index.html#contact');
  await expect(page.locator('#contact-form')).toHaveCSS('opacity', '1');
  await expect(page.locator('#contact-send')).toBeDisabled();
  await expect(page.locator('#contact-form noscript')).toBeVisible();
  await expect(page.locator('#contact-note a')).toBeVisible();
  await context.close();
});
