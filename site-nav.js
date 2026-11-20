(function () {
  var navs = document.querySelectorAll('.site-nav');

  navs.forEach(function (nav) {
    var toggle = nav.querySelector('.nav-menu-toggle');
    if (!toggle) return;

    var menu = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!menu) return;

    function setOpen(open, returnFocus) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      if (!open && returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true', false);
    });

    toggle.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(toggle.getAttribute('aria-expanded') !== 'true', false);
      }
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false, false);
    });

    document.addEventListener('click', function (event) {
      if (toggle.getAttribute('aria-expanded') === 'true' && !nav.contains(event.target)) {
        setOpen(false, false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false, true);
      }
    });

    var mobile = window.matchMedia('(max-width: 760px)');
    function closeAtDesktop(event) {
      if (!event.matches) setOpen(false, false);
    }
    if (mobile.addEventListener) mobile.addEventListener('change', closeAtDesktop);
    else if (mobile.addListener) mobile.addListener(closeAtDesktop);
  });
})();
