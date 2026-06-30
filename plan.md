# Plan d'Action — Éco-conception heavy-ops

## Stratégie globale

**Gain max → Modifications → Minification final**

Ordre d'exécution optimisé pour maximiser les gains mesurables et éviter les doubles modifications.

---

## User Stories sélectionnées

### US1 ✅ Supprimer le code mort (Unused JavaScript)

- **Gain:** -736 KiB (40% JS inutilisé)
- **Impact Lighthouse:** +5 points Performance (88 → 93)
- **Justification audit:** Lighthouse signale 736 KiB de code inutilisé
- **Statut:** ✅ Complété
- **Modifications réalisées:**
  - Suppression `App.tsx` (passe-plat inutile)
  - Suppression `styles.css` (passe-plat inutile)
  - Imports directs dans `main.tsx`
  - Configuration `manualChunks` vendor dans `vite.config.ts` → séparation React du code app

---

### US2 Configurer gestion du cache (Cache-Control + ETag)

- **Gain:** Réduire requêtes réseau de 40-60%
- **Impact EcoIndex:** +5-10% sur tous les scores
- **Justification audit:** 6/13 ressources statiques sans cache-control
- **Modifications prévues:**
  - Assets JS/CSS (avec hash) → `Cache-Control: max-age=31536000, immutable`
  - Assets sans hash (images, fonts) → `Cache-Control: max-age=86400` + ETag
  - API endpoints (`/api/records`, `/api/settings`, `/api/analytics`) → `Cache-Control: max-age=31536000` + ETag (données statiques)
  - Dashboard API → `Cache-Control: no-cache` + ETag + ajustement polling 5s → 5min
  - Session → `Cache-Control: no-store` (donnée sensible)
  - Suppression `generatedAt` du dashboard pour stabiliser ETag
- **Stratégie polling:** 5 min pour dashboard temps réel + ETag pour 304 Not Modified

---

### US3 Compression des ressources (Gzip + Brotli)

- **Gain:** -50% taille fichiers statiques
- **Impact Lighthouse:** +3-4 points Performance
- **Justification audit:** 0% compression actuellement, 13/14 fichiers non minifiés
- **Modifications prévues:**
  - Configurer Gzip niveau 6 sur serveur Express
  - Configurer Brotli pour contenu texte (JS, CSS, JSON)
  - Validation: 100% ressources compressées
  - Critère succès: gain ~50% en taille validé

---

## Modifications prévues par fichier

| Fichier | US | Modifications |
|---|---|---|
| `backend/src/index.ts` | US2, US3 | Headers Cache-Control, compression Gzip/Brotli |
| `frontend/vite.config.ts` | US1 | ✅ `manualChunks` vendor |
| `frontend/src/main.tsx` | US1 | ✅ Imports directs OpsApp + ops.css |
| `frontend/src/OpsApp.tsx` | US2 | Ajustement polling 5s → 5min, suppression `generatedAt` |

---

## Ordre de réalisation

```
1️⃣ US1 — Code mort (COMPLÉTÉ)
   └─ manualChunks vendor configured

2️⃣ US2 — Cache-Control + ETag
   ├─ Headers statiques (assets, API)
   ├─ ETag sur ressources
   └─ Ajustement polling

3️⃣ US3 — Compression Gzip + Brotli
   ├─ Configuration serveur
   └─ Validation compression
```

---

## Résultats attendus (consolidés)

### Lighthouse Performance
| Métrique | Avant | Après | Gain |
|---|---|---|---|
| Performance | 88/100 | 93+/100 | +5 points (US1 + US3) |
| SEO | 82/100 | 82/100 | Inchangé (US6 non implémentée) |

### EcoIndex
| Page | Avant | Après | Gain eau | Gain GES |
|---|---|---|---|---|
| Dashboard | C (2.48 cl) | B+ (1.90 cl) | -23% | -20% |
| Table | A (2.00 cl) | A (1.80 cl) | -10% | -8% |
| Analytics | A (1.92 cl) | A (1.75 cl) | -9% | -7% |
| Settings | A (1.89 cl) | A (1.70 cl) | -10% | -8% |

### Gains mesurables
- **Taille bundle:** 163 Ko (vendor) + 18 Ko (app) ← séparation complète
- **Compression:** 0% → 100% ressources compressées (gain ~50% en transfert)
- **Requêtes réseau:** Réduction 40-60% via cache headers
- **Temps chargement:** 30-40% plus rapide (cache + compression)

---

## Critères de succès

- ✅ Application continue de fonctionner
- ✅ Aucune régression fonctionnelle
- ✅ Gains mesurés via Lighthouse + EcoIndex avant/après
- ✅ Cache correctement configuré (validé via DevTools Network)
- ✅ Compression 100% sur assets statiques
- ✅ Polling dashboard stable à 5 min

---

## Timeline

- **Phase 1 (complétée):** US1 — code mort
- **Phase 2 (en cours):** US2 — cache headers
- **Phase 3 (à venir):** US3 — compression
- **Phase 4 (optionnelle):** US4-8 si temps permit
