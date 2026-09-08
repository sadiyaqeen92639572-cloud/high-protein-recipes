/*
 * test-resolver.js — run the engine against real recipe ingredient lines
 * pulled from content/recipes/*.json. Prints match rate + every unresolved line.
 *   node scripts/test-resolver.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../recipe-calorie-calculator/engine.js');

const DB = {
  foods: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/foods.json'), 'utf8')),
  aliases: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/food-aliases.json'), 'utf8')),
  densities: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/densities.json'), 'utf8')),
};

const recDir = path.join(__dirname, '../content/recipes');
let lines = [];
for (const f of fs.readdirSync(recDir).filter(f => f.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(recDir, f), 'utf8'));
  (r.ingredients || []).forEach(i => lines.push(i));
}
// sample ~60 spread across the set
const step = Math.max(1, Math.floor(lines.length / 60));
lines = lines.filter((_, i) => i % step === 0);

let exact = 0, fuzzy = 0, none = 0;
const misses = [], fuzzies = [];
for (const raw of lines) {
  const p = E.parseLine(raw);
  if (!p) continue;
  const res = E.resolve(p.foodText, DB);
  let grams = null;
  if (res.food) grams = E.toGrams(p.qty, p.unit, res.food, DB);
  const tag = `${String(p.qty).padStart(4)} ${(p.unit || '·').padEnd(5)} ${p.foodText.padEnd(34).slice(0, 34)}`;
  if (res.confidence === 'exact') { exact++; }
  else if (res.confidence === 'fuzzy') { fuzzy++; fuzzies.push(`${tag} -> ${res.food.id}  (${res.note})  [${grams && grams.method}]`); }
  else { none++; misses.push(`${tag} -> UNRESOLVED`); }
}
const tot = exact + fuzzy + none;
console.log(`\nlines tested: ${tot}   exact ${exact} (${pct(exact)})   fuzzy ${fuzzy} (${pct(fuzzy)})   none ${none} (${pct(none)})\n`);
console.log('--- FUZZY (eyeball for wrong matches) ---'); fuzzies.forEach(l => console.log('  ' + l));
console.log('\n--- UNRESOLVED ---'); misses.forEach(l => console.log('  ' + l));
function pct(n) { return (100 * n / tot).toFixed(0) + '%'; }
