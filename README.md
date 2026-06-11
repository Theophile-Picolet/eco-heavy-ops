# heavy-ops

## Contexte pedagogique

Repo miroir pedagogique d un dashboard metier / SaaS interne. Il permet d observer les effets d un polling agressif, de gros datasets charges d un coup, de calculs inutiles cote client et d une interface trop dense.

Ce projet est volontairement fonctionnel mais non optimise. Il sert de support d analyse et d experimentation dans un cadre de formation.

## Perimetre fonctionnel

- Login
- Dashboard principal
- Table de donnees
- Graphiques / analytics
- Parametres

## Anti-patterns presents

- polling agressif
- gros datasets charges d un coup
- graphiques inutiles
- re-renders frequents
- calculs client inutiles
- aucune pagination efficace
- appels repetes
- logs bavards

## Lancement

`npm install`

`npm run dev`

Frontend: http://localhost:5173

Backend: http://localhost:4100

## Mesure et outillage

- Lighthouse sur dashboard
- charge CPU et memoire dans le navigateur
- nombre d appels repetes en reseau
- temps de rendu et ressenti utilisateur

### Commandes utiles

- `npm run analyze`
- `npm run lighthouse`
- Lighthouse dans le navigateur Chrome
- EcoIndex via l'extension ou le site dedie
