# Fondations Éco-Conception — Architecture & Bonnes Pratiques

Document de référence pour les futures applications. Toutes les décisions architecturales doivent respecter ces principes.

---

## 1. Architecture générale (4 containers)

### Structure recommandée
```
┌─────────────────────┐
│   Nginx             │  ← Reverse proxy + static serving
│   (port 80/443)     │     Gère : cache, compression, routing
└──────────┬──────────┘
           │
      ┌────┴────────────────────┐
      │                         │
┌─────▼──────────┐      ┌──────▼─────────┐
│ Frontend       │      │ Backend API    │
│ Next.js SSG    │      │ Express/Node.js│
│ (port 3000)    │      │ (port 4100)    │
└────────────────┘      └────────┬───────┘
                                 │
                        ┌────────▼────────┐
                        │ PostgreSQL      │
                        │ (port 5432)     │
                        └─────────────────┘
```

### Responsabilités par couche

| Couche | Outil | Responsabilités |
|---|---|---|
| **Reverse proxy** | Nginx | Cache headers, compression Gzip/Brotli, TLS/SSL, routing |
| **Frontend** | Next.js SSG | Code splitting auto, SEO, assets optimisés, JS lazy-loaded |
| **Backend** | Express/Node.js | APIs, validation, business logic, CORS |
| **Base de données** | PostgreSQL | Données persistantes, indexation, requêtes optimisées |

---

## 2. Choix du stack par type de projet

### 2.0 Matrice décisionnelle : Quel stack pour quel projet ?

```
                    Fraîcheur des données
                    ↓
                    Statique    Quotidienne    Horaire    Temps réel
                    (Jamais)    (1x/jour)      (1x/heure) (< 1 min)
                    │           │              │          │
Pas de user ├─────────┬──────────┬──────────────┬──────────┤
(Public)    │ SSG     │ SSG      │ ISR (1h)     │ ISR (5m) │
            │ ⭐⭐⭐⭐⭐ │ ⭐⭐⭐⭐⭐ │ ⭐⭐⭐⭐    │ ⭐⭐⭐   │
            ├─────────┼──────────┼──────────────┼──────────┤
User unique ├─────────┬──────────┬──────────────┬──────────┤
(Login)     │ SSG*    │ SSR      │ SSR          │ SSR      │
            │ ⭐⭐⭐   │ ⭐⭐⭐   │ ⭐⭐⭐⭐    │ ⭐⭐⭐   │
            │ (Cache) │          │ (Cache API)  │ (Cache)  │
            └─────────┴──────────┴──────────────┴──────────┘

* SSG avec cache API côté client + polling throttled
```

### 2.1 Stack par cas d'usage

#### 1️⃣ **Site Vitrine** (données jamais/rarement changent)

**Exemple** : Blog, portfolio, landing page, documentation

**Caractéristiques** :
- Pas de connexion utilisateur
- Contenu statique (pages, articles)
- Mise à jour : manuelle (1x/semaine) ou jamais
- Fraîcheur : n'importe quelle, pas critique

**Stack recommandé** :
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js SSG (pure)           │
│ ├─ export const revalidate = false      │
│ ├─ Généré à la build : npx run build    │
│ └─ HTML statique servable par Nginx     │
├─────────────────────────────────────────┤
│ Backend : Option A) Pas de backend      │
│           Option B) CMS sans DB         │
│           (Contentful, Notion, etc.)    │
├─────────────────────────────────────────┤
│ Nginx : Reverse proxy statique          │
│ ├─ Cache : 365 jours (immutable)        │
│ └─ Gzip/Brotli compression              │
├─────────────────────────────────────────┤
│ DB : Optionnel (CMS externe)            │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/page.tsx (SSG pur)
export const revalidate = false; // Jamais regénérer

export default async function Home() {
  const articles = await getStaticArticles(); // À la build seulement
  return (
    <div>
      {articles.map(article => (
        <article key={article.id}>
          <h2>{article.title}</h2>
          <p>{article.content}</p>
        </article>
      ))}
    </div>
  );
}

// À la build : Next.js génère /page.html
// À runtime : Nginx sert /page.html (0ms rendu)
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;
  
  # Tous les assets : 1 an cache
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    add_header Cache-Control "public, immutable, max-age=31536000";
    expires 365d;
  }

  # Pages HTML : 1 jour (au cas où redéploiement)
  location / {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=86400";
  }
}
```

**Gains** :
- TTFB : 50ms
- Requêtes réseau : 0 (tout en cache)
- Éco : ⭐⭐⭐⭐⭐ (minimal)
- Coût infra : très bas (Nginx sert fichiers statiques)

---

#### 2️⃣ **Dashboard données statiques** (maj 1x/mois)

**Exemple** : Rapports mensuels, configuration interne, statistiques archivées

**Caractéristiques** :
- Connexion utilisateur requise
- Données changent rarement (1x/mois ou moins)
- Fraîcheur : pas critique
- Accès limité (employés seulement)

**Stack recommandé** :
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js SSG + Auth           │
│ ├─ Données : SSG (build daily ou weekly)│
│ ├─ Auth : JWT token (client-side)       │
│ └─ HTML statique pour chaque user-role  │
├─────────────────────────────────────────┤
│ Backend : Express API + Auth            │
│ ├─ /api/login (JWT generation)          │
│ ├─ /api/reports (statique, cacheable)   │
│ └─ /api/user (données utilisateur)      │
├─────────────────────────────────────────┤
│ Nginx : Cache intelligent               │
│ ├─ Assets : 1 an                        │
│ ├─ Pages HTML : 1 jour (après build)    │
│ ├─ API : 1 jour si statique             │
│ └─ Auth : no-cache                      │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                         │
│ ├─ Utilisateurs (indexé)                │
│ └─ Rapports (large, indexed, cache DB)  │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// middleware.ts (Auth)
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/reports/:path*'],
};

// app/dashboard/page.tsx (SSG pour authenticated users)
export const revalidate = 86400; // 1 jour

export default async function Dashboard() {
  const data = await getReports(); // Cached à la build
  return <ReportsView data={data} />;
}

// app/login/page.tsx (SSR pour login form)
export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async (credentials) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    const { token } = await res.json();
    document.cookie = `token=${token}; path=/`;
    window.location.href = '/dashboard';
  };

  return <LoginForm onLogin={handleLogin} />;
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Assets
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Login page (no cache)
  location = /login {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  # Dashboard (1 jour, car SSG daily)
  location /dashboard {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=86400, must-revalidate";
    # Valider avec ETag si stale
  }

  # API (1 jour si statique)
  location /api/reports {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=86400, immutable";
  }

  # API auth (never cache)
  location /api/login {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-store";
  }
}
```

**Gains** :
- TTFB : 50ms (HTML en cache)
- Requêtes API : 1-2/jour (statiques, cachées)
- Éco : ⭐⭐⭐⭐⭐
- Coût infra : très bas

---

#### 3️⃣ **Dashboard données quotidiennes** (maj 1x/jour)

**Exemple** : heavy-ops (notre projet), rapports daily, KPIs, analytics

**Caractéristiques** :
- Connexion utilisateur requise
- Données changent 1x/jour (refresh nocturne)
- Fraîcheur : bon (update quotidienne)
- User peut cliquer "Rafraîchir" manuellement

**Stack recommandé** : ⭐ **SSG + Throttling côté client**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js SSG + Client polling │
│ ├─ SSG : build daily à 23h (données fra│
│ ├─ Runtime : polling toutes les 5 min  │
│ ├─ Throttling : max 1 req/5 sec        │
│ ├─ Bouton "Rafraîchir" : throttled     │
│ └─ Auth : JWT token                    │
├─────────────────────────────────────────┤
│ Backend : Express API                  │
│ ├─ /api/dashboard (données statiques)  │
│ ├─ /api/login (JWT)                    │
│ └─ Cache DB query (Redis optional)     │
├─────────────────────────────────────────┤
│ Nginx : Cache agressif                 │
│ ├─ Assets : 1 an (immutable)           │
│ ├─ Pages HTML : 24h (SSG daily build)  │
│ ├─ API /api/dashboard : 1h (304)       │
│ └─ Auth : no-cache                     │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                        │
│ ├─ Tables indexées                     │
│ └─ Requêtes optimisées (voir US5)      │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/dashboard/page.tsx (SSG + client polling)
export const revalidate = 86400; // Rebuild daily

async function getDashboardData() {
  const res = await fetch('http://api:4100/api/dashboard', {
    next: { revalidate: 86400 }, // Cache 24h
  });
  return res.json();
}

export default async function Dashboard() {
  const initialData = await getDashboardData();
  return <DashboardClient initialData={initialData} />;
}

// components/DashboardClient.tsx (Client-side polling + throttling)
'use client';

import { useEffect, useState } from 'react';
import { throttle } from '@/lib/throttle';

export function DashboardClient({ initialData }) {
  const [data, setData] = useState(initialData);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);

  // Throttled fetch (max 1 req per 5 seconds)
  const fetchFresh = throttle(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const fresh = await res.json();
      
      if (JSON.stringify(fresh) !== JSON.stringify(data)) {
        setData(fresh);
        setLastRefresh(Date.now());
      }
    } finally {
      setIsLoading(false);
    }
  }, 5000); // Throttle 5 sec

  // Polling every 5 minutes (optional, for ultra-fresh)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFresh(); // Throttle prevents overload
    }, 300000); // 5 min

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div>Dernière mise à jour : {new Date(lastRefresh).toLocaleString()}</div>
      <SummaryCards data={data.summary} />
      <Charts data={data.charts} />
      
      <button onClick={fetchFresh} disabled={isLoading}>
        {isLoading ? 'Rafraîchissement...' : 'Rafraîchir maintenant'}
      </button>

      {/* Dashboard content */}
    </div>
  );
}

// lib/throttle.ts
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
) {
  let lastCall = 0;
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      return fn(...args);
    } else {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, delay - (now - lastCall));
    }
  };
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Assets : 1 an (immutable)
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Pages HTML : 24h (SSG daily)
  location /dashboard {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=86400, must-revalidate";
    
    # Nginx cache : si 304 Not Modified, retourner depuis cache
    proxy_cache_valid 200 86400;
    proxy_cache_key "$scheme$request_method$host$request_uri$http_authorization";
  }

  # API dashboard : 1h max
  location /api/dashboard {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
    
    # Cache response
    proxy_cache_valid 200 1h;
    add_header X-Cache-Status $upstream_cache_status;
  }

  # API login : no cache
  location /api/login {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-store";
  }
}
```

**Gains** :
- TTFB : 50ms (HTML en cache)
- Requêtes API/jour : ~150 (polling throttled)
- Éco : ⭐⭐⭐⭐ (excellent)
- Fraîcheur : ⭐⭐⭐ (bon, < 1 jour)
- Complexité : moyenne

---

#### 4️⃣ **Dashboard données horaires** (maj 1x/heure)

**Exemple** : Monitoring temps réel, logs, événements, métriques

**Caractéristiques** :
- Connexion utilisateur requise
- Données changent souvent (1x/heure ou plus)
- Fraîcheur : bonne (update horaire)
- Besoin de refresh client fréquent

**Stack recommandé** : ⭐⭐ **ISR 60 minutes**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js ISR (revalidate: 60) │
│ ├─ Build : génère HTML initial          │
│ ├─ Runtime : Nginx sert en cache        │
│ ├─ Regen : auto après 60 min            │
│ ├─ Client : polling minimal (5 min)     │
│ └─ Auth : JWT token                     │
├─────────────────────────────────────────┤
│ Backend : Express API                  │
│ ├─ /api/dashboard (fresh, cacheable)    │
│ ├─ Cache layer : Redis (pour regen)     │
│ └─ Queries optimisées                   │
├─────────────────────────────────────────┤
│ Nginx : Cache + revalidation            │
│ ├─ Assets : 1 an                        │
│ ├─ Pages HTML : 60 min                  │
│ ├─ API : 60 min (ISR regen source)      │
│ └─ ETag validation                      │
├─────────────────────────────────────────┤
│ DB : PostgreSQL + Redis cache           │
│ ├─ Tables indexées                      │
│ └─ Hot queries cached in Redis          │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/dashboard/page.tsx (ISR with 1 hour revalidation)
export const revalidate = 3600; // 60 minutes

async function getDashboardData() {
  const res = await fetch('http://api:4100/api/dashboard', {
    next: { revalidate: 3600 },
  });
  return res.json();
}

export default async function Dashboard() {
  const data = await getDashboardData();
  
  return (
    <div>
      <DashboardView data={data} />
      {/* Client-side polling optional, for ultra-fresh */}
    </div>
  );
}

// Optionnel : client polling pour ultra-fraîcheur
'use client';

import { useEffect, useState } from 'react';

export function DashboardClient({ initialData }) {
  const [data, setData] = useState(initialData);

  // Optional: polling every 5 min for latest (ISR already provides fresh data)
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch('/api/dashboard');
      const fresh = await res.json();
      setData(fresh);
    }, 300000); // 5 min

    return () => clearInterval(interval);
  }, []);

  return <DashboardView data={data} />;
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Assets : 1 an
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Pages HTML : 60 min (ISR revalidate)
  location /dashboard {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
    
    # Nginx cache + ETag validation
    proxy_cache_valid 200 3600;
    proxy_cache_revalidate on;
    add_header X-Cache-Status $upstream_cache_status;
  }

  # API : 60 min (source for ISR)
  location /api/dashboard {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
    
    # Cache + conditional request (304)
    proxy_cache_valid 200 3600;
    proxy_cache_revalidate on;
  }
}
```

**Gains** :
- TTFB : 50ms (HTML + data en cache)
- Requêtes API/jour : ~24 (regénération ISR)
- Éco : ⭐⭐⭐⭐⭐ (excellent)
- Fraîcheur : ⭐⭐⭐⭐ (très bonne)
- Complexity : moyenne

---

#### 5️⃣ **E-commerce** (fraîcheur temps réel requise)

**Exemple** : Panier, paiement, stock en temps réel, prix dynamiques

**Caractéristiques** :
- Connexion utilisateur requise
- Données **critiques** : stock, prix, panier (< 1 sec)
- Fraîcheur : **obligatoire** (temps réel)
- Chaque action = mise à jour DB immédiate

**Stack recommandé** : ⭐⭐⭐ **ISR 5-10 min + Server-Side Rendering**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js Hybrid               │
│ ├─ Catalogue : SSG ou ISR (1h)         │
│ ├─ Panier : SSR (per user)             │
│ ├─ Produit détail : ISR (5 min)        │
│ ├─ Auth : JWT + session                │
│ └─ Real-time updates : WebSocket       │
├─────────────────────────────────────────┤
│ Backend : Express + WebSocket          │
│ ├─ /api/cart (SSR, per user)           │
│ ├─ /api/product (ISR 5 min)            │
│ ├─ /api/checkout (SSR, secure)         │
│ ├─ /api/inventory (ISR 1 min)          │
│ ├─ WebSocket : real-time updates       │
│ └─ Payment provider integration        │
├─────────────────────────────────────────┤
│ Nginx : Smart cache + auth             │
│ ├─ Assets : 1 an                       │
│ ├─ Catalogue : 1h                      │
│ ├─ Produit : 5 min                     │
│ ├─ Panier : no cache (user specific)  │
│ └─ Checkout : no cache                 │
├─────────────────────────────────────────┤
│ Cache layer : Redis                    │
│ ├─ Session store                       │
│ ├─ Inventory cache                     │
│ └─ Rate limiting                       │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                        │
│ ├─ Products (indexed, partitioned)     │
│ ├─ Orders (indexed, archived)          │
│ ├─ Inventory (indexed, locked)         │
│ └─ Payment records (encrypted)         │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/products/page.tsx (SSG catalogue)
export const revalidate = 3600; // 1h

export default async function ProductsCatalogue() {
  const products = await getProducts(); // Cached 1h
  return <ProductGrid products={products} />;
}

// app/products/[id]/page.tsx (ISR product detail)
export const revalidate = 300; // 5 min

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map(p => ({ id: p.id }));
}

export default async function ProductDetail({ params }) {
  const product = await getProduct(params.id);
  const inventory = await getInventory(params.id); // Real-time check
  
  return (
    <div>
      <ProductView product={product} inventory={inventory} />
      <AddToCartButton productId={product.id} />
    </div>
  );
}

// app/cart/page.tsx (SSR per user)
export default function CartPage() {
  const [cart, setCart] = useState(null);

  useEffect(() => {
    // Fetch cart from API (no cache, user-specific)
    fetchCart().then(setCart);
  }, []);

  return <CartView cart={cart} />;
}

// app/checkout/page.tsx (SSR secure)
export default function CheckoutPage() {
  const [payment, setPayment] = useState(null);

  const handlePayment = async (cardInfo) => {
    // Call secure API (HTTPS only, no cache)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      credentials: 'include', // Session cookie
      body: JSON.stringify({ cart, cardInfo }),
      headers: { 'X-CSRF-Token': csrfToken },
    });

    const order = await res.json();
    setPayment(order);
  };

  return <CheckoutForm onPayment={handlePayment} />;
}

// WebSocket for real-time inventory
'use client';

import { useEffect } from 'react';

export function InventoryUpdater() {
  useEffect(() => {
    const ws = new WebSocket('wss://api:4100/ws/inventory');

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      // Update inventory in UI real-time
      updateProductInventory(update.productId, update.quantity);
    };

    return () => ws.close();
  }, []);

  return null;
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Assets
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Product catalogue (1h cache)
  location /products$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
  }

  # Product detail (5 min cache)
  location ~ /products/[0-9]+ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=300, must-revalidate";
  }

  # Cart (no cache, user-specific)
  location /cart {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    proxy_pass_header Authorization;
  }

  # Checkout (no cache, secure)
  location /checkout {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "no-store";
    proxy_set_header X-Forwarded-Proto https;
  }

  # API
  location /api/cart {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-store";
    proxy_pass_header Authorization;
  }

  location /api/product {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=300";
  }

  location /api/checkout {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-store";
    proxy_set_header X-Forwarded-Proto https;
  }

  # WebSocket pour inventory temps réel
  location /ws/inventory {
    proxy_pass http://api:4100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400; # 24h
  }
}
```

**Gains** :
- TTFB Catalogue : 50ms (cached)
- TTFB Produit : 50ms (ISR)
- TTFB Panier : 200ms (SSR, per user)
- Éco : ⭐⭐⭐ (good hybrid)
- Fraîcheur : ⭐⭐⭐⭐⭐ (real-time où c'est critique)

---

#### 6️⃣ **App Météo** (données très fraîches requis)

**Exemple** : Weather.com, prévisions, données geo-localisées

**Caractéristiques** :
- Pas de login (public)
- Données changent continuellement (1-10 min)
- Fraîcheur : critique (meteo change vite)
- Millions visites, haute scalabilité

**Stack recommandé** : ⭐⭐ **ISR 10 min + API cache CDN**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js ISR (revalidate: 600)│
│ ├─ Pages : ISR 10 min                   │
│ ├─ Geo-location : client-side           │
│ ├─ Cache : browser + Nginx              │
│ └─ No auth required                     │
├─────────────────────────────────────────┤
│ Backend : Express + External API        │
│ ├─ /api/weather/{city} (ISR 10 min)     │
│ ├─ Cache layer : Redis 10 min           │
│ ├─ External API: OpenWeatherMap, etc    │
│ └─ Rate limiting : 100 req/sec          │
├─────────────────────────────────────────┤
│ Nginx : Aggressive cache                │
│ ├─ Assets : 1 an                        │
│ ├─ Pages HTML : 10 min                  │
│ ├─ API : 10 min                         │
│ └─ Conditional requests (304)           │
├─────────────────────────────────────────┤
│ CDN : Cloudflare/AWS CloudFront         │
│ ├─ Serve from edge locations            │
│ ├─ Automatic cache invalidation         │
│ └─ DDoS protection                      │
├─────────────────────────────────────────┤
│ DB : Optional (caching sufficient)      │
│ └─ Redis for API response cache         │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/[city]/page.tsx (ISR with geo-targeting)
export const revalidate = 600; // 10 minutes

export async function generateStaticParams() {
  // Pre-generate top 100 cities
  const topCities = await getTopCities();
  return topCities.map(city => ({ city: city.slug }));
}

export default async function WeatherPage({ params }) {
  const weather = await getWeather(params.city);
  const forecast = await getForecast(params.city);
  
  return (
    <div>
      <CurrentWeather data={weather} />
      <Forecast data={forecast} />
    </div>
  );
}

// app/page.tsx (Client-side geo-location)
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [city, setCity] = useState('Paris');

  useEffect(() => {
    // Geo-locate user
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        const cityName = await reverseGeocode(latitude, longitude);
        setCity(cityName);
        router.push(`/${cityName}`);
      });
    }
  }, []);

  return <div>Détection de votre position...</div>;
}
```

**Nginx + CDN config** :
```nginx
# At origin (Nginx)
server {
  listen 443 ssl http2;

  # Assets (CDN)
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    add_header Cache-Control "public, immutable, max-age=31536000";
    expires 365d;
  }

  # Pages (CDN + Nginx cache)
  location ~ ^/[a-z-]+$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=600, must-revalidate";
    
    # Nginx cache
    proxy_cache_valid 200 10m;
    proxy_cache_revalidate on;
  }

  # API (CDN + Nginx)
  location /api/weather {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=600, must-revalidate";
    
    # Rate limiting
    limit_req zone=api burst=100 nodelay;
  }
}
```

**CDN (Cloudflare) règles** :
```
Cache Rule: /api/weather
  TTL: 10 minutes
  Cache everything
  
Cache Rule: /(Paris|London|Tokyo)/
  TTL: 10 minutes
  Purge on: Origin change
  
Edge cache: 1 year
Browser cache: 10 minutes
```

**Gains** :
- TTFB : 20ms (CDN edge location)
- Requêtes/jour : ~86k (ISR 10 min)
- Éco : ⭐⭐⭐⭐ (très bon avec CDN)
- Fraîcheur : ⭐⭐⭐⭐ (10 min)
- Scalabilité : ∞ (CDN)

---

### 2.2 Gestion du cache Nginx — Expliqué en détail

#### Comment fonctionne le cache Nginx ?

```
REQUEST FLOW :
│
User demande /dashboard
│
├─ Nginx cherche en cache local
│  └─ Trouvé : retourne en 10ms ✅ (pas de requête backend)
│  └─ Pas trouvé : va au backend
│
├─ Demande au backend (Next.js)
│  └─ Backend rend la page (50-500ms selon SSG/SSR)
│  └─ Retourne Response + Headers
│
├─ Nginx examine les headers (Cache-Control, ETag)
│  ├─ Cache-Control: max-age=300 ?
│  │  └─ Oui : Nginx met en cache pour 300 sec
│  └─ ETag: "abc123" ?
│     └─ Nginx utilise pour validation (304 Not Modified)
│
└─ Nginx retourne Response au client
   ├─ Envoie aussi Cache-Control header
   └─ Browser met en cache selon max-age
```

#### Cache-Control : Comprendre les directives

```nginx
# Directive 1 : public vs private
Cache-Control: public           ← N'importe qui peut cacher
Cache-Control: private          ← Seulement browser du user

# Directive 2 : max-age (durée cache)
Cache-Control: max-age=300      ← Cache 5 min
Cache-Control: max-age=86400    ← Cache 1 jour
Cache-Control: max-age=31536000 ← Cache 1 an

# Directive 3 : immutable (ne change jamais)
Cache-Control: immutable        ← Ne revalider jamais
  → Utilisé pour assets avec hash (app-abc123.js)
  → Nginx n'envoie JAMAIS de requête backend

# Directive 4 : must-revalidate (revalider si stale)
Cache-Control: must-revalidate  ← Après max-age, envoyer ETag
  → Si cache expire, Nginx envoie "If-None-Match" ETag
  → Backend répond 304 Not Modified (pas de re-render)
  → Nginx retourne cache local (très rapide)

# Directive 5 : no-cache et no-store
Cache-Control: no-cache         ← Revalider à chaque fois
  → Nginx can cache mais doit revalider avec backend
  → Backend retourne 304 (page pas modifiée)

Cache-Control: no-store         ← Ne jamais cacher
  → Nginx n'utilise PAS le cache
  → À chaque requête, aller au backend
```

#### Stratégie cache pour heavy-ops

```
ASSET STRATEGY :
┌─────────────────────────────────────────────────────┐
│ app.abc123.js (avec hash)                           │
│ Cache-Control: public, immutable, max-age=31536000  │
│                                                     │
│ Nginx :                                             │
│ ├─ Visite 1 : pas en cache → requête backend        │
│ │            → reçoit réponse → met en cache        │
│ │            → retourne au client (50ms)            │
│ │                                                   │
│ ├─ Visite 2 (10 sec après) : trouvé en cache       │
│ │                           → retourne en 10ms ✅   │
│ │                           → Nginx N'envoie PAS    │
│ │                              au backend           │
│ │                                                   │
│ └─ Visite N (1 an après) : toujours en cache ✅    │
│                            car "immutable"          │
│                            → 10ms toujours          │
│                                                     │
│ RÉSULTAT : ZERO requête backend après premier load │
└─────────────────────────────────────────────────────┘

PAGE STRATEGY (SSG) :
┌─────────────────────────────────────────────────────┐
│ /dashboard (page HTML SSG, build daily)              │
│ Cache-Control: public, max-age=86400, must-revalidate│
│                                                     │
│ Nginx :                                             │
│ ├─ Visite 1 (09:00) : pas en cache → backend       │
│ │                   → reçoit HTML + ETag: v1        │
│ │                   → met en cache + retourne       │
│ │                                                   │
│ ├─ Visite 2 (09:30) : en cache + < 86400s          │
│ │                   → retourne cache (10ms) ✅      │
│ │                   → Nginx ne va PAS au backend    │
│ │                                                   │
│ ├─ Visite 3 (23:59 + 86400s après) : cache expired │
│ │                   → Nginx → backend               │
│ │                   → Backend compare ETag          │
│ │                   → Si identique : 304 Not Mod    │
│ │                   → Nginx retourne cache (30ms) ✅│
│ │                   → Si changé (build) : 200 + HTML│
│ │                                                   │
│ └─ Résultat : Cache très efficace, revalidation 304│
│              économe (pas de re-render)             │
│                                                     │
│ RÉSULTAT : 99% des requêtes en cache < 30ms        │
└─────────────────────────────────────────────────────┘

API STRATEGY (dynamique) :
┌─────────────────────────────────────────────────────┐
│ /api/dashboard (données changent 1x/jour)           │
│ Cache-Control: public, max-age=3600, must-revalidate│
│                                                     │
│ Nginx :                                             │
│ ├─ Visite 1 (09:00) : pas en cache → backend       │
│ │                   → DB query (100ms)              │
│ │                   → JSON response + ETag          │
│ │                   → cache 1h + retourne           │
│ │                                                   │
│ ├─ Visite 2-100 (09:00-09:59) : en cache           │
│ │                        → retourne cache (10ms) ✅ │
│ │                        → 99 requests saved         │
│ │                                                   │
│ ├─ Visite 101 (10:00) : cache expired              │
│ │                    → Nginx → backend              │
│ │                    → ETag validation :            │
│ │                       a) Identique : 304          │
│ │                          → retourne cache (30ms)  │
│ │                       b) Changé : 200 + data      │
│ │                          → update cache           │
│ │                                                   │
│ └─ Économie : 99% requests sauvées, < 30ms latence │
└─────────────────────────────────────────────────────┘

AUTH STRATEGY :
┌─────────────────────────────────────────────────────┐
│ /api/login, /api/logout (données utilisateur)       │
│ Cache-Control: no-store                             │
│                                                     │
│ Nginx :                                             │
│ ├─ À CHAQUE request :                              │
│ │  ├─ Nginx reçoit request                          │
│ │  ├─ Cache-Control: no-store → pas en cache       │
│ │  ├─ Forward request au backend TOUJOURS           │
│ │  ├─ Backend valide credentials                   │
│ │  ├─ Backend génère JWT                           │
│ │  └─ Nginx retourne au client                      │
│ │                                                   │
│ └─ Pas d'économie cache (normal, données sensibles)│
└─────────────────────────────────────────────────────┘
```

#### Nginx cache avec proxy_cache

```nginx
# Define cache zone (in http block)
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m 
                 max_size=100m inactive=60m;

server {
  listen 443 ssl http2;

  # ===== ASSETS (1 year, immutable) =====
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    proxy_pass http://nextjs:3000;
    
    # Cache headers
    add_header Cache-Control "public, immutable, max-age=31536000";
    
    # Nginx cache (also cache for 365 days)
    proxy_cache my_cache;
    proxy_cache_valid 200 365d;
    proxy_cache_key "$scheme$proxy_host$request_uri";
    
    # Show cache status in header (for debugging)
    add_header X-Cache-Status $upstream_cache_status;
  }

  # ===== PAGES (1 day, with revalidation) =====
  location /dashboard {
    proxy_pass http://nextjs:3000;
    
    add_header Cache-Control "public, max-age=86400, must-revalidate";
    
    # Nginx cache with revalidation
    proxy_cache my_cache;
    proxy_cache_valid 200 1d;
    proxy_cache_revalidate on;         # Send If-None-Match
    proxy_cache_use_stale_error on;    # Use cache on backend error
    proxy_cache_key "$scheme$proxy_host$request_uri";
    
    add_header X-Cache-Status $upstream_cache_status;
  }

  # ===== API (1 hour, with condition request) =====
  location /api/dashboard {
    proxy_pass http://api:4100;
    
    add_header Cache-Control "public, max-age=3600, must-revalidate";
    
    # Nginx cache
    proxy_cache my_cache;
    proxy_cache_valid 200 1h;
    proxy_cache_revalidate on;
    proxy_cache_key "$scheme$proxy_host$request_uri";
    
    add_header X-Cache-Status $upstream_cache_status;
  }

  # ===== AUTH (no cache) =====
  location /api/login {
    proxy_pass http://api:4100;
    
    add_header Cache-Control "no-store";
    
    # Don't cache this
    proxy_cache_bypass 1;
    proxy_no_cache 1;
  }
}
```

#### Monitoring cache hit rate

```nginx
# Log cache status
log_format cache_log '$remote_addr - $remote_user [$time_local] '
                     '"$request" $status $upstream_cache_status';

access_log /var/log/nginx/cache.log cache_log;

# Check cache hits
# $ grep HIT /var/log/nginx/cache.log | wc -l
# 9543  ← 95% hit rate = très bon !
```

---

#### 7️⃣ **SaaS B2B** (données utilisateur + données partagées)

**Exemple** : Slack, Notion, Monday.com, CRM

**Caractéristiques** :
- Connexion utilisateur obligatoire
- Données **très hétérogènes** : données utilisateur (privées) + données partagées (team)
- Fraîcheur : bonne (collaboratif, updates < 1 min)
- High availability requise
- Collaboration temps réel (WebSocket)

**Stack recommandé** : ⭐⭐ **ISR 5 min + SSR user-specific + WebSocket**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js Hybrid               │
│ ├─ Public pages : SSG                   │
│ ├─ Shared boards/docs : ISR (5 min)    │
│ ├─ User workspace : SSR (per user)      │
│ ├─ Auth : JWT + session cookie          │
│ ├─ Real-time : WebSocket connection     │
│ └─ Optimistic updates (no wait)         │
├─────────────────────────────────────────┤
│ Backend : Express + WebSocket           │
│ ├─ /api/user (SSR, per user)            │
│ ├─ /api/board/{id} (ISR 5 min shared)  │
│ ├─ /api/invite (SSR, secure)            │
│ ├─ /ws/collab : WebSocket real-time    │
│ ├─ Operational transform (conflict res) │
│ └─ Event sourcing (audit log)           │
├─────────────────────────────────────────┤
│ Nginx : Session-aware cache             │
│ ├─ Public : 1h (SSG)                    │
│ ├─ Shared : 5 min (ISR)                 │
│ ├─ User : no cache (SSR)                │
│ └─ WebSocket : upgrade support          │
├─────────────────────────────────────────┤
│ Cache layer : Redis                     │
│ ├─ Session store                        │
│ ├─ Rate limiting                        │
│ ├─ Presence (who's online)              │
│ └─ Subscription manager                 │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                         │
│ ├─ Users (indexed, encrypted password)  │
│ ├─ Workspaces (indexed by user)         │
│ ├─ Documents (indexed, full-text)       │
│ ├─ Collaborations (indexed)             │
│ ├─ Audit log (append-only)              │
│ └─ Presence table (ephemeral)           │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/page.tsx (Public landing)
export const revalidate = 3600; // 1h

export default async function HomePage() {
  const features = await getFeatures(); // SSG
  return <LandingPage features={features} />;
}

// app/board/[id]/page.tsx (Shared collaborative board - ISR)
export const revalidate = 300; // 5 min

export async function generateStaticParams() {
  const publicBoards = await getPublicBoards();
  return publicBoards.map(b => ({ id: b.id }));
}

export default async function BoardPage({ params }) {
  const board = await getBoard(params.id);
  
  return (
    <div>
      <BoardView board={board} />
      <CollaborationClient boardId={params.id} />
    </div>
  );
}

// app/workspace/page.tsx (User workspace - SSR)
export default function WorkspacePage() {
  const [workspace, setWorkspace] = useState(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    // Fetch user's workspace (per-user, no cache)
    fetchWorkspace().then(setWorkspace);

    // Connect WebSocket for real-time
    const ws = new WebSocket('wss://api:4100/ws/collab');
    
    ws.onopen = () => setIsOnline(true);
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      // Apply update optimistically
      applyUpdate(workspace, update);
    };

    return () => ws.close();
  }, []);

  const handleChange = (update) => {
    // Optimistic update (apply locally)
    applyUpdate(workspace, update);
    // Send to server via WebSocket
    ws.send(JSON.stringify({ type: 'update', data: update }));
  };

  return <WorkspaceEditor workspace={workspace} onUpdate={handleChange} />;
}

// app/workspace/invite/page.tsx (Secure invitation - SSR)
export default function InvitePage() {
  const [teamMembers, setTeamMembers] = useState([]);

  const handleInvite = async (email) => {
    const res = await fetch('/api/invite', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: { 'X-CSRF-Token': csrfToken },
      credentials: 'include',
    });
    const member = await res.json();
    setTeamMembers([...teamMembers, member]);
  };

  return <InviteForm onInvite={handleInvite} />;
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Public pages (1h)
  location / {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
  }

  # Shared boards (5 min)
  location ~ ^/board/[a-z0-9-]+$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=300, must-revalidate";
    
    proxy_cache my_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_revalidate on;
  }

  # User workspace (no cache)
  location /workspace {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    proxy_pass_header Authorization;
  }

  # WebSocket (real-time collaboration)
  location /ws/collab {
    proxy_pass http://api:4100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600; # 1h
    
    # No cache for WebSocket
    add_header Cache-Control "no-store";
  }

  # API
  location /api/user {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-cache";
    proxy_pass_header Authorization;
  }

  location /api/board {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=300";
  }

  location /api/invite {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-store";
    proxy_pass_header Authorization;
  }
}
```

**Gains** :
- TTFB Public : 50ms (SSG)
- TTFB Shared board : 50ms (ISR)
- TTFB Workspace : 200ms (SSR, per user)
- Éco : ⭐⭐⭐ (good with ISR)
- Real-time : ⭐⭐⭐⭐⭐ (WebSocket)
- Scalabilité : ⭐⭐⭐⭐ (load balancer + WebSocket scaling)

---

#### 8️⃣ **Application Chat/Messaging** (temps réel obligatoire)

**Exemple** : Discord, Telegram Web, Slack

**Caractéristiques** :
- Connexion utilisateur obligatoire
- Messages temps réel (< 1 sec)
- Fraîcheur : critique (chat en live)
- Scalabilité : millions connexions simultanées
- WebSocket + Server events

**Stack recommandé** : ⭐⭐⭐ **SSR + WebSocket + Message queue**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js SSR + WebSocket      │
│ ├─ Chat pages : SSR (per user)          │
│ ├─ Message history : SSR avec pagination│
│ ├─ Real-time : WebSocket connection     │
│ ├─ Auth : JWT + session                 │
│ └─ Optimistic updates (send & display)  │
├─────────────────────────────────────────┤
│ Backend : Express + Socket.IO           │
│ ├─ /api/messages (SSR, per user)        │
│ ├─ /api/conversations (SSR)             │
│ ├─ /socket.io : WebSocket/long polling  │
│ ├─ Message broker : Redis Pub/Sub       │
│ └─ Presence tracking                    │
├─────────────────────────────────────────┤
│ Nginx : WebSocket passthrough           │
│ ├─ Pages : no cache (SSR)               │
│ ├─ Assets : 1 an                        │
│ ├─ API : no cache                       │
│ └─ WebSocket : upgrade + long timeout   │
├─────────────────────────────────────────┤
│ Message queue : Redis Pub/Sub / Kafka   │
│ ├─ Broadcast messages entre serveurs    │
│ ├─ Persistent storage : append log      │
│ └─ Consumer groups (if Kafka)           │
├─────────────────────────────────────────┤
│ DB : PostgreSQL + MongoDB (if scale)    │
│ ├─ Users (indexed)                      │
│ ├─ Conversations (indexed)              │
│ ├─ Messages (sharded, append-only)      │
│ ├─ Presence (ephemeral)                 │
│ └─ Typing indicators (Redis)            │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/chat/[conversationId]/page.tsx (SSR per user)
export default async function ChatPage({ params }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect WebSocket
    socketRef.current = io('https://api:4100', {
      auth: { token: getAuthToken() },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Join conversation room
    socketRef.current.emit('join_room', params.conversationId);

    // Listen for new messages
    socketRef.current.on('message:new', (msg) => {
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    });

    // Listen for typing
    socketRef.current.on('typing:start', (user) => {
      showTypingIndicator(user);
    });

    return () => socketRef.current?.disconnect();
  }, []);

  const handleSendMessage = (text) => {
    // Optimistic update (send + display immediately)
    const tempMsg = {
      id: 'temp-' + Date.now(),
      text,
      sender: getCurrentUser(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, tempMsg]);

    // Send via WebSocket
    socketRef.current.emit('message:send', {
      conversationId: params.conversationId,
      text,
    });

    setInput('');
  };

  return (
    <ChatView
      messages={messages}
      onSendMessage={handleSendMessage}
      onTyping={() => socketRef.current.emit('typing:start')}
    />
  );
}
```

**Nginx config** :
```nginx
# Load balancer (if multiple api servers)
upstream api_servers {
  server api1:4100;
  server api2:4100;
  server api3:4100;
  
  # Session affinity (same user = same server)
  ip_hash;
}

server {
  listen 443 ssl http2;

  # Chat pages (SSR, no cache)
  location /chat {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  # WebSocket (real-time messages)
  location /socket.io {
    proxy_pass http://api_servers;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600; # 1h keep-alive
    proxy_send_timeout 3600;
  }

  # API
  location /api/messages {
    proxy_pass http://api_servers;
    add_header Cache-Control "no-store";
  }
}
```

**Gains** :
- TTFB Initial : 200ms (SSR)
- Message latency : 10-50ms (WebSocket)
- Éco : ⭐⭐ (SSR + real-time expensive)
- Real-time : ⭐⭐⭐⭐⭐ (instant)
- Scalabilité : ⭐⭐⭐⭐ (with load balancer)

---

#### 9️⃣ **Blog/Article Platform** (SEO + lecteurs)

**Exemple** : Medium, Dev.to, Substack, Hashnode

**Caractéristiques** :
- Pas de connexion requise (public)
- Contenu éditorial (articles, commentaires)
- Fraîcheur : bonne (articles publiés régulièrement)
- SEO critique (découverte via Google)
- Commentaires en temps réel (WebSocket optional)

**Stack recommandé** : ⭐⭐ **ISR 1 heure + SSR commentaires**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js ISR + OpenGraph      │
│ ├─ Articles : ISR (1h, revalidate)      │
│ ├─ Listing : ISR (30 min)               │
│ ├─ Commentaires : SSR/Polling           │
│ ├─ Auth : optional (pour commenter)     │
│ └─ SEO : meta tags + sitemap auto       │
├─────────────────────────────────────────┤
│ Backend : Express + Search              │
│ ├─ /api/articles/{id} (ISR 1h)          │
│ ├─ /api/search (cached, full-text)      │
│ ├─ /api/comments (polling/WebSocket)    │
│ └─ Analytics : page views               │
├─────────────────────────────────────────┤
│ Nginx : Aggressive cache                │
│ ├─ Articles : 1h                        │
│ ├─ Assets : 1 an                        │
│ ├─ Search : 5 min                       │
│ └─ Comments : no cache                  │
├─────────────────────────────────────────┤
│ Search : Elasticsearch (optional)       │
│ ├─ Full-text search (articles)          │
│ ├─ Facets (tags, authors)               │
│ └─ Auto-complete                        │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                         │
│ ├─ Articles (indexed, full-text)        │
│ ├─ Comments (indexed, nested)           │
│ ├─ Users (indexed, profiles)            │
│ ├─ Tags (indexed)                       │
│ └─ Views (analytics)                    │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/articles/[slug]/page.tsx (ISR with SEO)
export const revalidate = 3600; // 1h

export async function generateStaticParams() {
  const articles = await getAllArticles();
  return articles.map(a => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const article = await getArticle(params.slug);
  
  return {
    title: article.title,
    description: article.excerpt,
    authors: [{ name: article.author }],
    openGraph: {
      type: 'article',
      url: `https://blog.com/articles/${params.slug}`,
      title: article.title,
      description: article.excerpt,
      publishedTime: article.publishedAt,
      authors: [article.author],
      images: [
        {
          url: article.coverImage,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.excerpt,
      images: [article.coverImage],
    },
  };
}

export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);
  
  return (
    <article>
      <ArticleHeader article={article} />
      <ArticleContent content={article.content} />
      <CommentsSection articleId={article.id} />
    </article>
  );
}

// app/articles/page.tsx (ISR listing)
export const revalidate = 1800; // 30 min

export default async function ArticlesPage() {
  const articles = await getLatestArticles(50);
  
  return (
    <div>
      <ArticleGrid articles={articles} />
      <Pagination />
    </div>
  );
}

// components/CommentsSection.tsx (SSR comments)
'use client';

export function CommentsSection({ articleId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch comments (no cache, load latest)
    fetchComments(articleId).then(c => {
      setComments(c);
      setLoading(false);
    });

    // Optional: polling for new comments
    const interval = setInterval(() => {
      fetchComments(articleId).then(setComments);
    }, 30000); // 30 sec

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {loading ? <LoadingSpinner /> : <CommentsList comments={comments} />}
      <CommentForm onSubmit={(text) => postComment(articleId, text)} />
    </div>
  );
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Assets (1 year)
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Articles (1 hour, with revalidation)
  location ~ ^/articles/[a-z0-9-]+$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=3600, must-revalidate";
    
    proxy_cache my_cache;
    proxy_cache_valid 200 1h;
    proxy_cache_revalidate on;
  }

  # Article listing (30 min)
  location = /articles {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=1800, must-revalidate";
  }

  # Search (5 min)
  location /api/search {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=300";
    
    proxy_cache my_cache;
    proxy_cache_valid 200 5m;
  }

  # Comments (no cache)
  location /api/comments {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-cache";
  }
}
```

**Gains** :
- TTFB Article : 50ms (ISR)
- TTFB Listing : 50ms (ISR)
- Requêtes/jour : ~50k (ISR 1h)
- Éco : ⭐⭐⭐⭐⭐ (excellent)
- SEO : ⭐⭐⭐⭐⭐ (ISR + OpenGraph)
- Scalabilité : très haute

---

#### 🔟 **App Productivité** (données utilisateur + temps réel optional)

**Exemple** : Trello, Asana, Todoist, Google Tasks

**Caractéristiques** :
- Connexion utilisateur obligatoire
- Données très persistantes (todos, lists)
- Fraîcheur : bonne (updates < 1 min)
- Sync entre devices
- Optional : temps réel (WebSocket)

**Stack recommandé** : ⭐ **SSR + Service Worker + Local Storage**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js SSR + Service Worker │
│ ├─ Pages : SSR (per user)               │
│ ├─ Offline : Service Worker + IndexedDB │
│ ├─ Sync : background sync API           │
│ ├─ Auth : JWT + session                 │
│ └─ Optional: WebSocket (live collab)    │
├─────────────────────────────────────────┤
│ Backend : Express + Sync logic          │
│ ├─ /api/lists (SSR, per user)           │
│ ├─ /api/todos (SSR, per user)           │
│ ├─ /api/sync (diff/merge)               │
│ ├─ /ws/sync (optional, real-time)       │
│ └─ Conflict resolution (CRDT)           │
├─────────────────────────────────────────┤
│ Nginx : User-aware cache                │
│ ├─ Assets : 1 an                        │
│ ├─ Pages : no cache (SSR, per user)     │
│ ├─ API : no cache (dynamic)             │
│ └─ WebSocket : optional upgrade         │
├─────────────────────────────────────────┤
│ Client storage : Service Worker         │
│ ├─ Cache static assets offline          │
│ ├─ IndexedDB pour données (local)       │
│ └─ Background Sync (quand online)       │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                         │
│ ├─ Users (indexed)                      │
│ ├─ Lists (indexed by user)              │
│ ├─ Todos (indexed, sortable)            │
│ ├─ Sync log (conflict tracking)         │
│ └─ Audit (who changed what)             │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/dashboard/page.tsx (SSR per user)
export default async function DashboardPage() {
  const lists = await getLists(); // Per user, no cache
  
  return (
    <div>
      <Dashboard lists={lists} />
      <SyncIndicator />
    </div>
  );
}

// components/Dashboard.tsx (Client-side with offline support)
'use client';

import { useEffect, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export function Dashboard({ lists: initialLists }) {
  const [lists, setLists] = useLocalStorage('lists', initialLists);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Detect online/offline
  useEffect(() => {
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
  }, []);

  // Sync when online
  useEffect(() => {
    if (isOnline && lists !== initialLists) {
      syncToServer();
    }
  }, [isOnline]);

  const handleAddTodo = (listId, todo) => {
    // Update locally (immediate, offline-ready)
    const newLists = lists.map(l =>
      l.id === listId ? { ...l, todos: [...l.todos, todo] } : l
    );
    setLists(newLists);

    // Sync to server (background, if online)
    if (isOnline) {
      syncToServer();
    } else {
      // Register background sync
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(sw => {
          sw.sync.register('sync-todos');
        });
      }
    }
  };

  const syncToServer = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ lists }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const synced = await res.json();
      setLists(synced); // Update with server version
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div>
      {!isOnline && <OfflineIndicator />}
      {isSyncing && <SyncingIndicator />}
      
      {lists.map(list => (
        <List key={list.id} list={list} onAddTodo={handleAddTodo} />
      ))}
    </div>
  );
}

// public/service-worker.ts (Offline cache + background sync)
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('v1').then((cache) => {
      return cache.addAll([
        '/',
        '/css/main.css',
        '/js/app.js',
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Cache first for assets
  if (event.request.url.includes('.js') || event.request.url.includes('.css')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  } else {
    // Network first for API
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses
          caches.open('v1').then((cache) => {
            cache.put(event.request, response.clone());
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

// Background sync when online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-todos') {
    event.waitUntil(
      fetch('/api/sync', { method: 'POST' })
        .then(res => res.json())
        .catch(() => {
          // Retry later
          throw new Error('Sync failed, will retry');
        })
    );
  }
});
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Service Worker (cache 1 week for updates)
  location = /service-worker.js {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=604800";
  }

  # Assets (1 year)
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Pages (SSR, no cache)
  location / {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    proxy_pass_header Authorization;
  }

  # API (no cache, dynamic per user)
  location /api/ {
    proxy_pass http://api:4100;
    add_header Cache-Control "no-store";
    proxy_pass_header Authorization;
  }

  # WebSocket (optional, for real-time)
  location /ws/sync {
    proxy_pass http://api:4100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

**Gains** :
- TTFB initial : 200ms (SSR)
- TTFB offline : 10ms (Service Worker cache)
- Sync latency : < 1 sec (background)
- Éco : ⭐⭐⭐ (good with offline support)
- Offline UX : ⭐⭐⭐⭐⭐ (fully functional)
- Scalabilité : ⭐⭐⭐⭐

---

#### 1️⃣1️⃣ **Video Streaming Platform** (données massives + streaming)

**Exemple** : YouTube, Netflix, Vimeo

**Caractéristiques** :
- Connexion utilisateur optionnelle (auth pour résolution)
- Metadata changent souvent (views, comments)
- Données très volumineuses (vidéos)
- Fraîcheur : bonne (metrics time-réel)
- CDN critique pour vidéos

**Stack recommandé** : ⭐⭐ **ISR 5 min + CDN + Range requests**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js ISR                  │
│ ├─ Page vidéo : ISR (5 min, metadata)   │
│ ├─ Thumbnail : ISR (1h)                 │
│ ├─ Video player : client-side           │
│ ├─ Comments : polling/WebSocket         │
│ └─ Auth : optional (pour résolution HD) │
├─────────────────────────────────────────┤
│ Backend : Express + Transcoding         │
│ ├─ /api/video/[id] (ISR 5 min)          │
│ ├─ /api/search (cached)                 │
│ ├─ /api/recommendations (cached)        │
│ ├─ /stream/[id].mp4 (range requests)    │
│ └─ Transcoding : async job queue        │
├─────────────────────────────────────────┤
│ Nginx : Smart streaming cache           │
│ ├─ Metadata : 5 min                     │
│ ├─ Thumbnails : 1 an                    │
│ ├─ Assets : 1 an                        │
│ ├─ Streaming : pass-through (range req) │
│ └─ Range request support                │
├─────────────────────────────────────────┤
│ Storage : Object Storage (S3/GCS)       │
│ ├─ Master video (original)              │
│ ├─ Transcoded variants (HLS/DASH)       │
│ └─ Thumbnails/posters                   │
├─────────────────────────────────────────┤
│ CDN : CloudFront / Cloudflare           │
│ ├─ Cache video chunks globally          │
│ ├─ Serve from edge (low latency)        │
│ ├─ Range request support                │
│ └─ Byte-range caching                   │
├─────────────────────────────────────────┤
│ Job queue : Redis + Bull / Celery       │
│ ├─ Transcode videos                     │
│ ├─ Generate thumbnails                  │
│ └─ Process metadata                     │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                         │
│ ├─ Users (indexed)                      │
│ ├─ Videos (indexed, full-text)          │
│ ├─ Comments (indexed)                   │
│ ├─ Metadata (indexed)                   │
│ ├─ Transcoding jobs (status)            │
│ ├─ Watch history (user analytics)       │
│ └─ Streaming logs (for metrics)         │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/watch/[videoId]/page.tsx (ISR metadata)
export const revalidate = 300; // 5 min

export async function generateStaticParams() {
  const trending = await getTrendingVideos();
  return trending.map(v => ({ videoId: v.id }));
}

export async function generateMetadata({ params }) {
  const video = await getVideoMetadata(params.videoId);
  
  return {
    title: video.title,
    description: video.description,
    openGraph: {
      type: 'video.other',
      url: `https://video.com/watch/${params.videoId}`,
      title: video.title,
      description: video.description,
      images: [{ url: video.thumbnail }],
      video: {
        url: `https://stream.video.com/${params.videoId}/stream.m3u8`,
        type: 'application/x-mpegURL',
        width: 1280,
        height: 720,
      },
    },
  };
}

export default async function WatchPage({ params }) {
  const video = await getVideoMetadata(params.videoId);
  const streamUrl = getStreamUrl(params.videoId); // HLS/DASH
  
  return (
    <div>
      <VideoPlayer
        src={streamUrl}
        poster={video.thumbnail}
        title={video.title}
      />
      <VideoInfo video={video} />
      <CommentsSection videoId={params.videoId} />
      <Recommendations videoId={params.videoId} />
    </div>
  );
}

// components/VideoPlayer.tsx (HLS streaming)
'use client';

import HLS from 'hls.js';
import { useEffect, useRef } from 'react';

export function VideoPlayer({ src, poster, title }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    if (HLS.isSupported()) {
      const hls = new HLS();
      hls.loadSource(src); // HLS manifest
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src; // Safari native HLS
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls
      width={1280}
      height={720}
    />
  );
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Metadata (5 min, ISR)
  location ~ ^/watch/[a-z0-9-]+$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=300, must-revalidate";
  }

  # Thumbnails (1 year)
  location ~ \.(jpg|png|webp)$ {
    proxy_pass http://s3:bucket;
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # Video streaming (HLS/DASH with range requests)
  location ~ ^/stream/[^/]+\.(m3u8|mpd|ts|m4s)$ {
    proxy_pass http://cdn:9000;
    
    # Range request support (critical for video)
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    
    # Cache chunks
    add_header Cache-Control "public, max-age=31536000, immutable";
    
    # Bytes range response
    proxy_pass_header Content-Length;
    proxy_pass_header Content-Range;
  }

  # API
  location /api/video {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=300";
  }
}
```

**Gains** :
- TTFB metadata : 50ms (ISR)
- Video start time : < 1 sec (CDN)
- Éco : ⭐⭐ (video heavy)
- Scalabilité : ⭐⭐⭐⭐⭐ (with CDN)
- UX : ⭐⭐⭐⭐⭐ (smooth streaming)

---

#### 1️⃣2️⃣ **Admin Dashboard** (données volatiles, temps réel)

**Exemple** : Google Analytics, Datadog, Sumo Logic, New Relic

**Caractéristiques** :
- Connexion utilisateur obligatoire (role-based)
- Données très dynamiques (metrics temps réel)
- Fraîcheur : critique (< 10 sec)
- Haute complexité (graphs, filtering)
- Scalabilité : < 1k users (internal)

**Stack recommandé** : ⭐⭐⭐ **ISR 10 sec + WebSocket + Real-time db**
```
┌─────────────────────────────────────────┐
│ Frontend : Next.js ISR 10s + WebSocket  │
│ ├─ Dashboards : ISR (10 sec)            │
│ ├─ Metrics : WebSocket (real-time)      │
│ ├─ Auth : JWT + RBAC                    │
│ ├─ Graphs : recharts / D3               │
│ └─ Filters : local state + query params │
├─────────────────────────────────────────┤
│ Backend : Express + Time-series DB      │
│ ├─ /api/metrics (ISR 10s)               │
│ ├─ /api/logs (paginated)                │
│ ├─ /api/alerts (real-time)              │
│ ├─ /ws/metrics : WebSocket stream       │
│ └─ Cache : Redis for hot metrics        │
├─────────────────────────────────────────┤
│ Nginx : Cache + WebSocket               │
│ ├─ Dashboards : 10 sec                  │
│ ├─ Assets : 1 an                        │
│ ├─ API : 10 sec                         │
│ └─ WebSocket : pass-through             │
├─────────────────────────────────────────┤
│ Time-series DB : Prometheus / InfluxDB  │
│ ├─ Metrics storage                      │
│ ├─ High cardinality support             │
│ └─ Query API                            │
├─────────────────────────────────────────┤
│ Cache : Redis                           │
│ ├─ Hot metrics (1-5 min)                │
│ ├─ User sessions                        │
│ └─ Rate limiting                        │
├─────────────────────────────────────────┤
│ DB : PostgreSQL                         │
│ ├─ Users + RBAC                         │
│ ├─ Alert rules                          │
│ ├─ Dashboards configuration             │
│ └─ Audit log                            │
└─────────────────────────────────────────┘
```

**Implémentation Next.js** :
```typescript
// app/dashboard/[dashId]/page.tsx (ISR dashboards)
export const revalidate = 10; // 10 seconds

export default async function AdminDashboard({ params }) {
  const dashboard = await getDashboard(params.dashId);
  const metrics = await getMetrics(dashboard.queries);
  
  return (
    <div>
      <DashboardHeader dashboard={dashboard} />
      <MetricsGrid metrics={metrics} />
      <WebSocketMetricsUpdater dashId={params.dashId} />
    </div>
  );
}

// components/WebSocketMetricsUpdater.tsx (Real-time updates)
'use client';

import { useEffect, useState } from 'react';

export function WebSocketMetricsUpdater({ dashId }) {
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    const ws = new WebSocket(`wss://api:4100/ws/metrics?dashboard=${dashId}`);

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setMetrics(prev => ({
        ...prev,
        [update.metricId]: update.value,
      }));
    };

    return () => ws.close();
  }, [dashId]);

  return (
    <div>
      {Object.entries(metrics).map(([id, value]) => (
        <MetricCard key={id} id={id} value={value} />
      ))}
    </div>
  );
}
```

**Nginx config** :
```nginx
server {
  listen 443 ssl http2;

  # Dashboards (10 sec ISR)
  location ~ ^/dashboard/[a-z0-9-]+$ {
    proxy_pass http://nextjs:3000;
    add_header Cache-Control "public, max-age=10, must-revalidate";
    
    proxy_cache my_cache;
    proxy_cache_valid 200 10s;
  }

  # API metrics (10 sec)
  location /api/metrics {
    proxy_pass http://api:4100;
    add_header Cache-Control "public, max-age=10";
    
    proxy_cache my_cache;
    proxy_cache_valid 200 10s;
  }

  # WebSocket (real-time)
  location /ws/metrics {
    proxy_pass http://api:4100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600;
  }
}
```

**Gains** :
- TTFB initial : 50ms (ISR)
- Metric latency : < 100ms (WebSocket)
- Éco : ⭐⭐⭐ (good with ISR)
- Real-time : ⭐⭐⭐⭐⭐
- Scalabilité : ⭐⭐⭐⭐ (< 1k users)

---

### Matrice récapitulatif : Tous les cas d'usage

| Cas | Type | Stack | TTFB | Fraîcheur | Éco | Real-time | Complexité |
|---|---|---|---|---|---|---|---|
| 1. Site vitrine | Public | SSG | 50ms | Jamais | ⭐⭐⭐⭐⭐ | ❌ | Basse |
| 2. Dashboard statique | Auth | SSG+Auth | 50ms | Mensuel | ⭐⭐⭐⭐⭐ | ❌ | Basse |
| 3. Dashboard quotidien | Auth | SSG+Throttle | 50ms | Daily | ⭐⭐⭐⭐ | ✅ (polling) | Moyenne |
| 4. Dashboard horaire | Auth | ISR 1h | 50ms | Hourly | ⭐⭐⭐⭐⭐ | ✅ | Moyenne |
| 5. E-commerce | Auth | ISR+SSR | 50ms | Real-time | ⭐⭐⭐ | ✅ (critical) | Haute |
| 6. Météo | Public | ISR 10m+CDN | 20ms | 10 min | ⭐⭐⭐⭐ | ❌ | Moyenne |
| 7. SaaS B2B | Auth | ISR+SSR+WS | 200ms | < 1min | ⭐⭐⭐ | ✅ | Très haute |
| 8. Chat/Messaging | Auth | SSR+WS | 200ms | Instant | ⭐⭐ | ✅✅ | Très haute |
| 9. Blog/Articles | Public | ISR 1h | 50ms | Hourly | ⭐⭐⭐⭐⭐ | ✅ (polling) | Moyenne |
| 10. Productivité | Auth | SSR+SW | 200ms | < 1min | ⭐⭐⭐ | ✅ (optional) | Haute |
| 11. Video streaming | Public | ISR 5m+CDN | 50ms | 5 min | ⭐⭐ | ❌ | Très haute |
| 12. Admin Dashboard | Internal | ISR 10s+WS | 50ms | < 10sec | ⭐⭐⭐ | ✅✅ | Très haute |

---

## 3. Frontend — Next.js SSG vs SSR vs ISR

### 2.1 Qu'est-ce que SSG, SSR, ISR ?

#### **SSG (Static Site Generation)** ⭐ Recommandé
```
Build time:    npm run build
               ↓
               Génère HTML statiques pour CHAQUE page
               /app/dashboard.html
               /app/table.html
               /app/analytics.html
               ↓
Runtime:       Nginx sert directement le .html (0ms rendering)
               + JS lazy-loadé pour interactivité
```

**Avantages** :
- ✅ **Time-to-First-Byte** : ~50ms (HTML pré-généré)
- ✅ **Zero rendering** : pas de JS côté serveur
- ✅ **Cache-friendly** : HTML statique, très cacheable
- ✅ **Éco** : consommation minimale serveur
- ✅ **SEO** : crawlable par défaut

**Cas d'usage** :
- Sites marketing
- Dashboards statiques (mise à jour 1x/jour)
- Documentation
- Blogs

**Implémentation Next.js** :
```typescript
// app/dashboard/page.tsx
import { Analytics } from '@/components/Analytics';

export default function Dashboard() {
  // Généré STATIQUEMENT à la build
  return <Analytics />;
}

// Build output :
// → .next/static/pages/dashboard.html
```

---

#### **SSR (Server-Side Rendering)** ⚠️ À éviter pour éco
```
Request:       User visite /dashboard
               ↓
Runtime:       Serveur Node.js rend React → HTML
               (300-500ms par requête)
               ↓
Response:      HTML complète envoyée au client

À chaque visite = rendu serveur
```

**Inconvénients** :
- ❌ **Latence** : 300-500ms par page (rendu serveur)
- ❌ **Scalabilité** : serveur doit rendre chaque requête
- ❌ **Éco** : consommation serveur élevée (CPU + RAM)
- ❌ **TTFB** : lent (500ms+)

**À utiliser UNIQUEMENT si** :
- Contenu très dynamique (utilisateur spécifique)
- Données temps réel

---

#### **ISR (Incremental Static Regeneration)** ⭐⭐ **BEST HYBRID**
```
Build:         npm run build
               ↓
               Génère pages SSG STATIQUES

Runtime:       User visite /dashboard
               ↓
               Nginx sert HTML statique en cache
               (50ms)
               ↓
               En arrière-plan (après 300s) :
               Next.js regénère la page si changement détecté
               (revalidation)
               ↓
               Prochaine visite = nouvelle version

Résultat : HTML à jour SANS latence serveur
```

**Avantages** :
- ✅ **TTFB** : 50ms (HTML statique)
- ✅ **Fraîcheur** : pages regénérées toutes les N secondes
- ✅ **Scalabilité** : pas de surcharge serveur
- ✅ **Éco** : très efficace (mix static + lazy regen)
- ✅ **SEO** : crawlable, à jour

**Implémentation Next.js** :
```typescript
// app/dashboard/page.tsx
import { getAnalytics } from '@/lib/api';

export const revalidate = 300; // Regénère toutes les 5 min

export default async function Dashboard() {
  const data = await getAnalytics();
  
  return <Analytics data={data} />;
}

// À la build :
// → .next/static/pages/dashboard.html (généré)
// À chaque requête après 300s :
// → regénère automatiquement
```

### 2.2 Recommandation pour heavy-ops

| Scénario | Recommandation | Raison |
|---|---|---|
| Dashboard temps réel | **ISR (300s)** | Données mise à jour 5x/min, HTML statique en cache |
| Table (liste records) | **ISR (600s)** | Données stable, regénère 1x/10min |
| Analytics (rapports) | **SSG** | Rapports statiques, build daily |
| Settings (configuration) | **SSG** | Config stable, manuelle si changement |
| API endpoints | **Express** | Requêtes HTTP dynamiques (logs, search) |

---

## 3. Optimisations essentielles par couche

### 3.1 Frontend (Next.js)

#### US1 — Code mort
```typescript
// ✅ BON : tree-shaking automatique
import { useEffect } from 'react'; // utilisé
// Code inutilisé = supprimé à la build

// ❌ MAUVAIS : exports non utilisés
export function UnusedComponent() {} // supprimé
export function AnotherUnused() {}   // supprimé
```

**Implémentation** :
```bash
# Webpack (Next.js) + Terser minifient automatiquement
npm run build
# → .next/static/chunks/ (minifiés)
```

---

#### US2 — Cache headers
**Nginx config** :
```nginx
# Assets avec hash (immuables 1 an)
location ~* \.(js|css|woff2)$ {
  add_header Cache-Control "public, immutable, max-age=31536000";
  expires 365d;
}

# Pages (revalidate toutes les 5 min)
location / {
  add_header Cache-Control "public, max-age=300, must-revalidate";
}

# API (no-cache, ETag)
location /api/ {
  add_header Cache-Control "public, max-age=0, must-revalidate";
  add_header ETag $upstream_http_etag;
}
```

---

#### US3 — Compression
**Nginx config** (Gzip + Brotli) :
```nginx
gzip on;
gzip_types text/plain application/json application/javascript text/css image/svg+xml;
gzip_level 6;

brotli on;
brotli_types text/plain application/json application/javascript text/css image/svg+xml;
brotli_quality 6;

# Poids réduit : 163 Ko → 53 Ko (-67%)
```

---

#### US4 — Code splitting
**Next.js fait automatiquement** :
```typescript
// Chaque page = un chunk séparé
/app/dashboard/page.tsx    → dashboard-xxx.js (auto lazy)
/app/table/page.tsx        → table-xxx.js (auto lazy)
/app/analytics/page.tsx    → analytics-xxx.js (auto lazy)

// Vendor séparé
node_modules              → vendor-xxx.js (1 an cache)

// Bundle initial = ultra-léger (~45 Ko gzip)
```

**Forcer un chunk** (si besoin) :
```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('@/components/Heavy'), {
  loading: () => <div>Chargement...</div>,
  ssr: false // Lazy au client si pas de SSG
});
```

---

#### US5 — Debouncing/Throttling
```typescript
// Utility function
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Utilisation : Search
const handleSearch = debounce(async (query: string) => {
  const results = await fetch(`/api/search?q=${query}`);
  setResults(await results.json());
}, 500); // Attendre 500ms après arrêt frappe

// Throttle : Scroll
const handleScroll = throttle(() => {
  loadMoreData();
}, 1000); // Max 1 appel par seconde
```

---

#### US6 — SEO (Robots.txt + Meta)
**Next.js** :
```typescript
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin',
    },
    sitemap: 'https://example.com/sitemap.xml',
  }
}

// app/layout.tsx (Meta automatiques)
export const metadata: Metadata = {
  title: 'Heavy Ops Dashboard',
  description: 'Supervision centralisée des opérations',
  openGraph: {
    type: 'website',
    url: 'https://example.com',
    title: 'Heavy Ops',
    description: 'Supervision centralisée',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
    }],
  },
}
```

---

#### US7 — HTTP/2 Server Push
**Nginx + HTTP/2** :
```nginx
server {
  listen 443 ssl http2;
  
  # Push ressources critiques
  location = / {
    http2_push /css/main.css;
    http2_push /js/app.js;
    proxy_pass http://nextjs;
  }
  
  # Gain : +3-5% vitesse (parallélisation)
}
```

---

#### ⭐ **Font Subsetting** (US8+ bonus)

**Problème** :
```
Google Fonts default : 
  - Roboto.woff2 = 169 Ko (toutes les lettres : A-Z, accents, symboles)
  - Utilisé : 30% du fichier pour le français

Téléchargé : 169 Ko
Utilisé : 50 Ko
Wasted : 119 Ko (-70%)
```

**Solution 1 : Subsetter local** (recommended)
```bash
# Installer font-tools
pip install fonttools brotli

# Extraire seulement les caractères français
pyftsubset Roboto-Regular.ttf \
  --unicodes=U+0020-007E,U+00C0-00FF \
  --output-file=Roboto-FR.woff2

# Résultat : 169 Ko → 45 Ko (-73%)
```

**Solution 2 : Next.js + Google Fonts avec subsetting**
```typescript
// app/layout.tsx
import { Open_Sans } from 'next/font/google'

const openSans = Open_Sans({
  subsets: ['latin'], // Charger seulement latin (français, anglais)
  weights: [400, 700],
  display: 'swap', // Afficher texte AVANT font charge
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={openSans.className}>
      <body>{children}</body>
    </html>
  )
}
```

**Résultat** :
```
Avant subsetting : 169 Ko
Après subsetting : 45 Ko
Gain : -124 Ko (-73%)
Impact annuel : -40 gCO2e/visiteur
```

---

### 3.2 Backend (Express/Node.js)

#### Cache headers
```typescript
// middleware/cacheHeaders.ts
export const cacheHeaders = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    const isStatic = ['/api/records', '/api/settings'].includes(req.path);
    const isSession = req.path === '/api/session' && req.method === 'POST';

    if (isSession) {
      res.setHeader('Cache-Control', 'no-store'); // Données sensibles
    } else if (isStatic) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
  }
  next();
};

app.use(cacheHeaders);
```

#### Compression (Gzip + Brotli)
```typescript
import compression from 'compression';

app.use(compression({ level: 6 })); // Gzip
app.use(express.json());

// Response middleware
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const originalJson = res.json;

  res.json = function(data) {
    const jsonStr = JSON.stringify(data);
    let compressed: Buffer | undefined;

    if (acceptEncoding.includes('br')) {
      compressed = zlib.brotliCompressSync(jsonStr, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
      });
      res.setHeader('Content-Encoding', 'br');
    } else if (acceptEncoding.includes('gzip')) {
      compressed = zlib.gzipSync(jsonStr, { level: 6 });
      res.setHeader('Content-Encoding', 'gzip');
    }

    if (compressed) {
      res.setHeader('Content-Length', compressed.length);
      return res.end(compressed);
    }

    res.setHeader('Content-Length', jsonStr.length);
    return res.end(jsonStr);
  };

  next();
});
```

---

### 3.3 Nginx (Reverse Proxy)

#### Configuration complète
```nginx
# /etc/nginx/nginx.conf

upstream nextjs {
  server nextjs:3000;
}

upstream api {
  server api:4100;
}

# Gzip + Brotli globalement
gzip on;
gzip_types text/plain application/json application/javascript text/css image/svg+xml;
gzip_level 6;

brotli on;
brotli_types text/plain application/json application/javascript text/css image/svg+xml;
brotli_quality 6;

server {
  listen 80 http2;
  server_name example.com;

  # Redirection HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;

  ssl_certificate /etc/ssl/certs/cert.pem;
  ssl_certificate_key /etc/ssl/private/key.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;

  # Assets (1 year, immutable)
  location ~* \.(js|css|woff2|png|jpg|svg|webp)$ {
    proxy_pass http://nextjs;
    add_header Cache-Control "public, immutable, max-age=31536000";
    expires 365d;
  }

  # Sitemap
  location = /sitemap.xml {
    proxy_pass http://nextjs;
    add_header Cache-Control "public, max-age=86400";
  }

  # Pages HTML (5 min)
  location / {
    proxy_pass http://nextjs;
    add_header Cache-Control "public, max-age=300, must-revalidate";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # API (no-cache + ETag)
  location /api/ {
    proxy_pass http://api;
    add_header Cache-Control "public, max-age=0, must-revalidate";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

---

## 4. Checklist déploiement éco-responsable

### Avant chaque déploiement

- [ ] **Frontend**
  - [ ] Code splitting : vérifier chunks séparés (`npm run build`)
  - [ ] Tree-shaking : aucun code mort (Lighthouse audit)
  - [ ] Fonts subsettées : `.woff2` pour français seulement
  - [ ] Images optimisées : WebP + srcset
  - [ ] Lighthouse Performance ≥ 90
  - [ ] Lighthouse SEO ≥ 95

- [ ] **Backend**
  - [ ] Compression : Gzip + Brotli configurés
  - [ ] Cache headers : statiques 1 an, APIs 5 min
  - [ ] Requêtes DB : indexées, optimisées
  - [ ] Logging : production logs (pas console.log)

- [ ] **Nginx**
  - [ ] HTTPS/TLS configuré
  - [ ] Compression globale : Gzip + Brotli
  - [ ] Security headers : HSTS, CSP, X-Frame-Options
  - [ ] Logs : accès + erreur
  - [ ] HTTP/2 activé

- [ ] **Database**
  - [ ] Index sur colonnes de recherche
  - [ ] Partitioning si table > 10 GB
  - [ ] Backup quotidien
  - [ ] Replication pour HA

---

## 5. Monitoring & Mesure

### KPIs à tracker

```typescript
// Créer un dashboard Grafana avec :

export interface EcoMetrics {
  // Réseau
  bandwidthPerVisit: number; // Ko
  requestsPerDay: number;
  cacheHitRate: number; // %

  // Performance
  firstContentfulPaint: number; // ms
  largestContentfulPaint: number; // ms
  timeToFirstByte: number; // ms

  // Éco
  co2PerVisitor: number; // gCO2e/an
  waterPerVisitor: number; // cl/an
  energyPerVisitor: number; // Wh/an

  // SEO
  lighthousePerformance: number; // 0-100
  lighthouseSEO: number; // 0-100
}
```

### Tools recommandés

| Tool | Objectif | Fréquence |
|---|---|---|
| Lighthouse CI | Regression testing | À chaque PR |
| GreenIT.io | Audit éco | Mensuel |
| EcoIndex | Score éco | Mensuel |
| Grafana | Monitoring temps réel | Continu |
| Sentry | Error tracking | Continu |

---

## 6. Gains mesurables (cumulatifs)

### Récapitulatif toutes US

| US | Optimisation | Gain | Effort |
|---|---|---|---|
| US1 | Code mort + tree-shaking | -50% bundle | 15 min |
| US2 | Cache headers | -80% requêtes | 20 min |
| US3 | Compression Gzip/Brotli | -67% transfert | 10 min |
| US4 | Code splitting | -25% initial | 20 min |
| US5 | Debouncing/Throttling | -30-50% API | 30 min |
| US6 | SEO + robots.txt | +13 Lighthouse | 20 min |
| US7 | HTTP/2 Server Push | +3-5% vitesse | 40 min |
| US8 | Font subsetting | -73% fonts | 25 min |
| **TOTAL** | **Éco-conception complète** | **-70-80% impact** | **~180 min** |

### Impact annuel (10k visiteurs/mois)

```
Avant : 50 gCO2e/visiteur/an
Après US1-8 : 10 gCO2e/visiteur/an (-80%)

Économie annuelle :
10 000 visiteurs × 12 mois × 40 gCO2e = 4 800 kg CO2/an
= 4.8 tonnes CO2/an
= Équivalent 1 200 km en voiture
```

---

## 7. Références

- [Next.js Performance Guide](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Nginx Best Practices](https://nginx.org/en/docs/)
- [GreenIT Checklist](https://www.greenit.fr/)
- [EcoIndex.fr](https://www.ecoindex.fr/)
- [Web Vitals](https://web.dev/vitals/)
- [Font Subsetting Guide](https://github.com/fonttools/fonttools)

---

## 8. Notes importantes

### ISR vs SSR — Quand utiliser quoi ?

| Situation | Recommandation | Raison |
|---|---|---|
| Dashboard données statiques | **SSG** | Aucun rendu serveur requis |
| Dashboard données mise à jour 1x/jour | **ISR (86400s)** | Regénère 1x/jour, HTML statique |
| Dashboard temps réel avec polling | **ISR (300s)** | Regénère 5x/min, cache entre les polls |
| Page utilisateur unique (profil) | **SSR** | Données spécifiques, pas d'ISR |
| API JSON (search, filters) | **Express API** | Requêtes dynamiques, pas de SSR |

### Font Subsetting — Cas d'usage

| Cas | Subsetting | Taille avant | Taille après | Gain |
|---|---|---|---|---|
| FR + EN (latin) | Yes | 169 Ko | 45 Ko | -73% |
| CJK (中文, 日本語) | Yes | 2-5 Mo | 300-800 Ko | -85% |
| Accents spéciaux | Yes | 169 Ko | 65 Ko | -62% |
| Variable fonts | Yes | 200 Ko | 60 Ko | -70% |

---

Ce document est une base. Adapter selon ton contexte (Vercel, AWS, self-hosted, etc.).
