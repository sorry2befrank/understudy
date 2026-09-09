(function () {
  'use strict';
  var KEY = 'understudy-discovery-v1';
  var MAX_AGE = 30 * 60 * 1000;
  var pages = ['/', '/index.html', '/work.html', '/systems.html', '/founders.html', '/book.html', '/business-automation-atlanta.html', '/website-development-atlanta.html'];
  var sources = ['chatgpt', 'google', 'bing', 'perplexity', 'google-business', 'direct'];
  var path = window.location.pathname;
  if (pages.indexOf(path) === -1) return;
  var params = new URLSearchParams(window.location.search);
  var rawSource = (params.get('utm_source') || '').toLowerCase();
  var aliases = { 'chatgpt.com': 'chatgpt', 'google-business-profile': 'google-business' };
  var source = aliases[rawSource] || rawSource;
  if (sources.indexOf(source) === -1 || source === 'direct') source = '';
  var referrer = '';
  try { referrer = new URL(document.referrer).hostname.toLowerCase(); } catch (error) {}
  if (!source) {
    var hosts = { 'chatgpt.com': 'chatgpt', 'chat.openai.com': 'chatgpt', 'google.com': 'google', 'www.google.com': 'google', 'bing.com': 'bing', 'www.bing.com': 'bing', 'perplexity.ai': 'perplexity', 'www.perplexity.ai': 'perplexity' };
    source = hosts[referrer] || '';
  }
  var previous = null;
  try { previous = JSON.parse(sessionStorage.getItem(KEY)); } catch (error) {}
  var now = Date.now();
  if (!previous || sources.indexOf(previous.source) === -1 || pages.indexOf(previous.landing) === -1 || !Number.isFinite(previous.at) || previous.at > now || now - previous.at > MAX_AGE) previous = null;
  // Keep only a coarse source and an allowlisted public page. Never retain
  // arbitrary query strings, full referrer URLs, names, emails or identifiers.
  var value = source && previous && previous.source === source ? previous
    : source ? { source: source, landing: path, at: now }
    : previous || { source: 'direct', landing: path, at: now };
  try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch (error) {}

  function campaignParams() {
    return {
      utm_source: value.source,
      utm_medium: value.source === 'direct' ? 'website' : value.source === 'google-business' ? 'local' : 'referral',
      utm_campaign: 'atlanta-services',
      utm_content: value.landing === '/' ? 'home' : value.landing.slice(1).replace(/\.html$/, '')
    };
  }
  function decorateLinks() {
    document.querySelectorAll('a[href]').forEach(function (link) {
      var url;
      try { url = new URL(link.getAttribute('href'), window.location.href); } catch (error) { return; }
      if (url.origin !== window.location.origin || url.pathname !== '/book.html') return;
      var tags = campaignParams();
      Object.keys(tags).forEach(function (key) { if (!url.searchParams.has(key)) url.searchParams.set(key, tags[key]); });
      link.setAttribute('href', url.pathname + url.search + url.hash);
    });
  }
  window.UnderstudyDiscovery = {
    // Source is best-effort visitor-supplied attribution, not verified identity.
    enrichSummary: function (summary) { return String(summary || '') + '\nInquiry source (best effort): ' + value.source + '; landing page: ' + value.landing; },
    bookingParams: campaignParams
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateLinks);
  else decorateLinks();
})();
