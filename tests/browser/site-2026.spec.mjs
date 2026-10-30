import { test, expect } from '@playwright/test';

const classPaymentLinks = {
  basics: 'https://buy.stripe.com/cNibJ11oU7h07Ty9tm4Rq0x',
  workshop: 'https://buy.stripe.com/fZu4gz0kQeJsc9O7le4Rq0y'
};
const navPages = ['/', '/work-with-me.html', '/founders.html', '/book.html', '/consult.html', '/pricing.html', '/work.html', '/systems.html', '/business-automation-atlanta.html', '/website-development-atlanta.html', '/start-a-build.html'];
const primaryPages = { '/': 'Classes', '/work-with-me.html': 'Work with me', '/founders.html': 'The Seed' };
const serviceChildren = ['/book.html', '/consult.html', '/pricing.html', '/start-a-build.html'];
const classLabels = { basics: 'Save my seat: $25', workshop: 'Reserve my seat: $150' };

test.beforeEach(async ({ page }) => {
  await page.route('https://three-mountaintops-engine.onrender.com/**', route => route.abort());
  await page.route('https://app.cal.com/**', route => route.fulfill({ body: '' }));
});

test('classes home has approved offers, dates, prices and no unfinished copy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Learn AI. Then build with it.');
  const text = await page.locator('body').innerText();
  expect(new Set(text.match(/\$\d[\d,]*/g))).toEqual(new Set(['$25', '$150']));
  expect(text).not.toMatch(/\$250|founding|TBD|PASTE|register now|waitlist|\[/i);
  for (const value of ['Sunday, November 15, 2026', '6–8 PM Eastern', 'Starts January 1, 2027', 'THREE MOUNTAINS CREATIVE WORKSHOP', '30 seats', '12 seats', 'full refund until 6 PM Eastern on Friday, November 13', 'full refund through Tuesday, December 29']) {
    expect(text).toContain(value);
  }
  await expect(page.locator('#contact-form, #quote-result, #help-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('registration links are visible, enabled native anchors with the approved labels', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.class-checkout')).toHaveCount(2);
  for (const [course, label] of Object.entries(classLabels)) {
    const button = page.locator('.class-checkout[data-class="' + course + '"]');
    await expect(button).toHaveText(label);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('href', classPaymentLinks[course]);
    await expect(button).not.toHaveAttribute('aria-disabled');
    await expect(button).not.toHaveAttribute('disabled');
    await expect(button).not.toHaveAttribute('role');
    await expect(button).not.toHaveAttribute('tabindex');
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(1);
  }
});

test('registration links navigate in the same tab to the exact approved Stripe URLs', async ({ page }) => {
  // Intercept locally: exercise native link navigation without visiting or paying Stripe.
  for (const url of Object.values(classPaymentLinks)) {
    await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Class checkout fixture</title>' }));
  }
  for (const [course, url] of Object.entries(classPaymentLinks)) {
    await page.goto('/');
    const button = page.locator('.class-checkout[data-class="' + course + '"]');
    await expect(button).toHaveAttribute('href', url);
    await expect(button).not.toHaveAttribute('target');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(url);
    await expect(page).toHaveTitle('Class checkout fixture');
  }
});

for (const course of ['basics', 'workshop']) {
  test(course + ' confirmation is focused, isolated and leaves both offers visible', async ({ page }) => {
    await page.goto('/?seat=' + course);
    const panel = page.locator('#confirmation-' + course);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'status');
    await expect(panel.locator('h2')).toBeFocused();
    await expect(panel).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#confirmation-' + (course === 'basics' ? 'workshop' : 'basics'))).toBeHidden();
    await expect(panel).toContainText(course === 'basics' ? "You're in." : 'Your seat is reserved.');
    await expect(page.getByRole('heading', { name: 'AI Basics', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Build your own tools in 30 days', exact: true })).toBeVisible();
    for (const button of await page.locator('.class-checkout').all()) await expect(button).toBeVisible();
  });
}

for (const query of ['', '?seat=', '?seat=unknown', '?seat=%3Cscript%3E']) {
  test('unknown or absent seat query shows no confirmation: ' + (query || 'none'), async ({ page }) => {
    await page.goto('/' + query);
    await expect(page.locator('#confirmation-basics')).toBeHidden();
    await expect(page.locator('#confirmation-workshop')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('<script>');
  });
}

test('legacy classes address preserves the query string and hash when forwarding', async ({ page }) => {
  await page.goto('/classes.html?seat=basics#confirmation-basics');
  await expect(page).toHaveURL('http://127.0.0.1:4387/?seat=basics#confirmation-basics');
  await expect(page.locator('#confirmation-basics')).toBeVisible();
});

for (const path of navPages) {
  test(path + ' has accessible three-tab navigation, stays dark and fits 360px', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('understudy-theme', 'light'));
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(nav.locator('a')).toHaveText(['Classes', 'Work with me', 'The Seed']);
    const destinations = await nav.locator('a').evaluateAll(links => links.map(link => new URL(link.href).pathname));
    expect(destinations).toEqual(['/index.html', '/work-with-me.html', '/founders.html']);
    for (const link of await nav.locator('a').all()) await expect(link).toBeVisible();
    if (primaryPages[path]) {
      await expect(nav.locator('[aria-current]')).toHaveCount(1);
      await expect(nav.getByRole('link', { name: primaryPages[path], exact: true })).toHaveAttribute('aria-current', 'page');
    } else if (serviceChildren.includes(path)) {
      await expect(nav.locator('[aria-current]')).toHaveCount(1);
      await expect(nav.getByRole('link', { name: 'Work with me', exact: true })).toHaveAttribute('aria-current', 'true');
    } else await expect(nav.locator('[aria-current]')).toHaveCount(0);
    await expect(page.locator('#theme-toggle, .theme-toggle, .nav-menu-toggle, .nav-cta')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 18, 32)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const oldColors = await page.locator('body *').evaluateAll(nodes => nodes.flatMap(node => {
      const style = getComputedStyle(node);
      if (!node.getClientRects().length || style.visibility === 'hidden' || Number(style.opacity) === 0) return [];
      const ownText = Array.from(node.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      const bg = style.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      const cream = bg.length >= 3 && (bg.length < 4 || bg[3] > 0) && bg[0] >= 220 && bg[1] >= 210 && bg[2] >= 190;
      const oldGold = (ownText && style.color === 'rgb(201, 164, 92)') || style.backgroundColor === 'rgb(201, 164, 92)';
      return cream || oldGold ? [{ element: node.tagName, class: node.className, color: style.color, background: style.backgroundColor }] : [];
    }));
    expect(oldColors).toEqual([]);
    const smallButtons = await page.locator('.btn, button').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && node.getBoundingClientRect().height < 48).map(node => node.textContent));
    expect(smallButtons).toEqual([]);
    const link = nav.getByRole('link', { name: 'Classes', exact: true });
    await page.keyboard.press('Tab');
    await link.focus();
    await expect(link).toBeFocused();
    expect(await link.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
    expect(errors).toEqual([]);
  });
}

test('service hub introduces Frank first, keeps three orange buttons that open the right calendar, and has no prices section', async ({ page }) => {
  await page.goto('/work-with-me.html');
  await expect(page.locator('h1')).toHaveText("I'm Frank Epps. I do AI consultation.");
  const sections = await page.locator('main > section').evaluateAll(nodes => nodes.map(node => node.className));
  expect(sections[0]).toContain('work-intro');
  expect(sections[sections.length - 1]).toContain('work-proof');
  expect(await page.locator('.work-intro').innerText()).not.toMatch(/\$\d/);
  await expect(page.locator('.offer-card')).toHaveCount(3);
  await expect(page.locator('.offer-card .price')).toHaveCount(0);
  const routes = await page.locator('.offer-card .btn').evaluateAll(links => links.map(link => new URL(link.href).pathname));
  expect(routes).toEqual(['/book.html', '/consult.html', '/start-a-build.html']);
  await expect(page.locator('#booking')).toBeHidden();
  for (const [name, namespace, calLink] of [
    ['Book the $150 diagnosis', 'hub-diagnosis', 'frank-epps-ujdwu4/30min'],
    ['Book a consultation', 'hub-consultation', 'frank-epps-ujdwu4/systems-consultation'],
    ['Start a build', 'hub-diagnosis', 'frank-epps-ujdwu4/30min'],
  ]) {
    await page.locator('.offer-card .btn', { hasText: name }).click();
    await expect(page).toHaveURL(/\/work-with-me\.html/);
    await expect(page.locator('#booking')).toBeVisible();
    await expect(page.locator('#booking-title')).toHaveText(name);
    await expect(page.locator('#booking-title')).toBeFocused();
    await expect(page.locator('#my-cal-inline-' + namespace)).toBeVisible();
    const inline = await page.evaluate(ns => window.Cal.ns[ns].q.map(args => Array.from(args)).find(args => args[0] === 'inline'), namespace);
    expect(inline[1].calLink).toBe(calLink);
    expect(inline[1].elementOrSelector).toBe('#my-cal-inline-' + namespace);
  }
  await expect(page.locator('.work-prices')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toMatch(/\$1,500|\$3,000|\$6,000|\$10,000/);
});

test('without JavaScript the three hub buttons still reach their booking pages', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/work-with-me.html');
  await page.locator('.offer-card .btn', { hasText: 'Book a consultation' }).click();
  await expect(page).toHaveURL(/\/consult\.html/);
  await context.close();
});

test('Seed form retains its endpoint, hidden honeypot and acknowledgement flow', async ({ page }) => {
  const bodies = [];
  await page.route('https://three-mountaintops-engine.onrender.com/api/understudy/lead', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/founders.html');
  await expect(page.locator('#seed-form')).toHaveAttribute('action', 'https://three-mountaintops-engine.onrender.com/api/understudy/lead');
  await expect(page.locator('#seed-website')).not.toBeInViewport();
  await expect(page.locator('#seed-website')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('.seed-trap')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#seed-email').fill('test@example.invalid');
  await page.locator('#seed-send').click();
  await expect(page.locator('#seed-status')).toContainText('You are on the list.');
  await expect(page.locator('#seed-send')).toBeDisabled();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].lane).toBe('seed-waitlist');
  await expect(page.getByRole('link', { name: 'Explore the Orrery', exact: true })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'Explore the Orrery', exact: true })).toHaveAttribute('rel', 'noopener');
  await expect(page.getByRole('link', { name: 'Explore the Orrery', exact: true })).toHaveAttribute('href', 'https://voyage.understudy.consulting/');
});

for (const old of ['/landing-v2.html', '/build.html']) {
  test(old + ' forwards to Work with me with its query', async ({ page }) => {
    await page.goto(old + '?utm_source=flyer');
    await expect(page).toHaveURL(/\/work-with-me\.html\?utm_source=flyer$/);
    await expect(page.locator('h1')).toHaveText("I'm Frank Epps. I do AI consultation.");
  });
}
