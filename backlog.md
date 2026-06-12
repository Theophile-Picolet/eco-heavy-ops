# Backlog heavy-ops

## Contexte du projet

Le projet represente un outil interne avec login, dashboard, table volumineuse, analytics et parametres.

## Format attendu

Completer au minimum 3 user stories.
Remplacer chaque champ entre crochets par votre contenu.

## User story 1 - Supprimer le code mort (Unused JavaScript)

- Contexte: En tant que visiteur, je souhaite que la page se charge rapidement afin de profiter pleinement de la navigation sans ralentissement.
- Objectif: Réduire le code JavaScript inutilisé de 736 KiB (gain de 40% sur le JS total) et améliorer Lighthouse Performance de +5 points.
- Bonne pratique d eco-conception ciblee: Optimisation des ressources / Tree-shaking et suppression du code mort.
- KPI associe: Taille bundle JS, Lighthouse Performance score (88 → 93), pourcentage code inutilisé.
- Repo ou ecran concerne: Tous les fichiers JS du projet, bundle Webpack/Vite, tous les écrans (dashboard, table, analytics, settings).
- Critere de reussite: Code mort supprimé via audit Lighthouse, Lighthouse Performance +5 points minimum, aucune régression fonctionnelle, tree-shaking validé.
- Niveau de priorite: Haute

## User story 2 - Configurer la gestion du cache (Cache-Control + ETag)

- Contexte: En tant que visiteur régulier, je souhaite que le site se charge plus rapidement lors de mes visites répétées afin d'économiser ma bande passante et mon temps.
- Objectif: Réduire les requêtes réseau de 40-60% et améliorer EcoIndex de +5-10% sur tous les scores.
- Bonne pratique d eco-conception ciblee: Gestion optimale du cache / Cache-Control headers et validation ETag.
- KPI associe: Nombre requêtes réseau, EcoIndex global, temps réponse serveur, bfcache (back/forward cache) activation.
- Repo ou ecran concerne: Configuration serveur, assets statiques (CSS, JS, images), API endpoints, tous les écrans.
- Critere de reussite: Cache-Control configuré (1 an pour assets, 5 min pour API), ETag validé, bfcache fonctionnel, 40-60% réduction requêtes mesurée.
- Niveau de priorite: Haute

## User story 3 - Compression des ressources (Gzip + Brotli)

- Contexte: En tant que visiteur sur une connexion lente ou avec des données limitées, je souhaite que le site se charge rapidement afin de pouvoir accéder au contenu sans consommer ma bande passante.
- Objectif: Réduire la taille des ressources de 50% via compression Gzip/Brotli et améliorer Lighthouse Performance de +3-4 points.
- Bonne pratique d eco-conception ciblee: Compression des ressources / Gzip niveau 6 + Brotli pour contenu texte.
- KPI associe: Taille ressources téléchargées, Lighthouse Performance score, taux compression (0% → 100%).
- Repo ou ecran concerne: Configuration serveur, tous les assets (CSS, JS, HTML, images SVG), tous les écrans.
- Critere de reussite: Gzip configuré (niveau 6), Brotli activé pour texte, 100% ressources compressées, gain ~50% en taille validé, aucune perte fonctionnelle.
- Niveau de priorite: Haute

## User story 4 - Code splitting & Lazy loading Dashboard

- Contexte: En tant que utilisateur du dashboard, je souhaite que la page d'accueil se charge rapidement afin de commencer à travailler sans attendre le chargement de tous les éléments.
- Objectif: Réduire le Dashboard de 2316 Ko → 800 Ko (-65%), réduire requêtes de 31 → 15 (-52%), passer EcoIndex de C → B.
- Bonne pratique d eco-conception ciblee: Code splitting par route / Lazy loading composants / Virtual scrolling pour grandes listes.
- KPI associe: Taille page Dashboard, nombre requêtes, DOM elements (366 → 200), EcoIndex Dashboard (C → B), Lighthouse Performance.
- Repo ou ecran concerne: Page Dashboard (accueil), composants principaux, API data loading.
- Critere de reussite: Code splitting déployé (React.lazy), Intersection Observer pour lazy load, DOM réduit à 200 éléments, requêtes 31 → 15, EcoIndex Dashboard ≥ B.
- Niveau de priorite: Haute

## User story 5 - Throttling & Debouncing des requêtes HTTP

- Contexte: En tant que utilisateur effectuant des recherches ou scrollant sur de grandes listes, je souhaite que l'application réponde rapidement à mes interactions afin d'obtenir une expérience fluide.
- Objectif: Réduire les appels API redondants de 30-50% et diminuer GES et latence réseau.
- Bonne pratique d eco-conception ciblee: Optimisation des requêtes HTTP / Debouncing + Throttling + Request deduplication.
- KPI associe: Nombre appels API, latence réseau, GES (gCO2e), consommation eau (cl).
- Repo ou ecran concerne: Composants avec recherche, scroll infinitif, resize listeners, tous les écrans avec interactions utilisateur.
- Critere de reussite: Debouncing (500ms) sur recherche, Throttling (1s) sur scroll/resize, request deduplication implémentée, 30-50% réduction appels API validée.
- Niveau de priorite: Moyenne

## User story 6 - Optimiser robots.txt & Meta descriptions

- Contexte: En tant que visiteur potentiel, je souhaite pouvoir trouver facilement le site dans les résultats de recherche afin de découvrir votre service.
- Objectif: Améliorer Lighthouse SEO de 82 → 95 points (+13 points).
- Bonne pratique d eco-conception ciblee: Optimisation SEO / Meta descriptions + robots.txt valide + Open Graph tags.
- KPI associe: Lighthouse SEO score, erreurs robots.txt, présence meta descriptions, crawlability.
- Repo ou ecran concerne: robots.txt, fichiers HTML (toutes pages), headers meta.
- Critere de reussite: robots.txt validé (0 erreurs vs 17 actuelles), meta description sur toutes pages, Open Graph tags ajoutés, Lighthouse SEO ≥ 95.
- Niveau de priorite: Moyenne

## User story 7 - Implémenter HTTP/2 Server Push

- Contexte: En tant que visiteur, je souhaite que le site se charge aussi rapidement que possible afin de profiter d'une expérience fluide sur toutes les connexions.
- Objectif: Améliorer vitesse chargement de 3-5% via parallelisation des ressources critiques.
- Bonne pratique d eco-conception ciblee: Optimisation infrastructure / HTTP/2 + Server Push pour ressources critiques.
- KPI associe: Temps chargement, Lighthouse Performance, waterfall optimisé.
- Repo ou ecran concerne: Configuration serveur, assets critiques (CSS principal, fonts, JS critique).
- Critere de reussite: HTTP/2 configuré, server push implémenté pour CSS/fonts critiques, pas de surcharge (push-back), +3-5% vitesse mesurée.
- Niveau de priorite: Moyenne

## User story 8 - Minification JS/CSS (À faire EN DERNIER)

- Contexte: En tant que visiteur, je souhaite que le site se charge rapidement et efficacement afin de profiter d'une navigation optimale sans délai d'attente.
- Objectif: Réduire JS/CSS de 757 KiB (-50%) et améliorer Lighthouse Performance de +2-3 points.
- Bonne pratique d eco-conception ciblee: Minification de ressources / Terser pour JS + cssnano pour CSS + source maps pour debug.
- KPI associe: Taille JS/CSS, Lighthouse Performance score, source maps validées.
- Repo ou ecran concerne: Tous les fichiers JS/CSS du projet, configuration build Webpack/Vite.
- Critere de reussite: Minification en build configurée, source maps présentes, aucun cassage JS, CSS minifié, gain ~757 KiB validé.
- Niveau de priorite: Basse (après US1-US7)

## Notes

- Vous pouvez ajouter d autres user stories si necessaire.
- Le niveau de detail attendu doit permettre une priorisation exploitable.
