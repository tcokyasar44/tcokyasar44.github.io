/* ATLAS city — a 2.5D animated city for the research banner on tanercokyasar.com.
   Blocks of buildings with a downtown of skyscrapers, roads, parks, and five systems from the research:
   electric vans and charging hubs, an electric bus loop with a terminal charger, a freight corridor
   between a supplier, a distribution center and customers, drones flying from a depot through
   battery-swap stations, and shared autonomous cars picking up riders. A dashed line traces an
   optimized route. The camera sways slowly and follows the pointer a little.
   Canvas only, no libraries. Still frame for prefers-reduced-motion; pauses when off-screen. */
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
  function cssRGB(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
    var s = document.createElement('span'); s.style.color = v; s.style.display = 'none'; document.body.appendChild(s);
    var m = getComputedStyle(s).color.match(/[\d.]+/g); s.remove(); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }

  function City(canvas) {
    var ctx = canvas.getContext('2d'), legend = canvas.parentNode.querySelector('[data-legend]');
    var C = {}, dark = false, W = 0, H = 0, small = false, S = 1, OX = 0, OY = 0, TILT = .52, HZ = .95;
    var cols, rows, nodes = [], adj = [], blocks = [], parks = {}, corridor = [], busLoop = [], hubs = [], depot, swaps = [], dc, supplier, customer, riders = [];
    var agents = [], trace = null, traceT = 0, feat = 0, featT = 0, hover = -1, t = 0, last = 0, run = false, raf = 0;
    var maxH = 1, yaw = .36, cx = 0, cy = 0, cosA = 1, sinA = 0, rand;
    var Z0 = 1.3, zoom = Z0, panX = 0, panY = 0, base = 1, spin = true, lastInteract = -99, dragging = false, active = false;

    function colors() {
      var cs = getComputedStyle(document.documentElement);
      C.surface = cssRGB('--surface', '#fff'); C.bg2 = cssRGB('--surface-2', '#f5f1ec'); C.text = cssRGB('--text', '#1d1a17');
      C.line = cssRGB('--line', '#e7e1d9'); C.muted = cssRGB('--muted', '#5f5852'); C.maroon = cssRGB('--maroon', '#500000'); C.gold = cssRGB('--gold', '#b8860b');
      C.ev = cssRGB('--c-ev', '#2f7d6d'); C.bus = cssRGB('--c-bus', '#8c1d1d'); C.freight = cssRGB('--c-freight', '#a8740c'); C.drone = cssRGB('--c-drone', '#2f5f98'); C.mob = cssRGB('--c-mob', '#7a4e9a');
      dark = (C.surface[0] + C.surface[1] + C.surface[2]) < 300;
      C.road = dark ? mix(C.bg2, C.surface, .2) : mix(C.bg2, C.text, .1);
      C.lot = dark ? mix(C.bg2, C.text, .07) : mix(C.bg2, C.surface, .55);
      C.bTop = dark ? mix(C.surface, C.text, .2) : mix(C.surface, C.text, .02);
      C.bL = dark ? mix(C.surface, C.text, .1) : mix(C.surface, C.text, .13);
      C.bR = dark ? mix(C.surface, C.text, .05) : mix(C.surface, C.text, .24);
      C.park = dark ? [52, 84, 62] : [196, 220, 190]; C.tree = dark ? [74, 120, 86] : [118, 168, 116];
      C.win = dark ? [233, 196, 106] : mix(C.surface, C.text, .32);
    }

    // ---------- world ----------
    function id(r, c) { return r * cols + c; }
    function build() {
      rand = rnd(7);
      cols = small ? 8 : 12; rows = small ? 6 : 7;
      nodes = []; adj = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) { nodes.push({ x: c, y: r }); adj.push([]); }
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) { if (c + 1 < cols) link(id(r, c), id(r, c + 1)); if (r + 1 < rows) link(id(r, c), id(r + 1, c)); }
      cx = (cols - 1) / 2; cy = (rows - 1) / 2;
      var cr = 2; corridor = []; for (c = 0; c < cols; c++) corridor.push(id(cr, c));
      var c0 = Math.floor(cols * .55), c1 = Math.min(cols - 2, c0 + (small ? 2 : 3)), r0 = 3, r1 = rows - 2;
      busLoop = [];
      for (c = c0; c <= c1; c++) busLoop.push(id(r0, c)); for (r = r0 + 1; r <= r1; r++) busLoop.push(id(r, c1));
      for (c = c1 - 1; c >= c0; c--) busLoop.push(id(r1, c)); for (r = r1 - 1; r > r0; r--) busLoop.push(id(r, c0));
      hubs = [id(1, Math.floor(cols * .22)), id(rows - 2, Math.floor(cols * .3)), id(1, Math.floor(cols * .75))];
      depot = id(rows - 1, 1); swaps = [id(rows - 2, Math.floor(cols * .45)), id(0, Math.floor(cols * .5)), id(rows - 1, cols - 2)];
      // blocks (cells) with their contents
      blocks = []; parks = {}; maxH = .6;
      var dtx = cols * .36, dty = rows * .4;
      var parkCells = small ? [[1, 3]] : [[2, 4], [8, 0]];
      parkCells.forEach(function (p) { parks[p[0] + ',' + p[1]] = 1; });
      supplier = [0, cr - 1]; dc = [Math.floor(cols / 2) - 1, cr]; customer = [cols - 2, cr - 1];
      for (r = 0; r < rows - 1; r++) for (c = 0; c < cols - 1; c++) {
        var key = c + ',' + r, b = { c: c, r: r, items: [] };
        if (parks[key]) { b.park = true; for (var k = 0; k < 7; k++) b.items.push({ tree: true, x: c + .22 + rand() * .56, y: r + .22 + rand() * .56, s: .07 + rand() * .05 }); blocks.push(b); continue; }
        if (c === supplier[0] && r === supplier[1]) { b.items.push(box(c + .18, r + .2, c + .82, r + .8, .3, 'freight', 'Supplier')); blocks.push(b); continue; }
        if (c === dc[0] && r === dc[1]) { b.items.push(box(c + .14, r + .18, c + .86, r + .82, .34, 'freight', 'Distribution center')); blocks.push(b); continue; }
        if (c === customer[0] && r === customer[1]) { b.items.push(box(c + .2, r + .2, c + .8, r + .8, .5, 'freight', 'Customers')); blocks.push(b); continue; }
        if (c === 0 && r === rows - 2) { b.items.push(box(c + .2, r + .25, c + .8, r + .8, .16, 'drone', 'Drone depot')); blocks.push(b); continue; }
        var d2 = Math.pow(c + .5 - dtx, 2) + Math.pow((r + .5 - dty) * 1.4, 2), tall = Math.exp(-d2 / (small ? 4 : 7));
        var split = rand() < .55 ? 2 : 1, m = .19, g = .08, w = (1 - 2 * m - (split - 1) * g) / split;
        for (var i = 0; i < split; i++) for (var j = 0; j < split; j++) {
          var x0 = c + m + i * (w + g), y0 = r + m + j * (w + g), h = .12 + rand() * .26 + tall * (.8 + rand() * 1.5);
          if (rand() < .3 && tall < .3) continue;
          var bx = box(x0, y0, x0 + w, y0 + w, h, null); bx.sky = h > 1.05; maxH = Math.max(maxH, h); b.items.push(bx);
        }
        blocks.push(b);
      }
      riders = []; makeAgents();
    }
    function link(a, b) { adj[a].push(b); adj[b].push(a); }
    function box(x0, y0, x1, y1, h, kind, label) { return { x0: x0, y0: y0, x1: x1, y1: y1, h: h, kind: kind, label: label }; }
    function path(a, b) {
      var prev = new Array(nodes.length).fill(-1), q = [a], seen = {}; seen[a] = 1;
      while (q.length) { var u = q.shift(); if (u === b) break; var nb = adj[u].slice().sort(function () { return rand() - .5; });
        for (var i = 0; i < nb.length; i++) { var v = nb[i]; if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); } } }
      var p = [b]; while (p[0] !== a && prev[p[0]] >= 0) p.unshift(prev[p[0]]); return p[0] === a ? p : [a];
    }
    function randNode() { return Math.floor(rand() * nodes.length); }
    function makeAgents() {
      agents = [];
      var nEV = small ? 5 : 8, nCar = small ? 3 : 5;
      for (var i = 0; i < nEV; i++) agents.push(newEV(i * .4));
      for (i = 0; i < 3; i++) agents.push({ k: 'bus', i: Math.floor(i * busLoop.length / 3), s: 0, dwell: 0, v: .6 });
      for (i = 0; i < 3; i++) agents.push({ k: 'freight', dir: i % 2 ? -1 : 1, s: rand() * (cols - 1), v: .55 + rand() * .25 });
      for (i = 0; i < (small ? 2 : 3); i++) agents.push({ k: 'drone', leg: i % 4, s: rand(), target: randNode(), via: swaps[i % swaps.length], swap: 0 });
      for (i = 0; i < nCar; i++) agents.push(newCar());
    }
    function newEV(ph) { var a = randNode(), h = hubs[Math.floor(rand() * hubs.length)]; return { k: 'ev', p: path(a, h), s: ph || 0, stage: 'toHub', charge: rand() * .4, v: .9 + rand() * .4 }; }
    function newCar() { var a = randNode(), rd = randNode(); riders.push(rd); return { k: 'mob', p: path(a, rd), s: 0, stage: 'pickup', rider: rd, v: 1 + rand() * .4 }; }
    function onPath(p, s) { var i = Math.min(p.length - 1, Math.floor(s)), j = Math.min(p.length - 1, i + 1), f = s - i, A = nodes[p[i]], B = nodes[p[j]]; return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, dx: B.x - A.x, dy: B.y - A.y }; }

    function step(dt) {
      agents.forEach(function (a) {
        if (a.k === 'ev') {
          if (a.stage === 'charging') { a.charge += dt * .3; if (a.charge >= 1) { a.stage = 'out'; a.p = path(a.p[a.p.length - 1], randNode()); a.s = 0; } return; }
          a.s += dt * a.v; a.charge = Math.max(0, a.charge - dt * .03);
          if (a.s >= a.p.length - 1) { if (a.stage === 'toHub') { a.stage = 'charging'; a.s = a.p.length - 1; } else { var n = newEV(); a.p = path(a.p[a.p.length - 1], n.p[n.p.length - 1]); a.s = 0; a.stage = 'toHub'; } }
        } else if (a.k === 'bus') {
          if (a.dwell > 0) { a.dwell -= dt; return; }
          a.s += dt * a.v; if (a.s >= 1) { a.s = 0; a.i = (a.i + 1) % busLoop.length; if (a.i === 0) a.dwell = 1.8; else if (a.i % 2 === 0) a.dwell = .4; }
        } else if (a.k === 'freight') {
          a.s += dt * a.v * a.dir; if (a.s > cols - 1) a.s = 0; if (a.s < 0) a.s = cols - 1;
        } else if (a.k === 'drone') {
          if (a.swap > 0) { a.swap -= dt; return; }
          a.s += dt * .3; if (a.s >= 1) { a.s = 0; a.leg = (a.leg + 1) % 4; if (a.leg === 1 || a.leg === 3) a.swap = .8; if (a.leg === 0) a.target = randNode(); }
        } else if (a.k === 'mob') {
          a.s += dt * a.v;
          if (a.s >= a.p.length - 1) { var end = a.p[a.p.length - 1];
            if (a.stage === 'pickup') { var ri = riders.indexOf(a.rider); if (ri >= 0) riders.splice(ri, 1); a.stage = 'dropoff'; a.p = path(end, randNode()); a.s = 0; }
            else { var nc = newCar(); a.p = path(end, nc.rider); a.rider = nc.rider; a.s = 0; a.stage = 'pickup'; } }
        }
      });
      traceT += dt;
      if (!trace || traceT > 4.4) { traceT = 0; var p = []; while (p.length < 6) p = path(randNode(), randNode()); trace = { p: p, born: t }; }
      featT += dt; if (hover >= 0) { feat = hover; featT = 0; } else if (featT > 4) { featT = 0; feat = (feat + 1) % THEMES.length; syncLegend(); }
      if (spin && !dragging && t - lastInteract > 3.5) yaw += dt * .07;
    }

    // ---------- projection ----------
    function setCam() { cosA = Math.cos(yaw); sinA = Math.sin(yaw); }
    function rot(x, y) { var dx = x - cx, dy = y - cy; return [dx * cosA - dy * sinA, dx * sinA + dy * cosA]; }
    function P(x, y, z) { var r = rot(x, y); return [OX + r[0] * S, OY + r[1] * S * TILT - (z || 0) * S * HZ]; }
    function depth(x, y) { return rot(x, y)[1]; }
    function fit() {
      var R = Math.hypot(cols, rows) / 2 + .3;
      base = Math.min((W - 12) / (2 * R), (H - 16) / (2 * R * TILT + maxH * HZ * .9));
      S = base * zoom;
      OX = W / 2 + panX; OY = H / 2 + maxH * HZ * base * .38 + panY;
    }

    // ---------- drawing helpers ----------
    function quad(pts, fill, stroke) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .6; ctx.stroke(); } }
    function ground(x0, y0, x1, y1, z, fill) { quad([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill); }
    function prism(b, cTop, cL, cR, alpha, stripes) {
      var x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1, h = b.h;
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      // side faces: draw those whose outward normal points toward the viewer (positive screen depth)
      var faces = [[[x0, y1], [x1, y1], [0, 1]], [[x1, y0], [x1, y1], [1, 0]], [[x0, y0], [x1, y0], [0, -1]], [[x0, y0], [x0, y1], [-1, 0]]];
      faces.forEach(function (f) {
        var nrm = f[2][0] * sinA + f[2][1] * cosA; if (nrm <= 0) return;
        var shade = (f[2][0] * cosA - f[2][1] * sinA) > 0 ? cR : cL;
        var a = f[0], b2 = f[1]; quad([P(a[0], a[1], 0), P(b2[0], b2[1], 0), P(b2[0], b2[1], h), P(a[0], a[1], h)], rgba(shade));
        if (stripes && h > .5) { // window bands
          var n = Math.floor(h / .16); ctx.strokeStyle = rgba(C.win, dark ? .55 : .5); ctx.lineWidth = Math.max(.6, S * .012);
          for (var k = 1; k < n; k++) { var z = k * h / n, p1 = P(a[0], a[1], z), p2 = P(b2[0], b2[1], z); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
        }
      });
      quad([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], rgba(cTop), rgba(C.text, dark ? .25 : .12));
      ctx.globalAlpha = 1;
    }
    function dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    function halo(x, y, r, c, a) { var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    function A(kind) { return THEMES[feat].key === kind ? 1 : .42; }
    function vehicle(x, y, dx, dy, L, Wd, Hh, col, al) {
      var len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, vx = -uy, vy = ux, off = .07;
      x += vx * off; y += vy * off; off = 0; // keep right
      var hl = L / 2, hw = Wd / 2, c = [[x - ux * hl - vx * hw, y - uy * hl - vy * hw], [x + ux * hl - vx * hw, y + uy * hl - vy * hw], [x + ux * hl + vx * hw, y + uy * hl + vy * hw], [x - ux * hl + vx * hw, y - uy * hl + vy * hw]];
      ctx.globalAlpha = al;
      // shadow
      quad(c.map(function (q) { return P(q[0] + .02, q[1] + .03, 0); }), rgba(C.text, .14));
      // sides
      for (var i = 0; i < 4; i++) { var a = c[i], b = c[(i + 1) % 4], mx = (a[0] + b[0]) / 2 - x, my = (a[1] + b[1]) / 2 - y;
        if (mx * sinA + my * cosA <= 0) continue; quad([P(a[0], a[1], .02), P(b[0], b[1], .02), P(b[0], b[1], Hh), P(a[0], a[1], Hh)], rgba(mix(col, [0, 0, 0], .25))); }
      quad(c.map(function (q) { return P(q[0], q[1], Hh); }), rgba(col));
      // windshield
      var f1 = [x + ux * hl * .55 - vx * hw * .8, y + uy * hl * .55 - vy * hw * .8], f2 = [x + ux * hl * .55 + vx * hw * .8, y + uy * hl * .55 + vy * hw * .8];
      var p1 = P(f1[0], f1[1], Hh), p2 = P(f2[0], f2[1], Hh); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, S * .02); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function icon(kind, x, y, r, col, al) {
      ctx.globalAlpha = al; ctx.fillStyle = rgba(C.surface); ctx.strokeStyle = rgba(col); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.fillStyle = rgba(col); var u = r * .55; ctx.beginPath();
      if (kind === 'bolt') { ctx.moveTo(x + u * .2, y - u); ctx.lineTo(x - u * .55, y + u * .15); ctx.lineTo(x - u * .05, y + u * .15); ctx.lineTo(x - u * .25, y + u); ctx.lineTo(x + u * .6, y - u * .2); ctx.lineTo(x + u * .1, y - u * .2); ctx.closePath(); ctx.fill(); }
      else if (kind === 'batt') { ctx.strokeStyle = rgba(col); ctx.lineWidth = 1.3; ctx.strokeRect(x - u * .5, y - u * .75, u, u * 1.5); ctx.fillRect(x - u * .3, y - u * .5 + (1 - (t * 1.2 % 1)) * u, u * .6, (t * 1.2 % 1) * u * .95); }
      else if (kind === 'box') { ctx.strokeStyle = rgba(col); ctx.lineWidth = 1.3; ctx.strokeRect(x - u * .7, y - u * .6, u * 1.4, u * 1.2); ctx.beginPath(); ctx.moveTo(x - u * .7, y - u * .1); ctx.lineTo(x + u * .7, y - u * .1); ctx.stroke(); }
      else if (kind === 'H') { ctx.font = '700 ' + Math.round(r * 1.1) + 'px "Public Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x, y + .5); }
      ctx.globalAlpha = 1;
    }
    function battery(x, y, f, al) { ctx.globalAlpha = al; ctx.fillStyle = rgba(C.surface, .9); ctx.fillRect(x - 8, y - 4.5, 15, 9); ctx.strokeStyle = rgba(C.text, .6); ctx.lineWidth = 1; ctx.strokeRect(x - 8, y - 4.5, 14, 9); ctx.fillStyle = rgba(C.text, .6); ctx.fillRect(x + 6, y - 2, 2, 4); ctx.fillStyle = rgba(f < .25 ? C.maroon : C.ev); ctx.fillRect(x - 7, y - 3.5, 12 * Math.max(0, Math.min(1, f)), 7); ctx.globalAlpha = 1; }

    // ---------- frame ----------
    function draw() {
      setCam(); fit();
      ctx.clearRect(0, 0, W, H);
      var sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, rgba(mix(C.bg2, C.surface, dark ? .1 : .6))); sky.addColorStop(1, rgba(C.bg2)); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // ground: road surface under the whole grid, lots on top
      ground(-.45, -.45, cols - .55, rows - .55, 0, rgba(C.road));
      blocks.forEach(function (b) { ground(b.c + .1, b.r + .1, b.c + .9, b.r + .9, 0, rgba(b.park ? C.park : C.lot)); });
      // lane markings
      ctx.strokeStyle = rgba(C.surface, dark ? .12 : .55); ctx.lineWidth = Math.max(.6, S * .012); ctx.setLineDash([S * .06, S * .08]);
      for (var r = 0; r < rows; r++) { var a = P(0, r, 0), b = P(cols - 1, r, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      for (var c = 0; c < cols; c++) { a = P(c, 0, 0); b = P(c, rows - 1, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.setLineDash([]);
      // highlighted corridors on the ground
      strip(corridor, C.freight, .35 + .4 * (A('freight') === 1 ? 1 : 0));
      strip(busLoop.concat([busLoop[0]]), C.bus, .3 + .45 * (A('bus') === 1 ? 1 : 0));
      // optimizer route
      if (trace) {
        var age = t - trace.born, k = Math.min(1, age / 1.5), n = (trace.p.length - 1) * k, fade = Math.max(0, 1 - Math.max(0, age - 2.8) / 1.4);
        ctx.save(); ctx.setLineDash([S * .08, S * .07]); ctx.lineDashOffset = -t * S * .3; ctx.strokeStyle = rgba(C.maroon, .9 * fade); ctx.lineWidth = Math.max(2, S * .045); ctx.lineJoin = 'round'; ctx.beginPath();
        for (var i = 0; i <= Math.floor(n); i++) { var q = P(nodes[trace.p[i]].x, nodes[trace.p[i]].y, .01); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
        var tp = onPath(trace.p, n), tq = P(tp.x, tp.y, .01); ctx.lineTo(tq[0], tq[1]); ctx.stroke(); ctx.restore();
        halo(tq[0], tq[1], S * .3, C.maroon, .4 * fade); dot(tq[0], tq[1], Math.max(3, S * .05), rgba(C.maroon, fade));
      }
      // riders waiting
      riders.forEach(function (rd, i) { var N = nodes[rd], p = P(N.x + .14, N.y + .14, 0), pulse = .5 + .5 * Math.sin(t * 4 + i);
        ctx.globalAlpha = A('mob'); ctx.strokeStyle = rgba(C.mob, .5 + .4 * pulse); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p[0], p[1], S * (.08 + .05 * pulse), S * (.08 + .05 * pulse) * TILT, 0, 0, 6.283); ctx.stroke();
        var hd = P(N.x + .14, N.y + .14, .14); ctx.strokeStyle = rgba(C.mob); ctx.lineWidth = Math.max(1.4, S * .025); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(hd[0], hd[1]); ctx.stroke(); dot(hd[0], hd[1], Math.max(2, S * .03), rgba(C.mob)); ctx.globalAlpha = 1; });

      // everything with height, painter-sorted
      var items = [];
      blocks.forEach(function (bl) { bl.items.forEach(function (it) {
        if (it.tree) items.push({ d: depth(it.x, it.y), f: function () { tree(it); } });
        else items.push({ d: depth((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2), f: function () { building(it); } });
      }); });
      hubs.forEach(function (h) { var N = nodes[h]; items.push({ d: depth(N.x, N.y) + .3, f: function () { canopy(N, C.ev, 'ev', function (a) { return a.k === 'ev' && a.stage === 'charging' && a.p[a.p.length - 1] === h; }); } }); });
      var T = nodes[busLoop[0]]; items.push({ d: depth(T.x, T.y) + .3, f: function () { canopy(T, C.bus, 'bus', function (a) { return a.k === 'bus' && a.i === 0 && a.dwell > 0; }); } });
      swaps.forEach(function (s) { var N = nodes[s]; items.push({ d: depth(N.x + .2, N.y - .2) + .3, f: function () { pillar(N, s); } }); });
      agents.forEach(function (ag) {
        if (ag.k === 'ev') { var p = onPath(ag.p, ag.s); items.push({ d: depth(p.x, p.y), f: function () { vehicle(p.x, p.y, p.dx || 1, p.dy, .4, .22, .16, C.ev, A('ev')); if (A('ev') === 1 || ag.stage === 'charging') { var q = P(p.x, p.y, .45); battery(q[0], q[1], ag.charge, A('ev')); } } }); }
        else if (ag.k === 'bus') { var pb = onPath([busLoop[ag.i], busLoop[(ag.i + 1) % busLoop.length]], ag.s); items.push({ d: depth(pb.x, pb.y), f: function () { vehicle(pb.x, pb.y, pb.dx, pb.dy, .62, .24, .22, C.bus, A('bus')); } }); }
        else if (ag.k === 'freight') { var pf = onPath(corridor, ag.s); items.push({ d: depth(pf.x, pf.y), f: function () { vehicle(pf.x, pf.y, ag.dir, 0, .56, .24, .26, C.freight, A('freight')); } }); }
        else if (ag.k === 'mob') { var pm = onPath(ag.p, ag.s); items.push({ d: depth(pm.x, pm.y), f: function () { vehicle(pm.x, pm.y, pm.dx || 1, pm.dy, .38, .21, .15, C.mob, A('mob')); } }); }
      });
      items.sort(function (a, b) { return a.d - b.d; }).forEach(function (it) { it.f(); });
      // drones fly above everything
      agents.forEach(function (ag) { if (ag.k === 'drone') drone(ag); });
      // floating labels for the featured system
      labels();
      themeLabel();
    }
    function strip(ids, col, al) {
      ctx.strokeStyle = rgba(col, al); ctx.lineWidth = Math.max(3, S * .12); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      ids.forEach(function (n, i) { var q = P(nodes[n].x, nodes[n].y, 0); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    }
    function building(b) {
      if (b.kind) {
        var col = C[b.kind], f = THEMES[feat].key === b.kind;
        prism(b, mix(C.bTop, col, f ? .55 : .3), mix(C.bL, col, f ? .45 : .2), mix(C.bR, col, f ? .5 : .25), 1, false);
        if (b.kind === 'drone') { var cpt = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.h); ctx.strokeStyle = rgba(C.surface, .9); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(cpt[0], cpt[1], S * .16, S * .16 * TILT, 0, 0, 6.283); ctx.stroke(); }
        return;
      }
      prism(b, C.bTop, C.bL, C.bR, 1, b.sky);
      if (b.sky && dark) { // beacon on skyscraper roofs at night
        var tp = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.h); dot(tp[0], tp[1], Math.max(1.5, S * .02), rgba(C.maroon, .5 + .5 * Math.sin(t * 3 + b.h * 7)));
      }
    }
    function tree(it) { var g = P(it.x, it.y, 0), top = P(it.x, it.y, it.s * 2.2); ctx.strokeStyle = rgba(C.muted, .6); ctx.lineWidth = Math.max(1, S * .015); ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
      dot(top[0], top[1], it.s * S, rgba(C.tree)); dot(top[0] - it.s * S * .3, top[1] - it.s * S * .3, it.s * S * .5, rgba(mix(C.tree, [255, 255, 255], .25))); }
    function canopy(N, col, kind, busyFn) {
      var busy = agents.some(busyFn), al = A(kind), x = N.x + .2, y = N.y - .2;
      var b = { x0: x - .12, y0: y - .12, x1: x + .12, y1: y + .12, h: .22 };
      if (busy) { var g = P(x, y, .1); halo(g[0], g[1], S * .5, col, .35 + .2 * Math.sin(t * 6)); }
      prism(b, mix(C.bTop, col, .65), mix(C.bL, col, .5), mix(C.bR, col, .55), al, false);
      var ic = P(x, y, .62); icon('bolt', ic[0], ic[1], Math.max(7, S * .1), col, al);
    }
    function pillar(N, s) {
      var al = A('drone'), x = N.x + .2, y = N.y - .2, b = { x0: x - .07, y0: y - .07, x1: x + .07, y1: y + .07, h: .38 };
      var busy = agents.some(function (a) { return a.k === 'drone' && a.swap > 0 && a.via === s; });
      if (busy) { var g = P(x, y, .38); halo(g[0], g[1], S * .4, C.drone, .4); }
      prism(b, mix(C.bTop, C.drone, .6), mix(C.bL, C.drone, .45), mix(C.bR, C.drone, .5), al, false);
      var ic = P(x, y, .72); icon('batt', ic[0], ic[1], Math.max(6, S * .085), C.drone, al);
    }
    function drone(a) {
      var D = nodes[depot], Sx = nodes[a.via], Tg = nodes[a.target];
      var depotXY = { x: .5, y: rows - 1.5 }, viaXY = { x: Sx.x + .2, y: Sx.y - .2 };
      var legs = [[depotXY, viaXY], [viaXY, Tg], [Tg, viaXY], [viaXY, depotXY]], L = legs[a.leg], A0 = L[0], B0 = L[1], s = a.s;
      var x = A0.x + (B0.x - A0.x) * s, y = A0.y + (B0.y - A0.y) * s, z = .55 + Math.sin(s * Math.PI) * 1.1, al = A('drone');
      if (a.swap > 0) z = .5;
      var sh = P(x, y, 0); ctx.fillStyle = rgba(C.text, .13 * al); ctx.beginPath(); ctx.ellipse(sh[0], sh[1], S * .1, S * .1 * TILT, 0, 0, 6.283); ctx.fill();
      if (al === 1) { ctx.save(); ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(C.drone, .45); ctx.lineWidth = 1.2; ctx.beginPath();
        for (var k = 0; k <= 24; k++) { var q = k / 24, xx = A0.x + (B0.x - A0.x) * q, yy = A0.y + (B0.y - A0.y) * q, zz = .55 + Math.sin(q * Math.PI) * 1.1, pp = P(xx, yy, zz); if (k) ctx.lineTo(pp[0], pp[1]); else ctx.moveTo(pp[0], pp[1]); }
        ctx.stroke(); ctx.restore(); }
      var p = P(x, y, z), arm = Math.max(5, S * .09); ctx.globalAlpha = al; ctx.strokeStyle = rgba(C.drone); ctx.lineWidth = Math.max(1.6, S * .025);
      ctx.beginPath(); ctx.moveTo(p[0] - arm, p[1] - arm * .5); ctx.lineTo(p[0] + arm, p[1] + arm * .5); ctx.moveTo(p[0] + arm, p[1] - arm * .5); ctx.lineTo(p[0] - arm, p[1] + arm * .5); ctx.stroke();
      [[-1, -.5], [1, -.5], [1, .5], [-1, .5]].forEach(function (o, i) { ctx.save(); ctx.translate(p[0] + o[0] * arm, p[1] + o[1] * arm); ctx.scale(1, .5); ctx.rotate(t * 28 + i); ctx.strokeStyle = rgba(C.drone, .85); ctx.beginPath(); ctx.moveTo(-arm * .55, 0); ctx.lineTo(arm * .55, 0); ctx.stroke(); ctx.restore(); });
      dot(p[0], p[1], Math.max(2.5, S * .035), rgba(C.drone)); ctx.globalAlpha = 1;
    }
    function tagAt(x, y, z, text, col) {
      if (small) return; var p = P(x, y, z); ctx.font = '600 11px "Public Sans", system-ui, sans-serif'; var w = ctx.measureText(text).width + 16;
      ctx.fillStyle = rgba(C.surface, .92); ctx.strokeStyle = rgba(col, .8); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p[0] - w / 2, p[1] - 20, w, 18, 9) : ctx.rect(p[0] - w / 2, p[1] - 20, w, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(C.text); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, p[0], p[1] - 10.5);
    }
    function labels() {
      var k = THEMES[feat].key;
      if (k === 'freight') { tagAt(supplier[0] + .5, supplier[1] + .5, .6, 'Supplier', C.freight); tagAt(dc[0] + .5, dc[1] + .5, .65, 'Distribution center', C.freight); tagAt(customer[0] + .5, customer[1] + .5, .85, 'Customers', C.freight); }
      if (k === 'ev') { var h = nodes[hubs[0]]; tagAt(h.x + .2, h.y - .2, .95, 'Charging hub', C.ev); }
      if (k === 'bus') { var b = nodes[busLoop[0]]; tagAt(b.x + .2, b.y - .2, .95, 'Terminal charger', C.bus); }
      if (k === 'drone') { tagAt(.5, rows - 1.5, .5, 'Drone depot', C.drone); var s = nodes[swaps[0]]; tagAt(s.x + .2, s.y - .2, 1.05, 'Battery swap', C.drone); }
      if (k === 'mob' && riders.length) { var r = nodes[riders[0]]; tagAt(r.x + .14, r.y + .14, .45, 'Rider waiting', C.mob); }
    }
    function themeLabel() {
      var th = THEMES[feat], px = small ? 11 : 13, x = 12, y = 12;
      ctx.font = '600 ' + px + 'px "Public Sans", system-ui, sans-serif'; var w1 = ctx.measureText(th.name).width;
      ctx.font = '400 ' + (px - 1) + 'px "Public Sans", system-ui, sans-serif'; var w2 = small ? 0 : ctx.measureText(th.sub).width;
      var w = Math.max(w1, w2) + 34, h = small ? 26 : 44;
      ctx.fillStyle = rgba(C.surface, .94); ctx.strokeStyle = rgba(C.line); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
      dot(x + 14, y + 13, 4.5, rgba(C[th.key])); ctx.fillStyle = rgba(C.text); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = '600 ' + px + 'px "Public Sans", system-ui, sans-serif'; ctx.fillText(th.name, x + 25, y + 13.5);
      if (!small) { ctx.fillStyle = rgba(C.muted); ctx.font = '400 ' + (px - 1) + 'px "Public Sans", system-ui, sans-serif'; ctx.fillText(th.sub, x + 25, y + 31); }
    }

    function syncLegend() { if (!legend) return; legend.querySelectorAll('[data-k]').forEach(function (b, i) { b.setAttribute('aria-pressed', i === feat ? 'true' : 'false'); }); }
    if (legend) legend.querySelectorAll('[data-k]').forEach(function (b, i) {
      function on() { hover = i; feat = i; syncLegend(); if (!run) draw(); }
      b.addEventListener('mouseenter', on); b.addEventListener('focus', on); b.addEventListener('click', on);
      b.addEventListener('mouseleave', function () { hover = -1; }); b.addEventListener('blur', function () { hover = -1; });
    });
    // ---------- camera controls: drag to orbit 360°, vertical drag to tilt, wheel/pinch/buttons to zoom, shift-drag or two fingers to pan
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function touched() { lastInteract = t; if (!run) draw(); }
    function zoomAt(mx, my, f) {
      fit(); var nz = clamp(zoom * f, .7, 4.5); f = nz / zoom; zoom = nz;
      var nOX = mx - (mx - OX) * f, nOY = my - (my - OY) * f;
      panX = nOX - W / 2; panY = nOY - H / 2 - maxH * HZ * base * .38; clampPan(); touched();
    }
    function clampPan() { var lim = Math.max(0, zoom - .8); panX = clamp(panX, -W * .5 * lim - 40, W * .5 * lim + 40); panY = clamp(panY, -H * .6 * lim - 30, H * .6 * lim + 30); }
    function orbit(d) { yaw += d; touched(); }
    function reset() { yaw = .36; TILT = .52; zoom = Z0; panX = panY = 0; touched(); }
    var pts = {}, prev = null;
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function pinch() { var k = Object.keys(pts); if (k.length < 2) return null; var a = pts[k[0]], b = pts[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    canvas.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = local(e); active = true; dragging = true; canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {} prev = pinch(); canvas.classList.add('grabbing'); touched();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return; var p = local(e), q = pts[e.pointerId], dx = p.x - q.x, dy = p.y - q.y; pts[e.pointerId] = p;
      var two = pinch();
      if (two && prev) { zoomAt(two.x, two.y, two.d / (prev.d || two.d)); panX += two.x - prev.x; panY += two.y - prev.y; clampPan(); prev = two; return; }
      if (e.shiftKey || (e.buttons & 2)) { panX += dx; panY += dy; clampPan(); }
      else { yaw += dx * .009; if (e.pointerType !== 'touch') TILT = clamp(TILT - dy * .003, .26, .92); }
      touched();
    });
    function up(e) { delete pts[e.pointerId]; prev = pinch(); if (!Object.keys(pts).length) { dragging = false; canvas.classList.remove('grabbing'); } }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function () { if (!dragging) active = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) {
      if (!active && !document.fullscreenElement) { hint(true); return; } // let the page scroll until the city is clicked
      e.preventDefault(); var p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * .0015));
    }, { passive: false });
    canvas.addEventListener('dblclick', reset);
    canvas.addEventListener('keydown', function (e) {
      var k = e.key, used = true;
      if (k === 'ArrowLeft') orbit(-.15); else if (k === 'ArrowRight') orbit(.15);
      else if (k === 'ArrowUp') { TILT = clamp(TILT + .05, .26, .92); touched(); } else if (k === 'ArrowDown') { TILT = clamp(TILT - .05, .26, .92); touched(); }
      else if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.2); else if (k === '-' || k === '_') zoomAt(W / 2, H / 2, 1 / 1.2);
      else if (k === '0' || k === 'Home') reset(); else used = false;
      if (used) e.preventDefault();
    });

    // on-canvas buttons
    var fig = canvas.parentNode, bar = document.createElement('div'); bar.className = 'city-ctrl';
    var ICON = {
      plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
      left: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>', right: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
      reset: '<path d="M3 12h3M18 12h3M12 3v3M12 18v3"/><circle cx="12" cy="12" r="4"/>',
      pause: '<path d="M9 6v12M15 6v12"/>', play: '<path d="M8 5l11 7-11 7z"/>',
      full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
    };
    function btn(name, label, fn) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); }); bar.appendChild(b); return b; }
    btn('plus', 'Zoom in', function () { zoomAt(W / 2, H / 2, 1.3); });
    btn('minus', 'Zoom out', function () { zoomAt(W / 2, H / 2, 1 / 1.3); });
    btn('left', 'Rotate left', function () { orbit(-Math.PI / 4); });
    btn('right', 'Rotate right', function () { orbit(Math.PI / 4); });
    var spinBtn = btn(still.matches ? 'play' : 'pause', 'Pause rotation', function (b) { spin = !spin; b.innerHTML = b.innerHTML.replace(spin ? ICON.play : ICON.pause, spin ? ICON.pause : ICON.play); b.setAttribute('aria-label', spin ? 'Pause rotation' : 'Resume rotation'); b.title = b.getAttribute('aria-label'); lastInteract = -99; });
    btn('reset', 'Reset view', reset);
    if (fig.requestFullscreen) btn('full', 'Full screen', function () {
      if (document.fullscreenElement) document.exitFullscreen(); else fig.requestFullscreen().catch(function () {});
    });
    fig.appendChild(bar);
    var tip = document.createElement('p'); tip.className = 'city-hint';
    tip.textContent = matchMedia('(pointer: coarse)').matches ? 'Swipe sideways to turn the city · pinch to zoom' : 'Drag to rotate 360° and tilt · click, then scroll to zoom · shift-drag to pan · double-click to reset';
    fig.appendChild(tip);
    var hintT; function hint(flash) { tip.classList.add('flash'); clearTimeout(hintT); hintT = setTimeout(function () { tip.classList.remove('flash'); }, 1600); }
    document.addEventListener('fullscreenchange', function () { setTimeout(function () { if (layout()) draw(); }, 60); });

    function layout() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!r.width || !r.height) return false; W = r.width; H = r.height; small = W < 620;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); colors(); build(); return true;
    }
    function frame(now) { var dt = Math.min(.05, (now - (last || now)) / 1000); last = now; t += dt; step(dt); draw(); if (run) raf = requestAnimationFrame(frame); }
    function stillFrame() { for (var i = 0; i < 120; i++) { t += 1 / 30; step(1 / 30); } draw(); }
    function start() { if (run) return; if (still.matches) { stillFrame(); return; } run = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { run = false; cancelAnimationFrame(raf); }

    if (!layout()) return; syncLegend(); stillFrame();
    var visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible && !document.hidden ? start() : stop(); }).observe(canvas); else start();
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (visible && start()); });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (layout()) draw(); }, 150); });
    new MutationObserver(function () { colors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (still.addEventListener) still.addEventListener('change', function () { still.matches ? stop() : start(); });
  }
  function init() { document.querySelectorAll('canvas.atlas-city').forEach(function (c) { try { City(c); } catch (e) { if (window.console) console.error(e); } }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
