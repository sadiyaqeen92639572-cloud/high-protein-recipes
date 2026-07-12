# High Protein Recipes

Site de recettes hub-and-spoke ciblant le cluster "high protein" (voir skill `recipe-site-builder`
et sa référence `references/protein-cluster-example.md` pour le detail du cluster mots-clés).

## Structure

```
/                              hub pillar
/breakfast/                    3 recettes live (pancakes, overnight oats, smoothie bowl)
/cottage-cheese/                hub cross-link (3 recettes)
/snacks/                        2 recettes live (energy balls, cottage cheese dip)
/desserts/                      1 recette live (cottage cheese ice cream)
/meal-prep/                     2 recettes live (chicken & rice, turkey & sweet potato)
/dinner/                        2 recettes live (air fryer chicken, sheet pan salmon)
/diet-plans/                    roundup cross-link (disclaimer santé, pas une recette)
content/recipes/[slug].json    données recette (reviews-ready : reviewCount=0, avgRating=null)
images/[slug]/{hero,pin,texture}.png   générées via kie.ai z-image
build-recipe-page.js           node build-recipe-page.js [slug]  →  génère pages/[hub]/[slug]/index.html
```

## Ajouter une nouvelle recette

1. Créer `content/recipes/[slug].json` (copier le format de `cottage-cheese-pancakes.json`, garder `reviews: []`, `reviewCount: 0`, `avgRating: null`)
2. Générer les 3 images (hero/pin/texture) via kie.ai z-image (voir skill `recipe-site-builder` Phase 3 pour les prompts — jamais mentionner marque/modèle caméra)
3. `node build-recipe-page.js [slug]`
4. Ajouter la card sur la page hub correspondante (`/breakfast/index.html` etc.)
5. Ajouter l'URL à `sitemap.xml`

## Déploiement

Déployé sur Cloudflare Pages : https://realproteinkitchen.com

```bash
npx wrangler pages deploy . --project-name=high-protein-recipes
```

Domaine `realproteinkitchen.com` connecté (Cloudflare Registrar, zone active, cert SSL émis). Google Search Console vérifié.

`aggregateRating` ne doit être ajouté au schema QUE quand `reviewCount > 0` — déjà géré automatiquement par `build-recipe-page.js`.

## Free Companion Tools

- [Daily Protein Intake Calculator](https://sadiyaqeen92639572-cloud.github.io/protein-intake-calculator/) — enter body weight + goal (sedentary/active/muscle building/cutting/endurance) for an instant daily protein gram target, calories, and per-meal split. Powered by realproteinkitchen.com recipes to hit the number.
