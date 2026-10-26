/* tanercokyasar.com — small site script: theme toggle, mobile menu, footer year,
   publication counts. No dependencies. */
(function () {
  var root = document.documentElement;

  // Theme toggle (remembered per browser; falls back to the OS setting)
  var btn = document.querySelector('.theme-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      var dark = root.getAttribute('data-theme') === 'dark' ||
        (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
      btn.setAttribute('aria-pressed', next === 'dark');
    });
  }

  // Mobile menu
  var menuBtn = document.querySelector('.menu-btn');
  var links = document.getElementById('nav-links');
  if (menuBtn && links) {
    menuBtn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
    });
  }

  // Copy-to-clipboard buttons (e.g., short bio)
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = document.getElementById(b.getAttribute('data-copy'));
      if (!el || !navigator.clipboard) return;
      navigator.clipboard.writeText(el.innerText.trim()).then(function () {
        var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1600);
      });
    });
  });


  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // SVG animations (SMIL) cannot be paused from CSS; stop them for reduced-motion visitors
  if (reduce) document.querySelectorAll('svg').forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });

  // Count-up for the "By the numbers" tiles: the final value is in the HTML; we only animate once visible
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; io.unobserve(e.target);
        var el = e.target, txt = el.textContent, m = txt.match(/^(\D*)([\d,.]+)(\D*)$/); if (!m) return;
        var target = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, t0 = performance.now(), D = 1200;
        (function tick(now) { var k = Math.min(1, (now - t0) / D), v = target * (1 - Math.pow(1 - k, 3));
          el.textContent = m[1] + v.toFixed(dec) + m[3]; if (k < 1) requestAnimationFrame(tick); else el.textContent = txt; })(t0);
      });
    }, { threshold: .6 });
    document.querySelectorAll('.stat .num').forEach(function (n) { if (/\d/.test(n.textContent)) io.observe(n); });

    // Gentle reveal for blocks that start below the fold (content above the fold is never hidden)
    var targets = document.querySelectorAll('.card, .stat, .path li, .news li, .pubs li, .panel, .person, .theme, .styled-list > li, .timeline > li');
    var ro = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var el = e.target; el.classList.add('in'); ro.unobserve(el); setTimeout(function () { el.classList.remove('reveal', 'in'); el.style.transitionDelay = ''; }, 1000); } }); }, { rootMargin: '0px 0px -40px 0px' });
    var vh = window.innerHeight;
    targets.forEach(function (el, i) {
      if (el.getBoundingClientRect().top > vh) { el.classList.add('reveal'); el.style.transitionDelay = ((i % 4) * 70) + 'ms'; ro.observe(el); }
    });
    setTimeout(function () { document.querySelectorAll('.reveal:not(.in)').forEach(function (el) { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in'); }); }, 2500);
  }

  // Publication counts: BibBase renders asynchronously, so count entries once they appear
  var counters = document.querySelectorAll('[data-bib-count]');
  if (counters.length) {
    var tries = 0;
    var tick = setInterval(function () {
      tries++;
      var done = true;
      counters.forEach(function (c) {
        var sec = document.getElementById(c.getAttribute('data-bib-count'));
        var n = sec ? sec.querySelectorAll('.bibbase_paper').length : 0;
        if (n) { c.textContent = '(' + n + ')'; } else { done = false; }
      });
      if (done || tries > 40) clearInterval(tick);
    }, 500);
  }
})();
