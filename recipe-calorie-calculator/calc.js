/* calc.js — DOM wiring for the recipe calorie calculator. Needs engine.js + foods.js. */
(function () {
  'use strict';
  var E = window.RCCEngine, DB = window.__RCC__;
  if (!E || !DB) return;
  DB._byId = DB.foods.reduce(function (o, f) { o[f.id] = f; return o; }, {});
  var byId = DB._byId;
  var LS = 'rcc.v1';

  var $ = function (id) { return document.getElementById(id); };
  var input = $('rcc-input'), servings = $('rcc-servings'), method = $('rcc-method'),
    fat = $('rcc-fat'), status = $('rcc-status'), results = $('rcc-results'),
    totalsEl = $('rcc-totals'), flagsEl = $('rcc-flags'), transEl = $('rcc-transparency'),
    labelEl = $('rcc-label'), labelToggle = $('rcc-label-toggle');
  var state = null; // last analyze() result

  // ---- restore ----
  try {
    var saved = JSON.parse(localStorage.getItem(LS) || '{}');
    if (saved.text) input.value = saved.text;
    if (saved.servings) servings.value = saved.servings;
    if (saved.method) method.value = saved.method;
    if (saved.fat != null) fat.value = saved.fat;
  } catch (e) {}

  function persist() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        text: input.value, servings: servings.value, method: method.value, fat: fat.value,
      }));
    } catch (e) {}
  }

  function opts() {
    var m = method.value;
    return {
      servings: parseInt(servings.value, 10) || 1,
      method: m === 'deep-fried' ? 'deep-fried' : 'none',
      coating: 'light',
      addedFatTbsp: parseFloat(fat.value) || 0,
      fatType: 'oil',
    };
  }

  function num(n, unit) {
    if (n == null || isNaN(n)) return '—';
    var v = Math.round(n * (n < 10 ? 10 : 1)) / (n < 10 ? 10 : 1);
    return v.toLocaleString() + (unit ? ' ' + unit : '');
  }

  var ROWS = [
    ['Calories', 'kcal', 'kcal'], ['Protein', 'protein', 'g'], ['Carbs', 'carb', 'g'],
    ['— of which fibre', 'fiber', 'g'], ['— of which sugars', 'sugar', 'g'],
    ['Fat', 'fat', 'g'], ['— saturated', 'satfat', 'g'],
    ['Sodium', 'sodium', 'mg'], ['Cholesterol', 'chol', 'mg'],
  ];

  function render() {
    var t = state.totals;
    var h = '<tr><th>Nutrient</th><th>Whole recipe</th><th>Per serving</th><th>Per 100 g</th></tr>';
    ROWS.forEach(function (r) {
      h += '<tr><td>' + r[0] + '</td><td>' + num(t.whole[r[1]], r[2]) + '</td><td>' +
        num(t.perServing[r[1]], r[2]) + '</td><td>' + num(t.per100g[r[1]], r[2]) + '</td></tr>';
    });
    h += '<tr><td><strong>Net carbs</strong></td><td>' + num(t.netCarbs.whole, 'g') + '</td><td><strong>' +
      num(t.netCarbs.perServing, 'g') + '</strong></td><td>—</td></tr>';
    if (t.cookGrams > 0) {
      h += '<tr><td class="cook">Cooking additions (oil/absorption)</td><td>' + num(t.cooking.kcal, 'kcal') +
        '</td><td>' + num(t.cooking.kcal / t.servings, 'kcal') + '</td><td>—</td></tr>';
    }
    h += '<tr><td>Total recipe weight</td><td>' + num(t.totalGrams, 'g') + '</td><td>' +
      num(t.totalGrams / t.servings, 'g') + '</td><td>100 g</td></tr>';
    totalsEl.innerHTML = h;

    var mp = t.macroPct;
    flagsEl.innerHTML = 'Per serving: <strong>' + Math.round(mp.protein * 100) + '%</strong> protein · <strong>' +
      Math.round(mp.carb * 100) + '%</strong> carb · <strong>' + Math.round(mp.fat * 100) + '%</strong> fat &nbsp; ' +
      (t.flags.highProtein ? '<span class="badge ok">high-protein</span> ' : '') +
      (t.flags.keto ? '<span class="badge ok">keto-friendly</span>' : '<span class="badge">not keto (' + num(t.netCarbs.perServing) + ' g net carbs)</span>');

    renderTransparency();
    renderLabel();
    results.hidden = false;
  }

  function optionList(selectedId) {
    return DB.foods.map(function (f) {
      var nm = f.name + (f.state ? ' (' + f.state + ')' : '');
      return '<option value="' + f.id + '"' + (f.id === selectedId ? ' selected' : '') + '>' + nm + '</option>';
    }).join('');
  }

  function renderTransparency() {
    var h = '<tr><th>Ingredient</th><th>Matched</th><th>Amount used</th><th>Confidence</th><th>Change</th></tr>';
    state.lines.forEach(function (L, i) {
      var r = L.resolved, f = r && r.food;
      var conf = r ? r.confidence : 'none';
      var badge = conf === 'exact' ? '<span class="badge ok">exact</span>'
        : conf === 'fuzzy' ? '<span class="badge warn">fuzzy</span>'
          : '<span class="badge bad">no match</span>';
      var matched = f ? (f.name + (f.state ? ' (' + f.state + ')' : '')) : '—';
      var assumed = f && f.state && !/\b(cooked|boiled|dry|dried|uncooked|raw|roasted|grilled|baked|steamed)\b/.test(L.foodText.toLowerCase())
        ? ' <em class="hint">assumed ' + f.state + '</em>' : '';
      var amt = f ? (num(L.grams, 'g') + (L.gramLow ? ' <em class="hint">approx</em>' : '') + '<br><span class="hint">' + (L.gramMethod || '') + '</span>') : '—';
      h += '<tr><td>' + esc(L.raw) + '</td><td>' + matched + assumed + '</td><td>' + amt + '</td><td>' + badge +
        '</td><td><select data-i="' + i + '"><option value="">' + (f ? '(keep)' : '— pick —') + '</option>' +
        optionList(f && f.id) + '</select></td></tr>';
    });
    transEl.innerHTML = h;
    transEl.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var i = +sel.getAttribute('data-i'), id = sel.value;
        if (!id) return;
        var L = state.lines[i], f = byId[id];
        L.resolved = { food: f, confidence: 'exact', note: 'you picked this' };
        var gr = E.toGrams(L.qty, L.unit, f, DB);
        L.grams = gr.grams; L.gramMethod = gr.method; L.gramLow = !!gr.low;
        state.totals = E.computeTotals(state.lines, opts());
        render();
      });
    });
  }

  function renderLabel() {
    var s = state.totals.perServing, nc = state.totals.netCarbs.perServing;
    labelEl.innerHTML =
      '<div class="fda">' +
      '<div class="fda-t">Nutrition Facts</div>' +
      '<div class="fda-s">' + state.totals.servings + ' servings per recipe</div>' +
      '<div class="fda-row big"><span>Calories</span><span>' + Math.round(s.kcal) + '</span></div>' +
      '<div class="fda-hr"></div>' +
      row('Total Fat', s.fat, 'g') + row('&nbsp;&nbsp;Saturated Fat', s.satfat, 'g') +
      row('Cholesterol', s.chol, 'mg') + row('Sodium', s.sodium, 'mg') +
      row('Total Carbohydrate', s.carb, 'g') + row('&nbsp;&nbsp;Dietary Fibre', s.fiber, 'g') +
      row('&nbsp;&nbsp;Total Sugars', s.sugar, 'g') + row('Net Carbs', nc, 'g') +
      row('Protein', s.protein, 'g') +
      '<div class="fda-f">Estimated from USDA SR Legacy. Per serving.</div></div>';
    function row(n, v, u) {
      return '<div class="fda-row"><span>' + n + '</span><span>' + (Math.round((v || 0) * 10) / 10) + ' ' + u + '</span></div>';
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function run() {
    var text = input.value.trim();
    if (!text) { status.textContent = 'Paste some ingredients first.'; return; }
    state = E.analyze(text, DB, opts());
    var n = state.lines.length, ok = state.lines.filter(function (L) { return L.resolved && L.resolved.food; }).length;
    var none = state.lines.filter(function (L) { return !L.resolved || !L.resolved.food; }).length;
    status.textContent = ok + ' of ' + n + ' ingredients matched' + (none ? ' — ' + none + ' need a manual pick below' : '') + '.';
    render();
    persist();
  }

  $('rcc-go').addEventListener('click', run);
  [servings, method, fat].forEach(function (el) {
    el.addEventListener('change', function () { if (state) { state.totals = E.computeTotals(state.lines, opts()); render(); } persist(); });
  });
  labelToggle.addEventListener('click', function () {
    labelEl.hidden = !labelEl.hidden;
    labelToggle.textContent = labelEl.hidden ? 'Show nutrition label' : 'Hide nutrition label';
  });
})();
