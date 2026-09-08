/*
 * engine.js — recipe calorie calculator core: parse -> resolve -> grams -> totals.
 * Pure, no DOM. Works in the browser (reads window.__FOODS__ etc. if not passed)
 * and in Node (require + inject data) for the resolver test harness.
 */
(function (root) {
  'use strict';

  // ---- text utils --------------------------------------------------------
  var UNICODE_FRAC = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2, '⅖': 0.4 };
  // noise words removed before matching; STATE words are kept (discriminant)
  var NOISE = /\b(fresh|finely|roughly|thinly|large|small|medium|ripe|organic|free[- ]range|skinless|boneless|of|a|an|the|about|approx|plus|extra|good|quality|to taste|for serving|for garnish|optional|packed|heaping|level|whole|chopped|diced|sliced|minced|shredded|grated|crushed|cubed|halved|quartered|drained|rinsed|peeled|deseeded|seeded|trimmed|cut into|bite[- ]sized?|pieces?)\b/g;
  var STATE = /\b(cooked|boiled|dry|dried|uncooked|raw|roasted|grilled|baked|steamed)\b/;

  function normFrac(s) {
    s = s.replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖]/g, function (m) { return ' ' + UNICODE_FRAC[m] + ' '; });
    // "1 1/2" -> 1.5 ; "1/2" -> 0.5
    s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, function (_, a, b, c) { return (+a + b / c); });
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, function (_, b, c) { return (b / c); });
    return s;
  }

  var UNITS = {
    g: 'g', gram: 'g', grams: 'g', gr: 'g',
    kg: 'kg', kilogram: 'kg', kilograms: 'kg',
    mg: 'mg',
    oz: 'oz', ounce: 'oz', ounces: 'oz',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', cc: 'ml',
    l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
    cup: 'cup', cups: 'cup',
    tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
    // count-ish units routed through portion matching
    clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice',
    can: 'can', cans: 'can', piece: 'piece', pieces: 'piece',
    handful: 'handful', bunch: 'bunch', stalk: 'stalk', stalks: 'stalk',
    sprig: 'sprig', sprigs: 'sprig', head: 'head', fillet: 'fillet', fillets: 'fillet',
    breast: 'breast', breasts: 'breast', thigh: 'thigh', thighs: 'thigh', strip: 'strip', strips: 'strip',
  };
  var G_PER = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };
  var ML_PER = { ml: 1, l: 1000, tbsp: 14.79, tsp: 4.93, cup: 236.6 };

  // ---- parse -----------------------------------------------------------
  function parseLine(raw) {
    var line = normFrac(String(raw).trim().toLowerCase());
    if (!line) return null;
    // strip trailing parenthetical and everything after a comma+verb ("chicken breast, diced")
    line = line.replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
    var m = line.match(/^([\d.]+)\s*(?:x\s*([\d.]+)\s*)?([a-z]+)?\.?\s*(.*)$/);
    var qty = 1, unit = null, food = line;
    if (m) {
      qty = parseFloat(m[1]) || 1;
      if (m[2]) qty *= parseFloat(m[2]); // "2 x 400 g"
      var u = m[3] && UNITS[m[3]];
      if (u) { unit = u; food = m[4]; }
      else { unit = null; food = (m[3] ? m[3] + ' ' : '') + m[4]; }
    }
    // commas separate prep notes ("rice, cooked", "onion, diced") — flatten, don't truncate,
    // so a trailing state word ("cooked"/"raw") survives into the resolver.
    food = food.replace(/^(of|a|an)\s+/, '').replace(/,/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return { raw: raw, qty: qty, unit: unit, foodText: food };
  }

  // ---- resolve -------------------------------------------------------
  function cleanFood(t) {
    var hasState = STATE.exec(t);
    var stripped = t.replace(NOISE, ' ').replace(/[^a-z0-9 ,'-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (hasState && !STATE.exec(stripped)) stripped += ' ' + hasState[1]; // keep state token
    return stripped;
  }
  function tokenize(t) { return t.split(/[\s,]+/).filter(Boolean); }

  // near-zero-calorie stuff: route to a sentinel instead of a wrong fuzzy match
  var NEGLIGIBLE = /\b(salt|pepper|peppercorns?|to taste|water|ice|baking (powder|soda)|bicarbonate|cream of tartar|food colou?ring|vanilla extract|almond extract|cooking spray|nonstick spray)\b/;
  var SPICE = /\b(paprika|cumin|coriander|turmeric|cinnamon|nutmeg|cardamom|cloves?|allspice|chili powder|chilli powder|cayenne|curry powder|garam masala|italian seasoning|oregano|basil|thyme|rosemary|sage|dill|parsley flakes|bay leaf|bay leaves|red pepper flakes|garlic powder|onion powder|mustard powder|smoked paprika|za'?atar|herbs? de provence|dried (herbs?|oregano|basil|thyme|rosemary|dill|mint|parsley))\b/;
  // scorer stopwords: prep/colour/qualifier words that must not drive a keyword match
  var SCORE_STOP = { dried: 1, dry: 1, fresh: 1, frozen: 1, canned: 1, cooked: 1, raw: 1, ground: 1, low: 1, reduced: 1, sodium: 1, salt: 1, salted: 1, unsalted: 1, black: 1, white: 1, red: 1, green: 1, yellow: 1, water: 1, sweet: 1, hot: 1, mild: 1, plain: 1, whole: 1, light: 1, dark: 1, baby: 1, mixed: 1, chopped: 1, sliced: 1, diced: 1, minced: 1, shredded: 1, crushed: 1, grated: 1, roasted: 1, boneless: 1, skinless: 1, or: 1, and: 1, with: 1, the: 1, of: 1, in: 1, for: 1 };

  var SENTINELS = {
    'seasoning-negligible': { id: 'seasoning-negligible', name: 'salt / pepper / water (negligible)', state: null, aliases: [], portions: [{ label: 'pinch', grams: 0.5 }, { label: 'tsp', grams: 5 }, { label: 'tbsp', grams: 15 }], per100g: { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satfat: 0, chol: 0 }, pseo: false },
    'dried-spice-negligible': { id: 'dried-spice-negligible', name: 'dried spice / herb (negligible)', state: null, aliases: [], portions: [{ label: 'tsp', grams: 2 }, { label: 'tbsp', grams: 6 }, { label: 'pinch', grams: 0.5 }], per100g: { kcal: 250, protein: 10, carb: 50, fat: 8, fiber: 25, sugar: 3, sodium: 50, satfat: 1, chol: 0 }, pseo: false },
  };

  function resolve(foodText, DB) {
    var foods = DB.foods, aliases = DB.aliases;
    var byId = DB._byId || (DB._byId = foods.reduce(function (o, f) { o[f.id] = f; return o; }, {}));
    var lc = String(foodText).toLowerCase();
    if (NEGLIGIBLE.test(lc)) return { food: SENTINELS['seasoning-negligible'], confidence: 'exact', note: 'negligible calories' };
    if (SPICE.test(lc)) return { food: SENTINELS['dried-spice-negligible'], confidence: 'exact', note: 'dried spice — tiny amount' };
    var cleaned = cleanFood(foodText);
    var stateTok = (STATE.exec(cleaned) || [])[1] || null;

    // 1. exact alias hit (try cleaned, then singularised, then raw text)
    var tries = [cleaned, cleaned.replace(/s\b/g, ''), foodText.toLowerCase().trim()];
    for (var i = 0; i < tries.length; i++) {
      if (aliases[tries[i]]) return { food: byId[aliases[tries[i]]], confidence: 'exact', note: null };
    }
    // 2. alias substring: longest alias fully contained in the cleaned text
    var best = null, bestLen = 0;
    for (var k in aliases) {
      if (k.length > bestLen && cleaned.indexOf(k) !== -1) { best = aliases[k]; bestLen = k.length; }
    }
    if (best && bestLen >= 3) return { food: byId[best], confidence: 'fuzzy', note: 'partial name match' };

    // 3. token overlap vs food names + aliases — only content tokens, needs a clear winner
    var qt = tokenize(cleaned).filter(function (w) { return w.length > 2 && !SCORE_STOP[w]; });
    if (!qt.length) return { food: null, confidence: 'none', note: 'no match — pick manually' };
    var scored = foods.map(function (f) {
      var hay = (f.name + ' ' + f.aliases.join(' ')).toLowerCase();
      var hits = qt.filter(function (w) { return hay.indexOf(w) !== -1; }).length;
      var s = hits / qt.length;
      if (stateTok && f.state === stateTok) s += 0.20;
      if (stateTok && f.state && f.state !== stateTok) s -= 0.15;
      return { f: f, s: s, hits: hits };
    }).sort(function (a, b) { return b.s - a.s; });
    var top = scored[0], second = scored[1] || { s: 0 };
    var clearWinner = top.s - second.s >= 0.20 || top.hits >= 2;
    if (top && top.hits >= 1 && top.s >= 0.5 && clearWinner) {
      return { food: top.f, confidence: 'fuzzy', note: 'keyword match' };
    }
    return { food: null, confidence: 'none', note: 'no match — pick manually' };
  }

  // ---- grams ------------------------------------------------------
  function pickPortion(food, unit) {
    var ps = food.portions || [];
    if (!ps.length) return null;
    // exact-ish: a portion whose label starts with / contains the unit word
    var u = unit.replace(/s$/, '');
    var exact = ps.find(function (p) { return p.label === u || p.label.split(/[\s,]/)[0] === u; });
    if (exact) return exact;
    var contains = ps.find(function (p) { return p.label.indexOf(u) !== -1; });
    if (contains) return contains;
    return null;
  }
  function density(food, DB) {
    var name = (food.name + ' ' + food.aliases.join(' ')).toLowerCase();
    var tbl = DB.densities.byToken || {};
    var keys = Object.keys(tbl).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) if (name.indexOf(keys[i]) !== -1) return tbl[keys[i]];
    return DB.densities.default || 1;
  }
  function toGrams(qty, unit, food, DB) {
    if (!unit) { // bare count -> named portion, else NLEA serving, else default 100 g/unit
      var p = pickPortion(food, 'each') || pickPortion(food, food.name.split(' ').pop())
        || (food.portions || []).find(function (x) { return /medium|nlea|serving|unit|each|whole/.test(x.label); })
        || (food.portions || [])[0];
      if (p) return { grams: qty * p.grams, method: 'portion: ' + p.label };
      return { grams: qty * 100, method: 'assumed 100 g/unit', low: true };
    }
    if (G_PER[unit]) return { grams: qty * G_PER[unit], method: unit };
    if (ML_PER[unit]) { // volumetric: portion first, else density
      var pp = pickPortion(food, unit);
      if (pp) return { grams: qty * pp.grams, method: 'portion: ' + pp.label };
      if (unit === 'tbsp' || unit === 'tsp') {
        return { grams: qty * ML_PER[unit] * density(food, DB), method: unit + ' × density' };
      }
      return { grams: qty * ML_PER[unit] * density(food, DB), method: unit + ' × density', low: true };
    }
    // count-ish unit (clove/slice/can/breast…) -> portion match
    var pc = pickPortion(food, unit);
    if (pc) return { grams: qty * pc.grams, method: 'portion: ' + pc.label };
    var fb = (food.portions || [])[0];
    if (fb) return { grams: qty * fb.grams, method: 'portion: ' + fb.label, low: true };
    return { grams: qty * 100, method: 'unmatched unit — assumed 100 g', low: true };
  }

  // ---- totals ---------------------------------------------------
  var KEYS = ['kcal', 'protein', 'carb', 'fat', 'fiber', 'sugar', 'sodium', 'satfat', 'chol'];
  function blank() { var o = {}; KEYS.forEach(function (k) { o[k] = 0; }); return o; }

  function computeTotals(lines, opts) {
    opts = opts || {};
    var servings = Math.max(1, opts.servings || 1);
    var whole = blank(), totalGrams = 0, cooking = blank(), cookGrams = 0;

    lines.forEach(function (L) {
      if (!L.resolved || !L.resolved.food) return;
      var f = L.resolved.food, g = L.grams || 0;
      totalGrams += g;
      KEYS.forEach(function (k) { whole[k] += (f.per100g[k] || 0) * g / 100; });
    });

    // cooking additions (deterministic, transparent)
    if (opts.addedFatTbsp > 0) {
      var gFat = opts.addedFatTbsp * 14; // 1 tbsp oil/butter ≈ 14 g
      cooking.kcal += gFat * 8.84; cooking.fat += gFat; cooking.satfat += gFat * (opts.fatType === 'butter' ? 0.63 : 0.14);
      cookGrams += gFat;
    }
    if (opts.method === 'deep-fried') {
      var coat = opts.coating || 'light'; // battered .10, breaded .06, light .03
      var frac = coat === 'battered' ? 0.10 : coat === 'breaded' ? 0.06 : 0.03;
      var absorbG = totalGrams * frac;
      cooking.kcal += absorbG * 8.84; cooking.fat += absorbG; cooking.satfat += absorbG * 0.14;
      cookGrams += absorbG;
    }
    KEYS.forEach(function (k) { whole[k] += cooking[k]; });
    totalGrams += cookGrams;

    function scale(src, factor) { var o = {}; KEYS.forEach(function (k) { o[k] = src[k] * factor; }); return o; }
    var per100 = totalGrams > 0 ? scale(whole, 100 / totalGrams) : blank();
    var perServing = scale(whole, 1 / servings);

    var netCarbW = Math.max(0, whole.carb - whole.fiber);
    var netCarbS = Math.max(0, perServing.carb - perServing.fiber);
    var kcalFromP = perServing.protein * 4, kcalFromC = perServing.carb * 4, kcalFromF = perServing.fat * 9;
    var kcalMacro = kcalFromP + kcalFromC + kcalFromF || 1;

    return {
      whole: whole, perServing: perServing, per100g: per100,
      cooking: cooking, cookGrams: cookGrams,
      totalGrams: totalGrams, servings: servings,
      netCarbs: { whole: netCarbW, perServing: netCarbS },
      macroPct: {
        protein: kcalFromP / kcalMacro, carb: kcalFromC / kcalMacro, fat: kcalFromF / kcalMacro,
      },
      flags: {
        keto: netCarbS <= 10,
        highProtein: (kcalFromP / kcalMacro) >= 0.30 || perServing.protein >= 25,
      },
    };
  }

  var API = {
    parseLine: parseLine, resolve: resolve, toGrams: toGrams, computeTotals: computeTotals,
    cleanFood: cleanFood, KEYS: KEYS,
    // one-shot: parse+resolve+grams a whole textarea against DB
    analyze: function (text, DB, opts) {
      var lines = String(text).split(/\n+/).map(parseLine).filter(Boolean);
      lines.forEach(function (L) {
        L.resolved = resolve(L.foodText, DB);
        if (L.resolved.food) {
          var gr = toGrams(L.qty, L.unit, L.resolved.food, DB);
          L.grams = gr.grams; L.gramMethod = gr.method; L.gramLow = !!gr.low;
        }
      });
      return { lines: lines, totals: computeTotals(lines, opts) };
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RCCEngine = API;
})(typeof self !== 'undefined' ? self : this);
