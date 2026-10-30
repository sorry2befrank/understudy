import { test, expect } from '@playwright/test';

const pages = ['/business-automation-atlanta.html', '/website-development-atlanta.html'];
test.beforeEach(async ({ page }) => {
  await page.route('https://js.stripe.com/**', route => route.fulfill({ body: '' }));
  await page.route('https://three-mountaintops-engine.onrender.com/**', route => route.abort());
  await page.route('https://app.cal.com/**', route => route.fulfill({ body: '' }));
});

for (const width of [360, 768, 1440]) {
  for (const path of pages) {
    test(path + ' is readable and interactive at ' + width + 'px', async ({ page }, testInfo) => {
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
      await expect(page.locator('#theme-toggle, .nav-menu-toggle')).toHaveCount(0);
      await expect(page.locator('nav a')).toHaveText(['Classes', 'Work with me', 'The Seed']);
      for (const link of await page.locator('nav a').all()) await expect(link).toBeVisible();
      await expect(page.getByRole('link', { name: 'Send a short inquiry', exact: true })).toHaveAttribute('href', 'mailto:frank@marqueeweb.com');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('dark.png'), fullPage: true });
      await page.screenshot({ path: testInfo.outputPath('first-screen.png') });
      expect(errors).toEqual([]);
    });
  }
}

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

for (const path of ['/pricing.html']) {
  test('referral survives ' + path + ' to a booking', async ({ page }) => {
    await page.goto(path + '?utm_source=chatgpt.com&email=never-forward@example.org');
    await page.locator('main a[href^="/book.html"], main a[href^="/consult.html"]').first().click();
    await expect(page).toHaveURL(/(?:book|consult).html\?utm_source=chatgpt/);
    expect(page.url()).not.toContain('never-forward');
    const params = await page.evaluate(() => window.UnderstudyDiscovery.bookingParams());
    expect(params.utm_source).toBe('chatgpt');
    expect(params.utm_content).toBe(path.slice(1).replace('.html', ''));
  });
}

test('service content and its inquiry link remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4387' + pages[0]);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main a[href="book.html"]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a short inquiry', exact: true })).toHaveAttribute('href', 'mailto:frank@marqueeweb.com');
  await page.goto('http://127.0.0.1:4387/');
  await expect(page.locator('h1')).toHaveText('Learn AI. Then build with it.');
  await expect(page.locator('.class-checkout')).toHaveCount(2);
  await expect(page.locator('#contact-form, #help-panel, #quote-result')).toHaveCount(0);
  await context.close();
});

test('referral reaches the calendar that a services hub button opens', async ({ page }) => {
  await page.goto('/work-with-me.html?utm_source=chatgpt.com&email=never-forward@example.org');
  await page.locator('.offer-card .btn', { hasText: 'Book the $150 diagnosis' }).click();
  const inline = await page.evaluate(() => window.Cal.ns['hub-diagnosis'].q.map(args => Array.from(args)).find(args => args[0] === 'inline'));
  expect(inline[1].calLink).toBe('frank-epps-ujdwu4/30min');
  expect(inline[1].config.utm_source).toBe('chatgpt');
  expect(inline[1].config.utm_content).toBe('work-with-me');
  expect(JSON.stringify(inline[1].config)).not.toContain('never-forward');
  expect(await page.evaluate(() => Boolean(window.Cal.config && window.Cal.config.forwardQueryParams))).toBe(false);
});

test('referral survives the website page to the build booking and reaches its Cal embed', async ({ page }) => {
  await page.goto('/website-development-atlanta.html?utm_source=chatgpt.com&email=never-forward@example.org');
  await page.locator('main a[href^="/start-a-build.html"]').first().click();
  await expect(page).toHaveURL(/start-a-build.html\?utm_source=chatgpt/);
  expect(page.url()).not.toContain('never-forward');
  await expect(page.locator('h1')).toHaveText('Start a build.');
  await page.waitForFunction(() => window.Cal && window.Cal.ns && window.Cal.ns['build-diagnosis']);
  const inline = await page.evaluate(() => window.Cal.ns['build-diagnosis'].q.map(args => Array.from(args)).find(args => args[0] === 'inline'));
  expect(inline[1].calLink).toBe('frank-epps-ujdwu4/30min');
  expect(inline[1].elementOrSelector).toBe('#my-cal-inline-build-diagnosis');
  expect(inline[1].config.utm_source).toBe('chatgpt');
  expect(inline[1].config.utm_content).toBe('website-development-atlanta');
});
