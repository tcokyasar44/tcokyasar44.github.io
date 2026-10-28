/* Publications page: search, expand/collapse all, live counts. No dependencies. */
(function () {
  var box = document.getElementById('pub-search');
  var groups = function () { return document.querySelectorAll('details.pub-year'); };
  var sections = document.querySelectorAll('.bib-section');
  var empty = document.getElementById('pub-empty');

  document.querySelectorAll('[data-pub-act]').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('data-pub-act') === 'expand';
      groups().forEach(function (g) { if (!g.hidden) g.open = open; });
    });
  });

  function text(p) {
    var c = p.cloneNode(true);
    var bt = c.querySelector('details.bibtex'); if (bt) bt.remove();
    return c.textContent.toLowerCase();
  }
  var papers = Array.prototype.map.call(document.querySelectorAll('.bibbase_paper'), function (p) {
    return { el: p, txt: text(p) };
  });
  var initialOpen = Array.prototype.map.call(groups(), function (g) { return g.open; });

  function apply() {
    var q = (box.value || '').toLowerCase().trim();
    var terms = q ? q.split(/\s+/) : [];
    var shown = 0;
    papers.forEach(function (p) {
      var ok = terms.every(function (t) { return p.txt.indexOf(t) !== -1; });
      p.el.hidden = !ok; if (ok) shown++;
    });
    groups().forEach(function (g, i) {
      var n = g.querySelectorAll('.bibbase_paper:not([hidden])').length;
      g.hidden = n === 0;
      var c = g.querySelector('.bibbase_group_count'); if (c) c.textContent = '(' + n + ')';
      g.open = terms.length ? n > 0 : initialOpen[i];
    });
    sections.forEach(function (s) {
      var c = document.querySelector('[data-bib-count="' + s.id + '"]');
      var all = s.querySelectorAll('.bibbase_paper').length;
      var vis = s.querySelectorAll('.bibbase_paper:not([hidden])').length;
      s.hidden = terms.length > 0 && vis === 0;
      if (c) c.textContent = terms.length ? '(' + vis + ' of ' + all + ')' : '(' + all + ')';
    });
    if (empty) empty.hidden = !(terms.length && shown === 0);
  }
  if (box) { box.addEventListener('input', apply); if (box.value) apply(); }
})();
