(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem('understudy-theme');
    if (!theme && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
    if (theme === 'light') root.setAttribute('data-theme', 'light');
  } catch (error) {}
  var button = document.getElementById('theme-toggle');
  if (!button) return;
  function paint() {
    var light = root.getAttribute('data-theme') === 'light';
    button.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    button.title = button.getAttribute('aria-label');
  }
  paint();
  button.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    if (next === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem('understudy-theme', next); } catch (error) {}
    paint();
  });
})();
