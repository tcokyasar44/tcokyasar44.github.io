/* Whiteboard + solver log (home page, "At a glance").
   1. A marker (light theme) or chalk (dark theme) writes the model token by token:
        max OPTIMIZATION_Taner  s.t.  Taner ∈ TRANSPORTATION,  Cokyasar ≥ 0
   2. A solver-style log "solves" it: the incumbent rises, the bound falls, the gap closes to 0.
   3. The marker circles the objective and an OPTIMAL ✓ stamp lands.
   "Solve again" erases the board and replays. Reduced motion shows the finished state. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VBW = 1000, VBH = 420;

  // [text, kind, gap%] — kind: h = header, r = node row, b = blank, ok = final status
  var LOG = [
    ['ATLAS Optimizer 26.10 (Texas A&M, ETID)', 'h'],
    ['Optimize a model with 2 rows, 2 columns, 2 nonzeros', 'h'],
    ['Presolve removed 0 rows and 0 columns', 'h'],
    ['Root relaxation: objective 1.125e+02, 7 iterations', 'h'],
    ['', 'b'],
    ['     Nodes    |   Objective Bounds        |', 'th'],
    ['  Expl Unexpl |  Incumbent   BestBd   Gap | Time', 'th'],
    ['H    0     0  |    61.000  112.500 84.4% |  0s', 'r', 84.4],
    ['     0     0  |    61.000  108.250 77.5% |  0s', 'r', 77.5],
    ['*   12     9  |    84.000  104.000 23.8% |  0s', 'r', 23.8],
    ['    25    14  |    84.000  102.375 21.9% |  0s', 'r', 21.9],
    ['H   37    11  |    96.500  101.250 4.92% |  1s', 'r', 4.92],
    ['    44     6  |    96.500  100.500 4.15% |  1s', 'r', 4.15],
    ['*   58     0  |   100.000  100.000 0.00% |  1s', 'r', 0],
    ['', 'b'],
    ['Explored 58 nodes (311 simplex iterations) in 1.07s', 'h'],
    ['Optimal solution found (tolerance 1.00e-04)', 'ok'],
    ['Best objective 1.000e+02, bound 1.000e+02, gap 0.00%', 'ok']
  ];
  var GAP0 = 84.4;

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function lineHTML(l) {
    var t = esc(l[0]);
    if (l[1] === 'r') t = t.replace(/^([H*])/, '<b class="sl-mark">$1</b>').replace(/(\d+\.\d+%)/, '<b class="sl-gap">$1</b>');
    return '<span class="sl-' + l[1] + '">' + t + '</span>';
  }

  function run(fig) {
    var svg = fig.querySelector('.board-svg'), ink = fig.querySelector('.board-ink'), pen = fig.querySelector('.board-pen'),
        eraser = fig.querySelector('.board-eraser'), logEl = fig.querySelector('.solver-log'),
        gmBar = fig.querySelector('.gm-track i'), gmVal = fig.querySelector('.gm-val'), gm = fig.querySelector('.gapmeter'),
        stamp = svg.querySelector('.bd-stamp'), circle = svg.querySelector('.bd-circle');

    // collect writable tokens in document order
    var toks = [];
    svg.querySelectorAll('.bd-ink > text, .bd-ink > path.bd-stroke:not(.bd-circle)').forEach(function (el) {
      if (el.tagName.toLowerCase() === 'text') {
        var r = svg.querySelector('clipPath rect[data-i="' + el.getAttribute('data-i') + '"]');
        var w = parseFloat(r.getAttribute('width'));
        toks.push({ el: el, rect: r, w: w, x: parseFloat(r.getAttribute('x')), y: parseFloat(el.getAttribute('y')),
                    z: parseFloat(el.getAttribute('font-size')), dur: Math.max(.24, w * .0024) });
      } else {
        var L = el.getTotalLength(); el.style.strokeDasharray = L + ' ' + L;
        toks.push({ el: el, L: L, dur: .42 });
      }
    });
    var CL = circle.getTotalLength(); circle.style.strokeDasharray = CL + ' ' + CL;

    function setTok(k, f) {
      if (k.rect) k.rect.setAttribute('width', (k.w * f).toFixed(1));
      else k.el.style.strokeDashoffset = (k.L * (1 - f)).toFixed(1);
    }
    function penAt(x, y) { pen.style.left = (x / VBW * 100) + '%'; pen.style.top = (y / VBH * 100) + '%'; }
    function gap(v) {
      if (v == null) { gmBar.style.width = '100%'; gmVal.textContent = '–'; gm.classList.remove('done'); return; }
      gmBar.style.width = Math.max(0, v / GAP0 * 100) + '%'; gmVal.textContent = v.toFixed(2) + '%'; gm.classList.toggle('done', v === 0);
    }
    function showLog(n) { logEl.innerHTML = LOG.slice(0, n).map(lineHTML).join('\n') + (n < LOG.length ? '\n<span class="sl-cur"></span>' : ''); }

    function finalState() {
      toks.forEach(function (k) { setTok(k, 1); }); circle.style.strokeDashoffset = 0; stamp.classList.add('on');
      showLog(LOG.length); gap(0); pen.classList.remove('on');
    }
    if (reduce) { finalState(); var rb = fig.querySelector('.board-replay'); if (rb) rb.hidden = true; return; }

    // ---- build the timeline
    var plan = [], at = .25;
    toks.forEach(function (k, i) {
      var prevY = i ? (toks[i - 1].y || 0) : 0, newLine = k.y && prevY && Math.abs(k.y - prevY) > 30;
      at += i ? (newLine ? .38 : .12) : 0; plan.push({ s: at, e: at + k.dur, k: k }); at += k.dur;
    });
    var tWritten = at, logPlan = [], lt = tWritten + .35;
    LOG.forEach(function (l, i) { logPlan.push(lt); lt += l[1] === 'r' ? .34 : l[1] === 'b' ? .06 : .16; });
    var tCircle = lt + .2, tStamp = tCircle + .85, total = tStamp + .6;

    var t0 = null, playing = false, raf = 0, shown = -1;
    function frame(now) {
      if (t0 === null) t0 = now;
      var t = (now - t0) / 1000, cur = null;
      plan.forEach(function (p) {
        var f = Math.max(0, Math.min(1, (t - p.s) / (p.e - p.s))); setTok(p.k, f);
        if (t >= p.s - .1 && t <= p.e + .1) cur = { p: p, f: f };
      });
      if (cur) {
        var k = cur.p.k, pt;
        if (k.rect) pt = { x: k.x + 6 + k.w * cur.f - 6, y: k.y - k.z * .34 + Math.sin(t * 40) * k.z * .16 };
        else pt = k.el.getPointAtLength(k.L * cur.f);
        penAt(pt.x, pt.y); pen.classList.add('on');
      } else if (t > tCircle - .1 && t < tStamp + .05) {
        var cf = Math.max(0, Math.min(1, (t - tCircle) / .8)), ease = 1 - Math.pow(1 - cf, 2);
        circle.style.strokeDashoffset = CL * (1 - ease); var cp = circle.getPointAtLength(CL * ease);
        penAt(cp.x, cp.y); pen.classList.add('on');
      } else pen.classList.remove('on');
      // log
      var n = 0; while (n < LOG.length && t >= logPlan[n]) n++;
      if (n !== shown) {
        shown = n; showLog(n);
        for (var j = n - 1; j >= 0; j--) if (LOG[j][1] === 'r') { gap(LOG[j][2]); break; }
        if (n && j < 0) gap(null);
      }
      if (t >= tStamp) stamp.classList.add('on');
      if (t < total) raf = requestAnimationFrame(frame);
      else { playing = false; pen.classList.remove('on'); }
    }
    function reset() {
      toks.forEach(function (k) { setTok(k, 0); }); circle.style.strokeDashoffset = CL; stamp.classList.remove('on');
      logEl.innerHTML = '<span class="sl-cur"></span>'; gap(null); shown = -1;
    }
    function play() {
      if (playing) return; playing = true; t0 = null; reset(); raf = requestAnimationFrame(frame);
    }
    function replay() {
      if (playing) return;
      playing = true; ink.classList.add('erasing'); eraser.classList.add('on');
      setTimeout(function () { ink.classList.remove('erasing'); eraser.classList.remove('on'); playing = false; play(); }, 750);
    }
    reset();
    var btn = fig.querySelector('.board-replay'); if (btn) btn.addEventListener('click', replay);
    function start() {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); play(); } }, { threshold: .45 });
        io.observe(fig.querySelector('.board'));
      } else play();
    }
    // wait for the marker font so the reveal matches the glyphs
    if (document.fonts && document.fonts.load) {
      var done = false, go = function () { if (!done) { done = true; start(); } };
      document.fonts.load('44px "Permanent Marker"').then(go, go); setTimeout(go, 2500);
    } else start();
  }
  function init() { document.querySelectorAll('.board-wrap').forEach(run); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
