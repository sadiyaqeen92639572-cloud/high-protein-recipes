/*
 * build-food-db.js — USDA SR Legacy CSV  ->  data/foods.json + food-aliases.json
 *
 * Zero-dep Node. One-time-ish: run when the allowlist or the USDA dump changes.
 *
 * Prereq: download FoodData_Central_sr_legacy_food_csv_*.zip from
 *   https://fdc.nal.usda.gov/download-datasets  ->  unzip into ../.usda-src-high-protein/ (or set $USDA_SRC)
 *   (needs: food.csv, nutrient.csv, food_nutrient.csv, food_portion.csv)
 * that dir lives OUTSIDE the repo (Pages 25 MiB file cap) and is untracked (~large).
 *
 * Reads scripts/food-allowlist.csv  (curated list of foods to keep).
 * Writes  data/foods.json  data/food-aliases.json
 * Fails hard (exit 1) if any allowlisted food resolves to kcal == 0.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = process.env.USDA_SRC || path.join(__dirname, '..', '..', '.usda-src-high-protein');
const OUT_DIR = path.join(__dirname, '..', 'data');
const ALLOWLIST = path.join(__dirname, 'food-allowlist.csv');

// SR nutrient numbers (nutrient.nutrient_nbr) -> our per100g keys
const WANT = {
  '208': 'kcal',
  '203': 'protein',
  '204': 'fat',
  '205': 'carb',
  '291': 'fiber',
  '269': 'sugar',
  '307': 'sodium',
  '606': 'satfat',
  '601': 'chol',
};
const REQUIRED_KEYS = ['kcal', 'protein', 'fat', 'carb']; // build fails if kcal missing/zero

// In a RECIPE ingredient list, a bare grain/legume/veg/meat is the RAW/DRY form — you cook it
// in the recipe. So bare canonical -> raw/first entry, always. The engine flags any
// state-carrying food resolved without an explicit cru/cuit token ("assumed raw/dry — correct?").
const COOKED_BARE = new Set();

// targeted portion fixes where the USDA entry's "cup" is a different physical form
// (e.g. fdc 169705 "Oats" cup = 156 g = steel-cut; rolled oats are ~81 g/cup) or is absent.
const PORTION_OVERRIDE = {
  'oats-raw': [{ label: 'cup', grams: 81 }, { label: 'tbsp', grams: 5 }],
  'nonfat-greek-yogurt': [{ label: 'cup', grams: 245 }, { label: 'tbsp', grams: 15 }, { label: 'container', grams: 170 }],
  'plain-yogurt': [{ label: 'cup', grams: 245 }, { label: 'tbsp', grams: 15 }],
  'chia-seeds': [{ label: 'tbsp', grams: 12 }, { label: 'cup', grams: 168 }],
};

// ---- minimal CSV parser (quoted fields, commas, CRLF) -----------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(name) {
  const raw = fs.readFileSync(path.join(SRC, name), 'utf8');
  const rows = parseCSV(raw);
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

// ---- allowlist -------------------------------------------------------------
// columns: fdc_id, canonical_name, state (raw|cooked|""), aliases (|-sep), pseo (0|1)
function readAllowlist() {
  const raw = fs.readFileSync(ALLOWLIST, 'utf8');
  const rows = parseCSV(raw);
  const header = rows.shift().map(h => h.trim());
  const idx = k => header.indexOf(k);
  return rows.filter(r => r.length > 1 && r[idx('fdc_id')].trim()).map(r => ({
    fdc_id: r[idx('fdc_id')].trim(),
    name: r[idx('canonical_name')].trim(),
    state: (r[idx('state')] || '').trim() || null,
    aliases: (r[idx('aliases')] || '').split('|').map(s => s.trim()).filter(Boolean),
    pseo: (r[idx('pseo')] || '').trim() === '1',
  }));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${SRC} — download & unzip the USDA SR Legacy CSV dump there first.`);
    process.exit(1);
  }
  const allow = readAllowlist();
  const wantIds = new Set(allow.map(a => a.fdc_id));

  // nutrient.csv: id -> nutrient_nbr
  const nutrientById = {};
  for (const n of readTable('nutrient.csv')) {
    if (WANT[n.nutrient_nbr]) nutrientById[n.id] = WANT[n.nutrient_nbr];
  }

  // food_nutrient.csv: fdc_id -> { key: amount }  (per 100 g in SR Legacy)
  const nutrById = {};
  for (const fn of readTable('food_nutrient.csv')) {
    if (!wantIds.has(fn.fdc_id)) continue;
    const key = nutrientById[fn.nutrient_id];
    if (!key) continue;
    (nutrById[fn.fdc_id] || (nutrById[fn.fdc_id] = {}))[key] = parseFloat(fn.amount) || 0;
  }

  // food_portion.csv: fdc_id -> [{label, grams}]   (label = the unit name; grams = for ONE unit)
  const portById = {};
  for (const fp of readTable('food_portion.csv')) {
    if (!wantIds.has(fp.fdc_id)) continue;
    const grams = parseFloat(fp.gram_weight);
    if (!grams) continue;
    const amount = parseFloat(fp.amount) || 1;
    const label = (fp.modifier || fp.portion_description || 'portion').trim().toLowerCase();
    if (!label) continue;
    (portById[fp.fdc_id] || (portById[fp.fdc_id] = [])).push({
      label,
      grams: Math.round((grams / amount) * 10) / 10,
    });
  }

  const foods = [];
  const aliases = {};
  const failures = [];

  for (const a of allow) {
    const per100g = nutrById[a.fdc_id] || {};
    for (const k of REQUIRED_KEYS) {
      if (!(per100g[k] > 0) && !(k !== 'kcal' && per100g[k] === 0)) {
        // kcal must be > 0; macros may legitimately be 0 but kcal==0 => bad join
      }
    }
    if (!(per100g.kcal > 0)) { failures.push(`${a.fdc_id} ${a.name} (kcal=${per100g.kcal})`); continue; }

    const id = slugify(a.state ? `${a.name}-${a.state}` : a.name);
    const rec = {
      id,
      fdcId: a.fdc_id,
      name: a.name,
      state: a.state,
      aliases: a.aliases,
      per100g: {
        kcal: round(per100g.kcal), protein: round(per100g.protein), carb: round(per100g.carb),
        fat: round(per100g.fat), fiber: round(per100g.fiber), sugar: round(per100g.sugar),
        sodium: round(per100g.sodium), satfat: round(per100g.satfat), chol: round(per100g.chol),
      },
      portions: dedupePortions(portById[a.fdc_id] || []),
      pseo: a.pseo,
    };
    if (PORTION_OVERRIDE[id]) {
      const ovr = new Set(PORTION_OVERRIDE[id].map(p => p.label));
      rec.portions = PORTION_OVERRIDE[id].concat(rec.portions.filter(p => !ovr.has(p.label)));
    }
    foods.push(rec);

    // alias map: state-qualified variants + explicit aliases + plural. NOT the bare canonical
    // name yet (handled in a 2nd pass so cru/cuit default is deterministic).
    const keys = new Set(a.aliases.map(s => s.toLowerCase()));
    if (a.state) {
      keys.add(`${a.state} ${a.name}`.toLowerCase());
      keys.add(`${a.name} ${a.state}`.toLowerCase());
      keys.add(`${a.name}, ${a.state}`.toLowerCase());
    } else {
      keys.add(a.name.toLowerCase());
    }
    for (const k of [...keys]) { keys.add(k + 's'); keys.add(k.replace(/y$/, 'ies')); }
    for (const k of keys) if (k && !(k in aliases)) aliases[k] = id;
  }

  // 2nd pass: bare canonical name -> cooked entry if in COOKED_BARE, else raw/first entry
  const BARE_SYNONYM = { rice: 'white rice', noodles: 'pasta', spaghetti: 'pasta', mince: 'ground beef' };
  const byCanon = {};
  for (const f of foods) (byCanon[f.name] || (byCanon[f.name] = [])).push(f);
  const pickFor = {};
  for (const [canon, variants] of Object.entries(byCanon)) {
    let pick;
    if (variants.length === 1) pick = variants[0];
    else if (COOKED_BARE.has(canon)) pick = variants.find(v => v.state === 'cooked') || variants[0];
    else pick = variants.find(v => v.state === 'raw') || variants[0];
    pickFor[canon] = pick;
    for (const k of [canon, canon + 's', canon.replace(/y$/, 'ies')]) aliases[k] = pick.id;
  }
  for (const [bare, canon] of Object.entries(BARE_SYNONYM)) {
    if (pickFor[canon]) { aliases[bare] = pickFor[canon].id; aliases[bare + 's'] = pickFor[canon].id; }
  }

  if (failures.length) {
    console.error('BUILD FAILED — allowlisted foods with kcal == 0 (bad nutrient join?):');
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'foods.json'), JSON.stringify(foods, null, 0) + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'food-aliases.json'), JSON.stringify(aliases, null, 0) + '\n');
  const pseoN = foods.filter(f => f.pseo).length;
  console.log(`OK  ${foods.length} foods  (${pseoN} pseo)  ${Object.keys(aliases).length} aliases`);
}

function round(n) { return n == null ? 0 : Math.round(n * 100) / 100; }
function dedupePortions(list) {
  const seen = new Set(), out = [];
  for (const p of list) {
    if (!p.label || seen.has(p.label)) continue;
    seen.add(p.label); out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

main();
