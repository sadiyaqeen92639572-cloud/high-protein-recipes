const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://realproteinkitchen.com';
const SITE_NAME = 'High Protein Recipes';

function loadRecipe(slug) {
  const file = path.join(__dirname, 'content', 'recipes', `${slug}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function formatDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  if (h === 0 && min === 0) return '0 min';
  const parts = [];
  if (h > 0) parts.push(`${h} hr`);
  if (min > 0) parts.push(`${min} min`);
  return parts.join(' ');
}

function buildJsonLd(r) {
  const graph = [
    {
      '@type': 'Recipe',
      name: r.title,
      image: [`${SITE_URL}/images/${r.slug}/hero.jpg`],
      author: { '@type': 'Person', name: r.author },
      datePublished: r.datePublished,
      description: r.metaDescription,
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      totalTime: r.totalTime,
      recipeYield: r.recipeYield,
      recipeCategory: r.recipeCategory,
      recipeCuisine: r.recipeCuisine,
      keywords: r.keywords,
      recipeIngredient: r.ingredients,
      recipeInstructions: r.steps.map(s => ({ '@type': 'HowToStep', name: s.name, text: s.text })),
      nutrition: {
        '@type': 'NutritionInformation',
        calories: `${r.nutrition.calories} calories`,
        proteinContent: r.nutrition.proteinContent,
        carbohydrateContent: r.nutrition.carbohydrateContent,
        fatContent: r.nutrition.fatContent
      }
    }
  ];

  // Règle skill Phase 4 / checklist Phase 6 : aggregateRating SEULEMENT si reviewCount > 0
  if (r.reviewCount > 0) {
    graph[0].aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: r.avgRating,
      ratingCount: r.reviewCount
    };
  }

  if (r.tips && r.tips.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: r.tips.map(t => ({
        '@type': 'Question',
        name: t.question,
        acceptedAnswer: { '@type': 'Answer', text: t.answer }
      }))
    });
  }

  graph.push({
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: 'Gesmine-Invest Limited',
    identifier: { '@type': 'PropertyValue', propertyID: 'UK Company Number', value: '14120136' },
    address: { '@type': 'PostalAddress', streetAddress: 'Hardy House, 269 Poynders Gardens', addressLocality: 'London', postalCode: 'SW4 8PQ', addressCountry: 'GB' }
  });

  return { '@context': 'https://schema.org', '@graph': graph };
}

function buildStepsHtml(r) {
  return r.steps.map((s, i) => `
        <li class="recipe-step">
          <strong>${i + 1}. ${s.name}</strong>
          <p>${s.text}</p>
          ${i === 1 ? `<img src="/images/${r.slug}/texture.jpg" alt="${r.images.textureAlt}" loading="lazy" class="step-photo">` : ''}
        </li>`).join('\n');
}

function buildFaqHtml(r) {
  return r.tips.map(t => `
      <div class="faq-item">
        <h3 class="faq-question">${t.question}</h3>
        <p class="faq-answer">${t.answer}</p>
      </div>`).join('\n');
}

function buildIngredientsHtml(r) {
  return r.ingredients.map(i => `<li>${i}</li>`).join('\n        ');
}

const TEMPLATE = (r, jsonLd) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${r.title} — ${r.nutrition.proteinContent} Protein, ${formatDuration(r.totalTime)} | ${SITE_NAME}</title>
<meta name="description" content="${r.metaDescription}">
<link rel="canonical" href="${SITE_URL}/${r.hubPath}/${r.slug}/">
<meta property="og:title" content="${r.title}">
<meta property="og:description" content="${r.metaDescription}">
<meta property="og:image" content="${SITE_URL}/images/${r.slug}/hero.jpg">
<meta property="og:type" content="article">
<meta name="pinterest-rich-pin" content="true">
<script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
<style>
  :root{--bg:#fffaf5;--text:#2b2119;--accent:#c96f4a;--muted:#7a6a5c;--border:#eee0d3;}
  html{font-size:18px;}
  body{font-family:Georgia,'Times New Roman',serif;background:var(--bg);color:var(--text);margin:0;line-height:1.7;}
  .wrap{max-width:760px;margin:0 auto;padding:1.5rem;}
  .hero{width:100%;max-height:65vh;object-fit:cover;border-radius:12px;margin:1rem 0;display:block;}
  h1{font-family:Inter,sans-serif;font-size:2rem;line-height:1.2;}
  .meta{color:var(--muted);font-size:0.9rem;margin-bottom:1.5rem;}
  .jump-btn{display:inline-block;background:var(--accent);color:#fff;padding:0.6rem 1.2rem;border-radius:8px;text-decoration:none;font-family:Inter,sans-serif;font-weight:600;margin:1rem 0;}
  .story p{margin:1rem 0;}
  .step-photo{width:100%;max-height:55vh;object-fit:cover;border-radius:10px;margin:0.75rem 0;display:block;}
  @media (max-width:600px){
    .wrap{padding:1rem;}
    h1{font-size:1.5rem;}
    .hero{max-height:45vh;}
    .step-photo{max-height:40vh;}
    .recipe-meta-row{gap:0.8rem;font-size:0.78rem;}
    .pin-cta{flex-direction:row;align-items:flex-start;}
  }
  #recipe-card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:1.5rem;margin:2rem 0;}
  #recipe-card h2{font-family:Inter,sans-serif;margin-top:0;}
  .recipe-meta-row{display:flex;gap:1.5rem;flex-wrap:wrap;font-family:Inter,sans-serif;font-size:0.85rem;color:var(--muted);margin-bottom:1rem;}
  .ingredients{list-style:disc;padding-left:1.3rem;}
  .steps-list{list-style:none;padding:0;}
  .recipe-step{margin-bottom:1.2rem;}
  .faq-section{margin:2rem 0;}
  .faq-question{font-family:Inter,sans-serif;font-size:1.05rem;}
  .pin-cta{display:flex;align-items:center;gap:0.8rem;background:#fdf0e8;border-radius:10px;padding:0.8rem;margin:1.5rem 0;}
  .pin-cta img{width:60px;height:80px;object-fit:cover;border-radius:6px;}
</style>
</head>
<body>
<div class="wrap">
  <p class="meta"><a href="/">${SITE_NAME}</a> &rsaquo; <a href="/${r.hubPath}/">${r.hubLabel || r.recipeCategory}</a> &rsaquo; ${r.title}</p>

  <h1>${r.title}</h1>
  <p class="meta">By ${r.author} · Published ${r.datePublished} · ${r.nutrition.proteinContent} protein per serving</p>

  <img src="/images/${r.slug}/hero.jpg" alt="${r.images.heroAlt}" class="hero" loading="eager">

  <div class="story">
    <p>${r.storyIntro[0]}</p>
    <p>${r.storyIntro[1]}</p>
  </div>

  <a href="#recipe-card" class="jump-btn">Jump to Recipe ↓</a>

  <div class="story">
    <p>${r.storyNote}</p>
  </div>

  <div class="pin-cta">
    <img src="/images/${r.slug}/pin.jpg" alt="${r.images.pinAlt}">
    <span>Save this recipe for later — pin it to your ${(r.hubLabel || r.recipeCategory).toLowerCase()} board.</span>
  </div>

  <section id="recipe-card">
    <h2>${r.title}</h2>
    <div class="recipe-meta-row">
      <span>Prep: ${formatDuration(r.prepTime)}</span>
      <span>Cook: ${formatDuration(r.cookTime)}</span>
      <span>Total: ${formatDuration(r.totalTime)}</span>
      <span>Yield: ${r.recipeYield}</span>
      <span>${r.nutrition.calories} cal · ${r.nutrition.proteinContent} protein</span>
    </div>

    <h3>Ingredients</h3>
    <ul class="ingredients">
        ${buildIngredientsHtml(r)}
    </ul>

    <h3>Instructions</h3>
    <ol class="steps-list">${buildStepsHtml(r)}
    </ol>
  </section>

  <section class="faq-section">
    <h2>Tips &amp; Common Questions</h2>
    ${buildFaqHtml(r)}
  </section>
</div>
<footer style="max-width:720px;margin:0 auto;padding:24px 16px;text-align:center;">
  <p style="font-size:.72rem;color:#666;">${SITE_NAME} is part of Gesmine-Invest Limited, registered UK company number 14120136, registered office address at Hardy House, 269 Poynders Gardens, London, London, United Kingdom, SW4 8PQ.</p>
</footer>
</body>
</html>
`;

function build(slug) {
  const r = loadRecipe(slug);
  const jsonLd = buildJsonLd(r);
  const html = TEMPLATE(r, jsonLd);
  const outDir = path.join(__dirname, r.hubPath, r.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`✅ Built /${r.hubPath}/${r.slug}/index.html`);
}

const slugArg = process.argv[2];
if (slugArg) {
  build(slugArg);
} else {
  const dir = path.join(__dirname, 'content', 'recipes');
  fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => build(f.replace('.json', '')));
}
