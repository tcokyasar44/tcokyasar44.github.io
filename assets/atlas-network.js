/* ATLAS network animation for tanercokyasar.com
   A small transportation system drawn on <canvas>: roads, a bus loop with a terminal charger,
   a freight corridor, EV charging hubs, a drone depot with battery-swap stations, and shared
   autonomous cars picking up riders. An "optimizer" periodically traces a route.
   Two modes:
     data-mode="ambient"  faint traffic behind the home-page hero
     data-mode="showcase" the research banner with a legend that features one theme at a time
   Respects prefers-reduced-motion (draws one still frame) and pauses when off-screen. */
(function () {
  var still = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var THEMES = [
    { key: 'ev', name: 'EV charging & electrification', sub: 'Where to build chargers and how fleets use them' },
    { key: 'bus', name: 'Transit & electric bus fleets', sub: 'Scheduling buses and charging together' },
    { key: 'freight', name: 'Freight & supply chains', sub: 'Supplier choice, trucking markets, delivery' },
    { key: 'drone', name: 'Drones & last-mile delivery', sub: 'Battery-swap networks and drone-truck fleets' },
    { key: 'mob', name: 'Shared & autonomous mobility', sub: 'Matching riders and vehicles at scale' }
  ];

  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function cssRGB(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    var s = document.createElement('span'); s.style.color = v; s.style.display = 'none'; document.body.appendChild(s);
    var m = getComputedStyle(s).color.match(/[\d.]+/g); s.remove(); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }

  function Scene(canvas) {
    var mode = canvas.getAttribute('data-mode') || 'showcase';
    var ambient = mode === 'ambient';
    var ctx = canvas.getContext('2d');
    var C = {}, W = 0, H = 0, small = false;
    var nodes = [], adj = [], edges = [], cols, rows;
    var hubs = [], busLoop = [], corridor = [], depot = -1, swaps = [], riders = [];
    var agents = [], trace = null, traceT = 0, feat = 0, featT = 0, hover = -1, t = 0, last = 0, run = false, raf = 0, rand = rnd(42);
    var legend = canvas.parentNode.querySelector('[data-legend]');

    function colors() {
      C.bg = cssRGB('--surface-2', '#f5f1ec'); C.line = cssRGB('--line', '#e7e1d9'); C.text = cssRGB('--text', '#1d1a17');
      C.muted = cssRGB('--muted', '#5f5852'); C.maroon = cssRGB('--maroon', '#500000'); C.gold = cssRGB('--gold', '#b8860b');
      C.ev = cssRGB('--c-ev', '#2f7d6d'); C.bus = cssRGB('--c-bus', '#8c1d1d'); C.freight = cssRGB('--c-freight', '#b07a10');
      C.drone = cssRGB('--c-drone', '#2f5f98'); C.mob = cssRGB('--c-mob', '#7a4e9a'); C.surface = cssRGB('--surface', '#ffffff');
    }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }

    function build() {
      rand = rnd(42);
      cols = small ? 8 : (ambient ? 14 : 13); rows = small ? 6 : (ambient ? 7 : 6);
      var padX = ambient ? 0 : 34, padY = ambient ? 0 : 30;
      var gw = (W - 2 * padX) / (cols - 1), gh = (H - 2 * padY) / (rows - 1);
      nodes = []; adj = []; edges = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var jx = (c === 0 || c === cols - 1) ? 0 : (rand() - .5) * gw * .35, jy = (r === 0 || r === rows - 1) ? 0 : (rand() - .5) * gh * .35;
        nodes.push({ x: padX + c * gw + jx, y: padY + r * gh + jy, r: r, c: c }); adj.push([]);
      }
      function id(r, c) { return r * cols + c; }
      function link(a, b) { adj[a].push(b); adj[b].push(a); edges.push([a, b]); }
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        if (c + 1 < cols && (r === 2 || rand() < .88)) link(id(r, c), id(r, c + 1));
        if (r + 1 < rows && rand() < .8) link(id(r, c), id(r + 1, c));
      }
      // make sure every node has a neighbour
      nodes.forEach(function (n, i) { if (!adj[i].length) link(i, n.c + 1 < cols ? i + 1 : i - 1); });
      // freight corridor along row 2 (left supplier -> right customers)
      corridor = []; for (c = 0; c < cols; c++) corridor.push(id(2, c));
      // bus loop: rectangle of nodes on the right-lower part
      var c0 = Math.max(1, Math.floor(cols * .52)), c1 = Math.min(cols - 2, c0 + (small ? 3 : 4)), r0 = 3, r1 = rows - 2;
      busLoop = [];
      for (c = c0; c <= c1; c++) busLoop.push(id(r0, c));
      for (r = r0 + 1; r <= r1; r++) busLoop.push(id(r, c1));
      for (c = c1 - 1; c >= c0; c--) busLoop.push(id(r1, c));
      for (r = r1 - 1; r > r0; r--) busLoop.push(id(r, c0));
      for (var k = 0; k < busLoop.length; k++) { var a = busLoop[k], b = busLoop[(k + 1) % busLoop.length]; if (adj[a].indexOf(b) < 0) link(a, b); }
      // EV charging hubs, drone depot and swap stations
      hubs = [id(1, Math.floor(cols * .2)), id(rows - 2, Math.floor(cols * .3)), id(1, Math.floor(cols * .72))];
      depot = id(rows - 1, 1); swaps = [id(4 < rows ? 4 : rows - 2, Math.floor(cols * .42)), id(0, Math.floor(cols * .45)), id(rows - 1, cols - 2)];
      riders = [];
      makeAgents();
    }

    function path(a, b) { // BFS shortest path on the road graph
      var prev = new Array(nodes.length).fill(-1), q = [a], seen = {}; seen[a] = 1;
      while (q.length) { var u = q.shift(); if (u === b) break; for (var i = 0; i < adj[u].length; i++) { var v = adj[u][i]; if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); } } }
      var p = [b]; while (p[0] !== a && prev[p[0]] >= 0) p.unshift(prev[p[0]]); return p[0] === a ? p : [a];
    }
    function randNode() { return Math.floor(rand() * nodes.length); }

    function makeAgents() {
      agents = [];
      var nEV = ambient ? 10 : (small ? 5 : 8), nCar = ambient ? 8 : (small ? 3 : 5);
      for (var i = 0; i < nEV; i++) agents.push(newEV(i * 0.17));
      for (i = 0; i < 3; i++) agents.push({ k: 'bus', i: Math.floor(i * busLoop.length / 3), s: 0, dwell: 0, v: 0.55 });
      for (i = 0; i < (ambient ? 4 : 3); i++) agents.push({ k: 'freight', dir: i % 2 ? -1 : 1, s: rand() * (cols - 1), v: 0.7 + rand() * .3 });
      for (i = 0; i < (small ? 2 : 3); i++) agents.push({ k: 'drone', leg: 0, s: rand(), target: randNode(), via: swaps[i % swaps.length], swap: 0 });
      for (i = 0; i < nCar; i++) agents.push(newCar());
    }
    function newEV(phase) { var a = randNode(), h = hubs[Math.floor(rand() * hubs.length)]; return { k: 'ev', p: path(a, h), s: phase || 0, stage: 'toHub', charge: rand() * .4, v: 1.1 + rand() * .5 }; }
    function newCar() { var a = randNode(), rd = randNode(); riders.push(rd); return { k: 'mob', p: path(a, rd), s: 0, stage: 'pickup', rider: rd, v: 1.2 + rand() * .4 }; }

    function posOnPath(p, s) { var i = Math.min(p.length - 1, Math.floor(s)), j = Math.min(p.length - 1, i + 1), f = s - i, A = nodes[p[i]], B = nodes[p[j]]; return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, ang: Math.atan2(B.y - A.y, B.x - A.x) }; }

    function step(dt) {
      agents.forEach(function (a) {
        if (a.k === 'ev') {
          if (a.stage === 'charging') { a.charge += dt * .35; if (a.charge >= 1) { a.stage = 'out'; a.p = path(a.p[a.p.length - 1], randNode()); a.s = 0; } return; }
          a.s += dt * a.v; a.charge = Math.max(0, a.charge - dt * .02);
          if (a.s >= a.p.length - 1) {
            if (a.stage === 'toHub') { a.stage = 'charging'; a.s = a.p.length - 1; }
            else { var n = newEV(); a.p = path(a.p[a.p.length - 1], n.p[n.p.length - 1]); a.s = 0; a.stage = 'toHub'; }
          }
        } else if (a.k === 'bus') {
          if (a.dwell > 0) { a.dwell -= dt; return; }
          a.s += dt * a.v; if (a.s >= 1) { a.s = 0; a.i = (a.i + 1) % busLoop.length; if (a.i === 0) a.dwell = 1.6; else if (a.i % 3 === 0) a.dwell = .35; }
        } else if (a.k === 'freight') {
          a.s += dt * a.v * a.dir; if (a.s > cols - 1) a.s = 0; if (a.s < 0) a.s = cols - 1;
        } else if (a.k === 'drone') {
          if (a.swap > 0) { a.swap -= dt; return; }
          a.s += dt * .38;
          if (a.s >= 1) { a.s = 0; a.leg = (a.leg + 1) % 4; if (a.leg === 1 || a.leg === 3) a.swap = .7; if (a.leg === 0) { a.target = randNode(); } }
        } else if (a.k === 'mob') {
          a.s += dt * a.v;
          if (a.s >= a.p.length - 1) {
            var end = a.p[a.p.length - 1];
            if (a.stage === 'pickup') { var ri = riders.indexOf(a.rider); if (ri >= 0) riders.splice(ri, 1); a.stage = 'dropoff'; a.p = path(end, randNode()); a.s = 0; }
            else { var nc = newCar(); a.p = path(end, nc.rider); a.rider = nc.rider; a.s = 0; a.stage = 'pickup'; }
          }
        }
      });
      // optimizer trace: a fresh optimal route every few seconds
      traceT += dt;
      if (!trace || traceT > (ambient ? 5.5 : 4.2)) {
        traceT = 0; var a = randNode(), b = randNode(); var p = path(a, b); if (p.length < 4) { var q = path(a, (a + Math.floor(nodes.length / 2)) % nodes.length); p = q; }
        trace = { p: p, born: t };
      }
      if (!ambient) { featT += dt; if (hover >= 0) { feat = hover; featT = 0; } else if (featT > 3.6) { featT = 0; feat = (feat + 1) % THEMES.length; syncLegend(); } }
    }

    function alphaFor(kind) { if (ambient) return .9; var f = THEMES[feat].key; return kind === f ? 1 : .38; }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (!ambient) { ctx.fillStyle = rgba(C.bg); ctx.fillRect(0, 0, W, H); }
      // roads
      ctx.lineCap = 'round';
      edges.forEach(function (e) { var A = nodes[e[0]], B = nodes[e[1]]; ctx.strokeStyle = rgba(C.line, ambient ? .9 : 1); ctx.lineWidth = ambient ? 1.2 : 3; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); });
      if (!ambient) {
        // freight corridor and bus loop overlays
        line(corridor, rgba(C.freight, .35 * alphaFor('freight') + .1), 6);
        line(busLoop.concat([busLoop[0]]), rgba(C.bus, .3 * alphaFor('bus') + .08), 5);
      }
      // optimizer route
      if (trace) {
        var age = t - trace.born, k = Math.min(1, age / 1.4), n = 1 + (trace.p.length - 1) * k;
        var fade = Math.max(0, 1 - Math.max(0, age - 2.6) / 1.4);
        ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 18;
        ctx.strokeStyle = rgba(C.maroon, (ambient ? .55 : .8) * fade); ctx.lineWidth = ambient ? 2 : 2.6; ctx.beginPath();
        for (var i = 0; i < n && i < trace.p.length; i++) { var P = i <= n - 1 ? nodes[trace.p[i]] : null; if (P) { if (i === 0) ctx.moveTo(P.x, P.y); else ctx.lineTo(P.x, P.y); } }
        var tip = posOnPath(trace.p, Math.min(trace.p.length - 1, n - 1)); ctx.lineTo(tip.x, tip.y); ctx.stroke(); ctx.restore();
        dot(tip.x, tip.y, ambient ? 3.5 : 4.5, rgba(C.maroon, fade)); halo(tip.x, tip.y, 12, C.maroon, .35 * fade);
      }
      // nodes
      if (!ambient) nodes.forEach(function (n) { dot(n.x, n.y, 2.2, rgba(C.muted, .45)); });
      else nodes.forEach(function (n) { dot(n.x, n.y, 2.4, rgba(C.line, 1)); });
      // facilities
      if (!ambient) hubs.forEach(function (h) { var N = nodes[h], busy = agents.some(function (a) { return a.k === 'ev' && a.stage === 'charging' && a.p[a.p.length - 1] === h; });
        facility(N.x, N.y, C.ev, alphaFor('ev'), 'bolt', busy); });
      var term = nodes[busLoop[0]], busAt = agents.some(function (a) { return a.k === 'bus' && a.i === 0 && a.dwell > 0; });
      if (!ambient) facility(term.x, term.y, C.bus, alphaFor('bus'), 'bolt', busAt);
      if (!ambient) { facility(nodes[corridor[0]].x, nodes[corridor[0]].y, C.freight, alphaFor('freight'), 'box', false); facility(nodes[corridor[corridor.length - 1]].x, nodes[corridor[corridor.length - 1]].y, C.freight, alphaFor('freight'), 'box', false); }
      if (!ambient) facility(nodes[depot].x, nodes[depot].y, C.drone, alphaFor('drone'), 'home', false);
      if (!ambient) swaps.forEach(function (s) { var N = nodes[s], busy = agents.some(function (a) { return a.k === 'drone' && a.swap > 0 && (a.leg === 1 || a.leg === 3) && a.via === s; }); facility(N.x, N.y, C.drone, alphaFor('drone') * .9, 'swap', busy); });
      // riders waiting
      if (!ambient) riders.forEach(function (r, i) { var N = nodes[r], pulse = .5 + .5 * Math.sin(t * 4 + i); ctx.strokeStyle = rgba(C.mob, alphaFor('mob') * (.4 + .4 * pulse)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(N.x, N.y, 5 + pulse * 3, 0, 6.283); ctx.stroke(); dot(N.x, N.y, 2.6, rgba(C.mob, alphaFor('mob'))); });
      // vehicles
      agents.forEach(function (a) {
        if (a.k === 'ev') { var P = posOnPath(a.p, a.s); vehicle(P.x, P.y, P.ang, C.ev, alphaFor('ev'), ambient ? 8 : 14, ambient ? 5 : 8); if (!ambient) battery(P.x, P.y - 11, a.charge, alphaFor('ev')); }
        else if (a.k === 'bus') { var p2 = [busLoop[a.i], busLoop[(a.i + 1) % busLoop.length]], Q = posOnPath(p2, a.s); if (!ambient) vehicle(Q.x, Q.y, Q.ang, C.bus, alphaFor('bus'), 21, 9); }
        else if (a.k === 'freight') { var i0 = Math.floor(a.s), Rr = posOnPath(corridor, a.s); if (!ambient) vehicle(Rr.x, Rr.y + (a.dir > 0 ? -4 : 4), a.dir > 0 ? 0 : Math.PI, C.freight, alphaFor('freight'), 19, 9); else vehicle(Rr.x, Rr.y, 0, C.freight, .8, 8, 5); }
        else if (a.k === 'drone') { drone(a); }
        else if (a.k === 'mob') { var M = posOnPath(a.p, a.s); vehicle(M.x, M.y, M.ang, C.mob, alphaFor('mob'), ambient ? 8 : 13, ambient ? 5 : 8); if (a.stage === 'dropoff' && !ambient) dot(M.x, M.y, 2, rgba(C.surface, 1)); }
      });
      if (!ambient) label();
    }

    function line(ids, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); ids.forEach(function (n, i) { var N = nodes[n]; if (i) ctx.lineTo(N.x, N.y); else ctx.moveTo(N.x, N.y); }); ctx.stroke(); }
    function dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    function halo(x, y, r, c, a) { var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    function vehicle(x, y, ang, c, a, L, Wd) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = a;
      ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-L / 2, -Wd / 2, L, Wd, Wd / 2.4) : ctx.rect(-L / 2, -Wd / 2, L, Wd); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(L / 2 - 3, -Wd / 2 + 1.2, 1.6, Wd - 2.4); ctx.restore(); ctx.globalAlpha = 1;
    }
    function battery(x, y, f, a) {
      ctx.globalAlpha = a * .95; ctx.strokeStyle = rgba(C.text, .55); ctx.lineWidth = 1; ctx.strokeRect(x - 6, y - 3, 11, 6); ctx.fillStyle = rgba(C.text, .55); ctx.fillRect(x + 5, y - 1.5, 1.5, 3);
      ctx.fillStyle = rgba(f < .25 ? C.maroon : C.ev); ctx.fillRect(x - 5, y - 2, 9 * Math.max(0, Math.min(1, f)), 4); ctx.globalAlpha = 1;
    }
    function facility(x, y, c, a, kind, busy) {
      var R = ambient ? 7 : 10, pulse = busy ? (.5 + .5 * Math.sin(t * 6)) : 0;
      if (busy) halo(x, y, R * 2.8, c, .35 * a + .2 * pulse);
      ctx.globalAlpha = a; ctx.fillStyle = rgba(C.surface); ctx.strokeStyle = rgba(c); ctx.lineWidth = ambient ? 1.5 : 2;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.fillStyle = rgba(c); ctx.strokeStyle = rgba(c); ctx.lineWidth = 1.4;
      var u = R * .55; ctx.beginPath();
      if (kind === 'bolt') { ctx.moveTo(x + u * .2, y - u); ctx.lineTo(x - u * .55, y + u * .15); ctx.lineTo(x - u * .05, y + u * .15); ctx.lineTo(x - u * .25, y + u); ctx.lineTo(x + u * .6, y - u * .2); ctx.lineTo(x + u * .1, y - u * .2); ctx.closePath(); ctx.fill(); }
      else if (kind === 'box') { ctx.rect(x - u * .7, y - u * .6, u * 1.4, u * 1.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - u * .7, y - u * .1); ctx.lineTo(x + u * .7, y - u * .1); ctx.stroke(); }
      else if (kind === 'home') { ctx.moveTo(x - u * .8, y); ctx.lineTo(x, y - u * .8); ctx.lineTo(x + u * .8, y); ctx.lineTo(x + u * .8, y + u * .7); ctx.lineTo(x - u * .8, y + u * .7); ctx.closePath(); ctx.fill(); }
      else if (kind === 'swap') { ctx.rect(x - u * .55, y - u * .7, u * 1.1, u * 1.4); ctx.stroke(); ctx.fillRect(x - u * .35, y - u * .5 + (1 - (busy ? (t * 1.5 % 1) : 1)) * u, u * .7, u * (busy ? (t * 1.5 % 1) : 1) * .9); }
      ctx.globalAlpha = 1;
    }
    function drone(a) {
      var D = nodes[depot], S = nodes[a.via], T = nodes[a.target];
      var legs = [[D, S], [S, T], [T, S], [S, D]], L = legs[a.leg], A = L[0], B = L[1], s = a.s;
      var x = A.x + (B.x - A.x) * s, y = A.y + (B.y - A.y) * s - Math.sin(s * Math.PI) * (ambient ? 14 : 26), al = alphaFor('drone');
      // flight trail
      if (!ambient) { ctx.save(); ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(C.drone, .35 * al); ctx.lineWidth = 1.3; ctx.beginPath();
        for (var k = 0; k <= 20; k++) { var q = k / 20, xx = A.x + (B.x - A.x) * q, yy = A.y + (B.y - A.y) * q - Math.sin(q * Math.PI) * 26; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); ctx.restore(); }
      // shadow
      ctx.fillStyle = rgba(C.text, .12 * al); ctx.beginPath(); ctx.ellipse(A.x + (B.x - A.x) * s, A.y + (B.y - A.y) * s + 3, 6, 2, 0, 0, 6.283); ctx.fill();
      var z = ambient ? .75 : 1.25, arm = 6 * z; ctx.globalAlpha = al; ctx.strokeStyle = rgba(C.drone); ctx.lineWidth = 1.6 * z;
      ctx.beginPath(); ctx.moveTo(x - arm, y - arm); ctx.lineTo(x + arm, y + arm); ctx.moveTo(x + arm, y - arm); ctx.lineTo(x - arm, y + arm); ctx.stroke();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (o, i) { ctx.save(); ctx.translate(x + o[0] * arm, y + o[1] * arm); ctx.rotate(t * 30 + i); ctx.strokeStyle = rgba(C.drone, .8); ctx.beginPath(); ctx.moveTo(-3.4 * z, 0); ctx.lineTo(3.4 * z, 0); ctx.stroke(); ctx.restore(); });
      dot(x, y, 2.6 * z, rgba(C.drone)); ctx.globalAlpha = 1;
    }
    function label() {
      var th = THEMES[feat], px = small ? 11 : 13, x = 14, y = 14;
      ctx.font = '600 ' + px + 'px "Public Sans", system-ui, sans-serif'; var w1 = ctx.measureText(th.name).width;
      ctx.font = '400 ' + (px - 1) + 'px "Public Sans", system-ui, sans-serif'; var w2 = small ? 0 : ctx.measureText(th.sub).width;
      var w = Math.max(w1, w2) + 34, h = small ? 26 : 44;
      ctx.fillStyle = rgba(C.surface, .92); ctx.strokeStyle = rgba(C.line); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
      dot(x + 14, y + 13, 4.5, rgba(C[th.key])); ctx.fillStyle = rgba(C.text); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = '600 ' + px + 'px "Public Sans", system-ui, sans-serif'; ctx.fillText(th.name, x + 25, y + 13.5);
      if (!small) { ctx.fillStyle = rgba(C.muted); ctx.font = '400 ' + (px - 1) + 'px "Public Sans", system-ui, sans-serif'; ctx.fillText(th.sub, x + 25, y + 31); }
    }

    function syncLegend() { if (!legend) return; legend.querySelectorAll('[data-k]').forEach(function (b, i) { b.setAttribute('aria-pressed', i === feat ? 'true' : 'false'); }); }
    if (legend) legend.querySelectorAll('[data-k]').forEach(function (b, i) {
      b.addEventListener('mouseenter', function () { hover = i; feat = i; syncLegend(); if (!run) frameStill(); });
      b.addEventListener('focus', function () { hover = i; feat = i; syncLegend(); if (!run) frameStill(); });
      b.addEventListener('mouseleave', function () { hover = -1; });
      b.addEventListener('blur', function () { hover = -1; });
    });

    function layout() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!r.width || !r.height) return false;
      W = r.width; H = r.height; small = W < 620; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors(); build(); return true;
    }
    function frame(now) { var dt = Math.min(.05, (now - (last || now)) / 1000); last = now; t += dt; step(dt); draw(); if (run) raf = requestAnimationFrame(frame); }
    function frameStill() { for (var i = 0; i < 90; i++) { t += 1 / 30; step(1 / 30); } draw(); }
    function start() { if (run || still.matches) { if (still.matches) frameStill(); return; } run = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { run = false; cancelAnimationFrame(raf); }

    if (!layout()) return;
    syncLegend(); frameStill();
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible && !document.hidden ? start() : stop(); }).observe(canvas); else start();
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (visible && start()); });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (layout()) draw(); }, 150); });
    new MutationObserver(function () { colors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (still.addEventListener) still.addEventListener('change', function () { still.matches ? stop() : start(); });
  }

  function init() { document.querySelectorAll('canvas.atlas-net').forEach(function (c) { try { Scene(c); } catch (e) { /* keep the page usable */ } }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
