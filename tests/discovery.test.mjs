import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parseDocument, DomUtils } from 'htmlparser2';

const root = resolve(import.meta.dirname, '..');
const origin = 'https://understudy.consulting';
const pages = ['index.html', 'business-automation-atlanta.html', 'website-development-atlanta.html', 'work.html', 'systems.html', 'book.html', 'consult.html', 'work-with-me.html', 'pricing.html'];
const classPaymentLinks = {
  basics: 'https://buy.stripe.com/cNibJ11oU7h07Ty9tm4Rq0x',
  workshop: 'https://buy.stripe.com/fZu4gz0kQeJsc9O7le4Rq0y'
};
const documentFor = async (file) => parseDocument(await readFile(resolve(root, file), 'utf8'));
const elements = (doc, name) => DomUtils.findAll(node => node.name === name, doc.children);
const text = node => DomUtils.textContent(node);
const script = await readFile(resolve(root, 'discovery-attribution.js'), 'utf8');

test('public discovery pages have unique titles, descriptions, canonical URLs and crawlable content', async () => {
  const titles = new Set();
  for (const file of pages) {
    const doc = await documentFor(file);
    const title = text(elements(doc, 'title')[0]);
    assert.ok(title && !titles.has(title)); titles.add(title);
    assert.ok(elements(doc, 'meta').some(node => node.attribs.name === 'description' && node.attribs.content.length > 40));
    assert.equal(elements(doc, 'link').filter(node => node.attribs.rel === 'canonical').length, 1);
    assert.equal(elements(doc, 'link').find(node => node.attribs.rel === 'canonical').attribs.href, `${origin}/${file === 'index.html' ? '' : file}`);
    assert.equal(elements(doc, 'h1').length, 1);
    assert.ok(!elements(doc, 'meta').some(node => node.attribs.name === 'robots' && /noindex/.test(node.attribs.content)));
  }
});

test('structured data uses confirmed service coverage without invented location, reviews or certification', async () => {
  for (const file of pages.slice(0, 3)) {
    const doc = await documentFor(file);
    const schemas = elements(doc, 'script').filter(node => node.attribs.type === 'application/ld+json').map(node => JSON.parse(text(node)));
    assert.equal(schemas.length, 1);
    const serialized = JSON.stringify(schemas);
    assert.match(serialized, /Atlanta metropolitan area, Georgia/);
    assert.doesNotMatch(serialized, /streetAddress|postalCode|latitude|longitude|aggregateRating|reviewCount|LocalBusiness|SDVOSB/);
    const visibleContent = file === 'index.html' ? await documentFor('work-with-me.html') : doc;
    assert.match(text(visibleContent), /visit clients|visits to clients|client visits/i);
  }
});

test('public sitemap contains only canonical marketing pages, not client invitations or internal files', async () => {
  const doc = parseDocument(await readFile(resolve(root, 'sitemap.xml'), 'utf8'), { xmlMode: true });
  const urls = elements(doc, 'loc').map(text);
  assert.equal(new Set(urls).size, pages.length);
  assert.deepEqual(new Set(urls), new Set(pages.map(file => `${origin}/${file === 'index.html' ? '' : file}`)));
  const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
  assert.match(robots, /User-agent: \*\s+Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/understudy\.consulting\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow:\s*\/\s*(?:\n|$)/);
});

test('local links and referenced assets resolve, including fragment targets', async () => {
  for (const file of [...pages, 'founders.html']) {
    const doc = await documentFor(file);
    const nodes = DomUtils.findAll(node => node.attribs && (node.attribs.src || node.attribs.href), doc.children);
    for (const node of nodes) {
      const url = new URL(node.attribs.src || node.attribs.href, `${origin}/${file}`);
      if (url.origin !== origin) continue;
      const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      assert.ok((await stat(resolve(root, '.' + path))).isFile(), `${file}: missing ${path}`);
      if (url.hash && path.endsWith('.html')) {
        const target = path === `/${file}` ? doc : await documentFor(path.slice(1));
        assert.ok(DomUtils.findOne(n => n.attribs?.id === url.hash.slice(1), target.children, true), `${file}: missing ${url.hash}`);
      }
    }
  }
});

function attribution({ path = '/business-automation-atlanta.html', search = '', referrer = '', stored = null, storageError = false } = {}) {
  let saved = stored;
  const links = ['book.html', 'https://example.org/book.html', 'index.html#contact'].map(href => ({ href, getAttribute() { return this.href; }, setAttribute(key, value) { this.href = value; } }));
  const window = { location: { origin, pathname: path, search, href: origin + path + search } };
  runInNewContext(script, { window, document: { referrer, readyState: 'complete', querySelectorAll: () => links }, URL, URLSearchParams, Date, Number,
    sessionStorage: { getItem() { if (storageError) throw Error(); return saved; }, setItem(key, value) { if (storageError) throw Error(); saved = value; } } });
  return { api: window.UnderstudyDiscovery, saved: JSON.parse(saved || 'null'), links };
}

test('ChatGPT source survives navigation into booking and inquiry without forwarding private query parameters', () => {
  const first = attribution({ search: '?utm_source=chatgpt.com&email=private@example.org&token=secret' });
  assert.equal(first.saved.source, 'chatgpt');
  assert.match(first.links[0].href, /utm_source=chatgpt/);
  assert.equal(first.links[1].href, 'https://example.org/book.html');
  assert.equal(first.links[2].href, 'index.html#contact');
  const next = attribution({ path: '/index.html', stored: JSON.stringify(first.saved) });
  assert.match(next.api.enrichSummary('Website inquiry'), /chatgpt; landing page: \/business-automation-atlanta.html/);
  const booking = attribution({ path: '/book.html', search: '?utm_source=chatgpt', stored: JSON.stringify(first.saved) });
  assert.equal(booking.api.bookingParams().utm_content, 'business-automation-atlanta');
  const changed = attribution({ path: '/website-development-atlanta.html', search: '?utm_source=google', stored: JSON.stringify(first.saved) });
  assert.equal(changed.saved.source, 'google');
  assert.equal(changed.saved.landing, '/website-development-atlanta.html');
  assert.doesNotMatch(JSON.stringify(first.saved) + first.links[0].href, /private|secret|token/);
});

test('attribution validates storage, ignores spoofed hosts and expires at thirty minutes', () => {
  for (const stored of ['not json', JSON.stringify({ source: 'evil', landing: '/private', at: Date.now() }), JSON.stringify({ source: 'chatgpt', landing: '/', at: Date.now() - 31 * 60_000 })]) {
    assert.equal(attribution({ stored }).saved.source, 'direct');
  }
  assert.equal(attribution({ referrer: 'https://chatgpt.com.evil.example/' }).saved.source, 'direct');
  assert.equal(attribution({ referrer: 'https://www.google.com/search?q=private' }).saved.source, 'google');
  assert.ok(attribution({ storageError: true }).api.bookingParams());
  assert.equal(attribution({ path: '/join-aisha.html' }).api, undefined);
});

test('classes home retires the inquiry form and booking retains its existing calendar', async () => {
  const doc = await documentFor('index.html');
  assert.equal(elements(doc, 'form').length, 0);
  assert.ok(!DomUtils.findOne(node => ['contact-form', 'idea', 'quote-result', 'help-panel'].includes(node.attribs?.id), doc.children, true));
  const book = await readFile(resolve(root, 'book.html'), 'utf8');
  assert.match(book, /frank-epps-ujdwu4\/30min/);
  assert.match(book, /UnderstudyDiscovery.bookingParams/);
});

test('public project purchase path stays diagnostic; only the two approved class links may appear on home', async () => {
  for (const file of pages) {
    const doc = await documentFor(file);
    const hrefs = elements(doc, 'a').map(node => node.attribs.href || '');
    assert.ok(!hrefs.some(href => /(?:pay\.html|checkout\.stripe\.com)/.test(href)), file + ' must not advertise project checkout');
    const stripeHrefs = hrefs.filter(href => /buy\.stripe\.com/.test(href));
    assert.deepEqual(new Set(stripeHrefs), new Set(file === 'index.html' ? Object.values(classPaymentLinks) : []), file + ' may link only its owner-approved class checkout URLs');
  }
  const home = await readFile(resolve(root, 'index.html'), 'utf8');
  const pricing = await readFile(resolve(root, 'pricing.html'), 'utf8');
  const book = await readFile(resolve(root, 'book.html'), 'utf8');
  const website = await readFile(resolve(root, 'website-development-atlanta.html'), 'utf8');
  for (const content of [pricing, book, website]) {
    assert.match(content, /50%/);
    assert.match(content, /when (?:the |the agreed )?work is complete/);
  }
  assert.match(book, /diagnostic only, not website design/);
  assert.doesNotMatch(home, /Fund one small step|pay as you go|You can start today for|function payFor/);
  assert.match(book, /frank-epps-ujdwu4\/30min/);
  assert.doesNotMatch(book, /initEmbeddedCheckout|\/api\/understudy\/checkout/);
});

test('consultation is the $500 Cal.com booking, reachable from book and the services hub', async () => {
  const consult = await readFile(resolve(root, 'consult.html'), 'utf8');
  assert.match(consult, /\$500/);
  assert.match(consult, /frank-epps-ujdwu4\/systems-consultation/);
  assert.match(consult, /UnderstudyDiscovery\.bookingParams/);
  assert.doesNotMatch(consult, /initEmbeddedCheckout|\/api\/understudy\/checkout|buy\.stripe\.com/);
  for (const file of ['book.html', 'work-with-me.html']) {
    const doc = await documentFor(file);
    assert.ok(elements(doc, 'a').some(node => node.attribs.href === 'consult.html'), file + ' links to the consultation');
  }
});

test('major build budgets stay visible without buy-now project links', async () => {
  const doc = await documentFor('pricing.html');
  const table = elements(doc, 'table').find(node => node.attribs.class === 'price-table reveal');
  assert.match(text(table), /Website build \+ scoped AI/);
  assert.match(text(table), /\$3,000–\$6,000/);
  assert.match(text(table), /Major operator \/ automation build/);
  assert.match(text(table), /From \$10,000/);
  assert.equal(elements(table, 'button').length, 0);
  assert.equal(elements(table, 'a').length, 0);
  const hub = await documentFor('work-with-me.html');
  assert.ok(elements(hub, 'a').some(node => node.attribs.href === 'pricing.html' && text(node) === 'View website and major-build price ranges'));
});

test('class checkout uses enabled native anchors with the correct course mapping', async () => {
  const doc = await documentFor('index.html');
  const buttons = elements(doc, 'a').filter(node => node.attribs.class?.split(/\s+/).includes('class-checkout'));
  assert.equal(buttons.length, 2);
  assert.deepEqual(new Set(buttons.map(node => node.attribs['data-class'])), new Set(['basics', 'workshop']));
  for (const button of buttons) {
    assert.equal(button.attribs.href, classPaymentLinks[button.attribs['data-class']]);
    assert.equal(button.attribs.target, undefined);
    assert.equal(button.attribs['aria-disabled'], undefined);
    assert.equal(button.attribs.disabled, undefined);
    assert.equal(button.attribs.role, undefined);
    assert.equal(button.attribs.tabindex, undefined);
  }
});

test('class checkout uses the two exact owner-approved Stripe URLs', async () => {
  const doc = await documentFor('index.html');
  const links = elements(doc, 'a').filter(node => /buy\.stripe\.com/.test(node.attribs.href || '')).map(node => node.attribs.href);
  assert.equal(links.length, 2);
  assert.deepEqual(new Set(links), new Set(Object.values(classPaymentLinks)));
});

test('new service and pricing paths retain referral attribution without storing private data', () => {
  for (const path of ['/work-with-me.html', '/pricing.html']) {
    const result = attribution({ path, search: '?utm_source=chatgpt.com&email=never-store@example.org' });
    assert.equal(result.saved.landing, path);
    assert.equal(result.api.bookingParams().utm_source, 'chatgpt');
    assert.match(result.links[0].href, /utm_source=chatgpt/);
    assert.doesNotMatch(JSON.stringify(result.saved) + result.links[0].href, /never-store|email/);
  }
});
