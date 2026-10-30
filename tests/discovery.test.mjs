import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parseDocument, DomUtils } from 'htmlparser2';

const root = resolve(import.meta.dirname, '..');
const origin = 'https://understudy.consulting';
const pages = ['index.html', 'business-automation-atlanta.html', 'website-development-atlanta.html', 'work.html', 'systems.html', 'book.html', 'consult.html', 'work-with-me.html', 'pricing.html', 'start-a-build.html'];
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
  for (const path of ['/work-with-me.html', '/pricing.html', '/start-a-build.html']) {
    const result = attribution({ path, search: '?utm_source=chatgpt.com&email=never-store@example.org' });
    assert.equal(result.saved.landing, path);
    assert.equal(result.api.bookingParams().utm_source, 'chatgpt');
    assert.match(result.links[0].href, /utm_source=chatgpt/);
    assert.doesNotMatch(JSON.stringify(result.saved) + result.links[0].href, /never-store|email/);
  }
});

test('builds book the $500 consultation on their own page, credited toward the build', async () => {
  const page = await readFile(resolve(root, 'start-a-build.html'), 'utf8');
  const doc = await documentFor('start-a-build.html');
  assert.equal(text(elements(doc, 'h1')[0]), 'Start a build.');
  assert.equal(DomUtils.findAll(node => node.attribs?.id === 'my-cal-inline-build-consultation', doc.children).length, 1);
  assert.match(page, /var BUILD_NAMESPACE = "build-consultation";/);
  assert.match(page, /var BUILD_CAL_LINK = "frank-epps-ujdwu4\/systems-consultation";/);
  assert.match(page, /UnderstudyDiscovery\.bookingParams/);
  assert.match(text(doc), /If we build together, the \$500 comes off the build price\./);
  assert.match(text(doc), /with the \$500 taken off/);
  assert.doesNotMatch(page, /initEmbeddedCheckout|\/api\/understudy\/checkout|buy\.stripe\.com|checkout\.stripe\.com|pay\.html/);
  assert.ok(elements(doc, 'a').some(node => node.attribs.href === 'mailto:frank@marqueeweb.com'));
  const hub = await documentFor('work-with-me.html');
  const buildsButton = elements(hub, 'a').find(node => text(node) === 'Start a build');
  assert.equal(buildsButton?.attribs.href, 'start-a-build.html');
  assert.match(text(hub), /Every build starts with the \$500 consultation\. It comes off the build price if we build together\./);
});

test('one rule across the site: the $150 diagnosis fixes what exists, the $500 consultation plans something new', async () => {
  for (const file of [...pages, 'founders.html']) {
    const content = text(await documentFor(file));
    for (const pattern of [/For a build, book the \$150 diagnostic/, /before you commit to a build/, /or a fix or build you want me to take on/, /scoping work for me/]) {
      assert.doesNotMatch(content, pattern, file + ' still says ' + pattern);
    }
  }
  const pricing = await readFile(resolve(root, 'pricing.html'), 'utf8');
  assert.equal(pricing.split('For a new build, book the $500 consultation first. To fix something you already have, book the $150 diagnostic.').length - 1, 3);
  assert.match(pricing, /A paid working session to plan a build or a system you want to set up for your own business\. Credited toward the build if we continue\./);
  const website = await documentFor('website-development-atlanta.html');
  assert.doesNotMatch(text(website), /Start with a \$150 diagnosis|Book the \$150 diagnosis|Diagnostic: \$150/);
  assert.match(text(website), /Consultation: \$500\./);
  assert.equal(elements(website, 'a').filter(node => node.attribs.href === 'start-a-build.html' && text(node) === 'Start a build').length, 2);
  const work = await documentFor('work.html');
  assert.ok(elements(work, 'a').some(node => node.attribs.href === 'work-with-me.html' && text(node) === 'Work with me'));
  assert.ok(!elements(work, 'a').some(node => text(node) === 'Start with a diagnosis'));
  assert.match(text(await documentFor('book.html')), /I inspect what you already have and explain the scope before you commit to a fix\./);
  assert.match(text(await documentFor('consult.html')), /Inspecting or fixing what you have/);
  const automation = await documentFor('business-automation-atlanta.html');
  assert.ok(elements(automation, 'a').some(node => node.attribs.href === 'book.html' && text(node) === 'Start with a $150 diagnosis'), 'automation keeps its $150 diagnosis: it inspects an existing workflow');
});

test('build booking links carry attribution like the other booking pages', () => {
  const window = { location: { origin, pathname: '/work-with-me.html', search: '?utm_source=chatgpt.com', href: origin + '/work-with-me.html?utm_source=chatgpt.com' } };
  const links = ['start-a-build.html', 'founders.html'].map(href => ({ href, getAttribute() { return this.href; }, setAttribute(key, value) { this.href = value; } }));
  let saved = null;
  runInNewContext(script, { window, document: { referrer: '', readyState: 'complete', querySelectorAll: () => links }, URL, URLSearchParams, Date, Number,
    sessionStorage: { getItem() { return saved; }, setItem(key, value) { saved = value; } } });
  assert.match(links[0].href, /^\/start-a-build\.html\?utm_source=chatgpt/);
  assert.equal(links[1].href, 'founders.html');
});

test('every page names the right paid session and links the path it names', async () => {
  const hub = await readFile(resolve(root, 'work-with-me.html'), 'utf8');
  assert.doesNotMatch(hub, /Start with a \$150 diagnosis/);
  assert.equal(hub.split('Fix what you already have with a $150 diagnosis, or plan a new build with a $500 consultation, credited toward the build.').length - 1, 2);
  const book = await documentFor('book.html');
  assert.doesNotMatch(text(book), /or idea/);
  assert.ok(elements(book, 'a').some(node => node.attribs.href === 'start-a-build.html' && text(node) === 'Start a build.'));
  assert.match(text(book), /The only consulting services you book and pay for directly on this site/);
  assert.match(text(await documentFor('consult.html')), /Credited toward the build if we continue\./);
  const website = await documentFor('website-development-atlanta.html');
  assert.ok(elements(website, 'a').some(node => node.attribs.href === 'book.html' && text(node) === '$150 diagnosis'), 'repairs keep a $150 route');
  const pricing = await documentFor('pricing.html');
  for (const href of ['start-a-build.html', 'book.html', 'consult.html']) {
    assert.ok(elements(pricing, 'a').some(node => node.attribs.href === href), 'pricing links ' + href);
  }
  const home = await documentFor('index.html');
  assert.equal(DomUtils.findAll(node => node.attribs?.id === 'contact', home.children).length, 1, 'pay.html links index.html#contact');
  const build = await readFile(resolve(root, 'start-a-build.html'), 'utf8');
  assert.match(build, /<meta property="og:url" content="https:\/\/understudy\.consulting\/start-a-build\.html" \/>/);
  assert.match(build, /<meta property="og:image" content="https:\/\/understudy\.consulting\/img\/understudy-logo\.png" \/>/);
});
