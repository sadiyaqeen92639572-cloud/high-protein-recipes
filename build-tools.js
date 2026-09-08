/*
 * build-tools.js — emit the recipe calorie calculator page, its data file,
 * the /calories-in/<food>/ pSEO pages, 404.html, and patch sitemap.xml.
 * Zero-dep Node. Run:  node build-tools.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE = 'https://realproteinkitchen.com';
const SITE_NAME = 'High Protein Recipes';
const foods = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/foods.json'), 'utf8'));
const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/food-aliases.json'), 'utf8'));
const densities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/densities.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tool-pages.json'), 'utf8'));

// ---- shared chrome -------------------------------------------------------
const STYLE = `
:root{--bg:#fffaf5;--text:#2b2119;--accent:#c96f4a;--muted:#7a6a5c;--border:#eee0d3;}
html{font-size:18px;}
body{font-family:Georgia,'Times New Roman',serif;background:var(--bg);color:var(--text);margin:0;line-height:1.7;}
.wrap{max-width:960px;margin:0 auto;padding:1.5rem;}
h1{font-family:Inter,sans-serif;font-size:2rem;max-width:640px;}
h2{font-family:Inter,sans-serif;font-size:1.35rem;margin-top:2.5rem;}
h3{font-family:Inter,sans-serif;font-size:1.05rem;}
a{color:var(--accent);}
.meta{font-family:Inter,sans-serif;color:var(--muted);font-size:.85rem;}
.prose{max-width:680px;}
.prose p{margin:1rem 0;}
.faq-item{max-width:680px;margin:1.4rem 0;}
.faq-item h3{margin-bottom:.3rem;}
.faq-item p{margin:0;color:var(--muted);}
table.data{border-collapse:collapse;width:100%;max-width:680px;font-family:Inter,sans-serif;font-size:.9rem;}
table.data th,table.data td{border:1px solid var(--border);padding:.5rem .7rem;text-align:left;}
table.data th{background:#fff;}
@media(max-width:600px){.wrap{padding:1rem;}h1{font-size:1.5rem;}}
`;
const FOOTER = `<footer style="max-width:720px;margin:0 auto;padding:24px 16px;text-align:center;">
  <p style="font-size:.72rem;color:#666;">${SITE_NAME} is part of Gesmine-Invest Limited, registered UK company number 14120136, registered office address at Hardy House, 269 Poynders Gardens, London, London, United Kingdom, SW4 8PQ.</p>
</footer>`;
const ORG_NODE = {
  '@type': 'Organization', name: SITE_NAME, legalName: 'Gesmine-Invest Limited',
  identifier: { '@type': 'PropertyValue', propertyID: 'UK Company Number', value: '14120136' },
  address: { '@type': 'PostalAddress', streetAddress: 'Hardy House, 269 Poynders Gardens', addressLocality: 'London', postalCode: 'SW4 8PQ', addressCountry: 'GB' },
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const crumbs = items => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});
const faqNode = faq => ({
  '@type': 'FAQPage',
  mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
function shell({ title, desc, canonical, ogImage, jsonLd, body, extraHead = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${STYLE}</style>${extraHead}
</head>
<body>
<div class="wrap">
${body}
</div>
${FOOTER}
</body>
</html>
`;
}

// ---- 1. calculator page ------------------------------------------------
function buildCalculator() {
  const c = pages.calculator;
  const canonical = `${SITE}/${c.slug}/`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication', name: c.h1, url: canonical, applicationCategory: 'HealthApplication',
        operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: c.metaDescription, isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE + '/' },
      },
      crumbs([{ name: SITE_NAME, url: SITE + '/' }, { name: 'Recipe Calorie Calculator', url: canonical }]),
      faqNode(c.faq),
      ORG_NODE,
    ],
  };
  const proseSections = c.sections.map(s => `<h2>${esc(s.h2)}</h2>\n${s.html}`).join('\n');
  const faqHtml = c.faq.map(f => `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('\n');
  const body = `
  <p class="meta"><a href="/">${SITE_NAME}</a> &rsaquo; Recipe Calorie Calculator</p>
  <h1>${esc(c.h1)}</h1>
  <div class="prose">${c.intro.map(p => `<p>${esc(p)}</p>`).join('')}</div>

  <div id="rcc-app">
    <label for="rcc-input" class="meta">Ingredients — one per line</label>
    <textarea id="rcc-input" rows="9" spellcheck="false" placeholder="200 g chicken breast&#10;1 cup white rice, cooked&#10;1 tbsp olive oil&#10;2 cups broccoli"></textarea>
    <div class="rcc-controls">
      <label>Servings <input id="rcc-servings" type="number" min="1" value="4" inputmode="numeric"></label>
      <label>Cooking method
        <select id="rcc-method">
          <option value="none">raw / not cooked</option>
          <option value="baked">baked / roasted</option>
          <option value="pan">pan-fried</option>
          <option value="deep-fried">deep-fried</option>
        </select>
      </label>
      <label>Added oil / butter (tbsp) <input id="rcc-fat" type="number" min="0" step="0.5" value="0" inputmode="decimal"></label>
      <button id="rcc-go" type="button">Calculate</button>
    </div>
    <p id="rcc-status" class="meta" role="status"></p>

    <div id="rcc-results" hidden>
      <div class="tbl-scroll"><table class="data" id="rcc-totals"></table></div>
      <p class="meta" id="rcc-flags"></p>
      <p class="meta">Estimates calculated from USDA SR Legacy. Not a substitute for advice from a dietitian.</p>
      <button id="rcc-label-toggle" type="button">Show nutrition label</button>
      <div id="rcc-label" hidden></div>
      <h2>What matched</h2>
      <div class="tbl-scroll"><table class="data" id="rcc-transparency"></table></div>
      <p class="meta">Data: USDA FoodData Central, SR Legacy — a fixed dataset, last revised 2018.</p>
      <!-- affiliate slot (inert until an account exists)
      <div id="rcc-affil"></div> -->
    </div>
  </div>

  <div class="prose">${proseSections}</div>
  <h2>Frequently asked questions</h2>
  ${faqHtml}
  <p class="meta"><a href="/">More high-protein recipes</a> &middot; <a href="/soup/">Soups</a> &middot; <a href="/meal-prep/">Meal prep</a></p>
`;
  const extraHead = `
<link rel="stylesheet" href="/${c.slug}/calc.css">
<script defer src="/${c.slug}/engine.js"></script>
<script defer src="/${c.slug}/foods.js"></script>
<script defer src="/${c.slug}/calc.js"></script>`;
  const dir = path.join(ROOT, c.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), shell({
    title: c.metaTitle, desc: c.metaDescription, canonical,
    ogImage: `${SITE}/images/high-protein-chicken-soup/hero.jpg`, jsonLd, body, extraHead,
  }));
  fs.writeFileSync(path.join(dir, 'foods.js'),
    `window.__RCC__=${JSON.stringify({ foods, aliases, densities })};\n`);
  return `${SITE}/${c.slug}/`;
}

// ---- 2. pSEO /calories-in/<slug>/ ------------------------------------
function fill(str, f) {
  const p = f.per100g;
  const net = Math.max(0, (p.carb || 0) - (p.fiber || 0));
  var Name = f.name.charAt(0).toUpperCase() + f.name.slice(1);
  return str
    .replace(/\{TITLE\}/g, Name)
    .replace(/\{NAME\}/g, f.name)
    .replace(/\{KCAL\}/g, Math.round(p.kcal))
    .replace(/\{PROTEIN\}/g, r1(p.protein))
    .replace(/\{CARB\}/g, r1(p.carb))
    .replace(/\{FIBER\}/g, r1(p.fiber))
    .replace(/\{FAT\}/g, r1(p.fat))
    .replace(/\{NETCARB\}/g, r1(net));
}
const r1 = n => (Math.round((n || 0) * 10) / 10);

function buildPseo() {
  const t = pages.pseoTemplate;
  const urls = [];
  for (const f of foods.filter(x => x.pseo)) {
    const slug = 'calories-in-' + f.id.replace(/-(raw|cooked)$/, '');
    const canonical = `${SITE}/${slug}/`;
    const p = f.per100g;
    const rows = ['kcal', 'protein', 'carb', 'fiber', 'sugar', 'fat', 'satfat', 'sodium', 'chol']
      .map(k => `<tr><td>${label(k)}</td><td>${fmt(k, p[k])}</td></tr>`).join('');
    const portRows = (f.portions || []).slice(0, 6)
      .map(pt => `<tr><td>${esc(pt.label)}</td><td>${pt.grams} g</td><td>${Math.round(p.kcal * pt.grams / 100)} kcal</td></tr>`).join('');
    const faq = t.faqTemplate.map(q => ({ q: fill(q.q, f), a: fill(q.a, f) }));
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        crumbs([{ name: SITE_NAME, url: SITE + '/' }, { name: 'Calories in ' + f.name, url: canonical }]),
        faqNode(faq),
        ORG_NODE,
      ],
    };
    const body = `
  <p class="meta"><a href="/">${SITE_NAME}</a> &rsaquo; Calories in ${esc(f.name)}</p>
  <h1>${fill(t.h1, f)}</h1>
  <div class="prose"><p>${fill(t.introTemplate, f)}</p></div>
  <h2>Nutrition per 100 g</h2>
  <table class="data"><tr><th>Nutrient</th><th>Per 100 g</th></tr>${rows}</table>
  ${portRows ? `<h2>Common portions</h2><table class="data"><tr><th>Portion</th><th>Weight</th><th>Calories</th></tr>${portRows}</table>` : ''}
  <h2>Log ${esc(f.name)} in a recipe</h2>
  <div class="prose"><p>To see how ${esc(f.name)} affects a whole dish, drop it into the <a href="/recipe-calorie-calculator/">recipe calorie calculator</a> with the rest of your ingredients — it totals calories, protein, carbs and net carbs for the recipe, per serving and per 100 g.</p></div>
  <h2>Frequently asked questions</h2>
  ${faq.map(q => `<div class="faq-item"><h3>${esc(q.q)}</h3><p>${esc(q.a)}</p></div>`).join('\n')}
  <p class="meta">Source: USDA FoodData Central, SR Legacy (fixed dataset, last revised 2018). Estimates only.</p>
`;
    const dir = path.join(ROOT, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), shell({
      title: fill(t.metaTitle, f), desc: fill(t.metaDescription, f), canonical,
      ogImage: `${SITE}/images/high-protein-chicken-soup/hero.jpg`, jsonLd, body,
    }));
    urls.push(canonical);
  }
  return urls;
}
function label(k) {
  return { kcal: 'Calories', protein: 'Protein', carb: 'Carbohydrate', fiber: 'Fibre', sugar: 'Sugars', fat: 'Fat', satfat: 'Saturated fat', sodium: 'Sodium', chol: 'Cholesterol' }[k];
}
function fmt(k, v) {
  v = v || 0;
  if (k === 'kcal') return Math.round(v) + ' kcal';
  if (k === 'sodium' || k === 'chol') return Math.round(v) + ' mg';
  return (Math.round(v * 10) / 10) + ' g';
}

// ---- 3. 404 --------------------------------------------------------
function build404() {
  const body = `<h1>Page not found</h1><p class="prose">That page doesn't exist. Try the <a href="/">homepage</a> or the <a href="/recipe-calorie-calculator/">recipe calorie calculator</a>.</p>`;
  fs.writeFileSync(path.join(ROOT, '404.html'), shell({
    title: 'Page not found | ' + SITE_NAME, desc: 'Page not found.', canonical: SITE + '/404.html',
    ogImage: `${SITE}/images/high-protein-chicken-soup/hero.jpg`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [ORG_NODE] }, body,
  }));
}

// ---- 4. sitemap patch (flat <url><loc>…</loc></url>, idempotent) ------
function patchSitemap(newUrls) {
  const p = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(p, 'utf8');
  let added = 0;
  for (const u of newUrls) {
    if (xml.indexOf(`<loc>${u}</loc>`) !== -1) continue;
    xml = xml.replace('</urlset>', `  <url><loc>${u}</loc></url>\n</urlset>`);
    added++;
  }
  fs.writeFileSync(p, xml);
  return added;
}

// ---- run ---------------------------------------------------------
const calcUrl = buildCalculator();
const pseoUrls = buildPseo();
build404();
const added = patchSitemap([calcUrl, ...pseoUrls]);
console.log(`OK  calculator + ${pseoUrls.length} pSEO pages + 404.html  |  sitemap +${added} url(s)`);
