# Te Araroa avec Ewan

Le carnet de route en ligne d'Ewan sur le Te Araroa, île du Sud (Ship Cove → Bluff, 1 334 km).
Les proches suivent sa position, ses étapes, ses photos et lui laissent des mots ; Ewan publie depuis son iPhone, même sans réseau.

## Ce que contient le dépôt

| Dossier | Rôle |
| --- | --- |
| `web/` | Le site (Vite + Preact + MapLibre). `index.html` = site public, `admin/` = le « Carnet » d'Ewan |
| `supabase/migrations/` | Schéma de la base, sécurité (RLS), fonctions SQL |
| `supabase/functions/` | Fonctions serveur : import du tracé officiel, suivi OwnTracks, création du compte admin |
| `scripts/data/` | Fabrique les lieux du sentier (OpenStreetMap) et le profil d'altitude, dans GitHub Actions |
| `scripts/qa/` | Captures d'écran du site sur la vraie carte, dans GitHub Actions |
| `scripts/brand/` | Le logo « Cap au sud » (la Croix du Sud, sa cinquième étoile devenue la balise orange d'Ewan) : sa géométrie (`crux.mjs`), les icônes de l'appli et du Carnet (`icons.mjs`), l'image d'aperçu des liens (`og.mjs`) |

## Architecture

- **Site** : application statique (GitHub Pages). Direction artistique « nuit du Mackenzie » (voir `web/DESIGN.md`) : carte 3D MapLibre GL de nuit (OpenFreeMap) avec relief éclairé comme par la lune, ombrage, courbes de niveau calculées dans un worker, lacs glaciaires turquoise, ou satellite (Esri ou LINZ) ; tracé parcouru en orange lumineux ; panneau à ressort type Apple Plans ; typo Archivo (large pour les chiffres) et Literata pour les mots d'Ewan.
- **Lieux** : 486 refuges, campings, cols, sommets, cascades et points de vue le long du sentier (`web/public/data/pois.json`), plus les transferts (Rakaia, Rangitata, lac Wakatipu). Fiche par lieu (Ewan y est passé quel jour, dans combien de km il y sera, ses photos près d'ici), recherche, filtres.
- **Effets** : à la première visite, une présentation (l'île de nuit qui ondule, une lumière qui parcourt le sentier en boucle, où en est Ewan aujourd'hui) avant d'entrer ; à l'arrivée, le tracé se dessine de Ship Cove jusqu'à Ewan pendant que ses km défilent ; survol 3D de tout le sentier piloté par son profil d'altitude (`web/public/data/profile.json`), « Ce qu'il voit » (la caméra juste derrière Ewan, face au sentier), tour en 3D d'un lieu, relief éclairé par le soleil du moment ; réponses aux gestes (lieux qui rebondissent avec une onde, réactions en gerbe, boutons à ressort).
- **Écrans** : téléphone tenu droit (panneau en bas, trois hauteurs), téléphone en paysage et ordinateur (panneau à gauche, carte à côté), iPad tenu droit (carte flottante à gauche) ; jusqu'aux téléphones de 320 px. Si l'appareil ne peut pas afficher la carte 3D (vieil iPad sans WebGL 2), le tracé est dessiné simplement, avec ce qu'Ewan a parcouru et où il est.
- **Données** : Supabase (projet `te-araroa`, Sydney). Tables `days`, `media`, `positions`, `messages`, `reactions`, `settings`. Lecture publique limitée par RLS, écriture réservée à l'admin.
- **Photos/vidéos** : redimensionnées sur le téléphone (1600 px + vignette 640 px) pour tenir dans l'offre gratuite (1 Go de stockage, 5 + 5 Go de bande passante par mois) ; vidéos HEVC ré-encodées en H.264 720p (lisibles partout), son copié tel quel ; envoi reprenable (TUS) pour les gros fichiers.
- **Hors ligne** : le Carnet enregistre tout dans IndexedDB et envoie dès que le réseau revient (quand l'appli est ouverte : iOS ne fait pas d'envoi en arrière-plan pour une appli web). Le service worker sert les pages depuis le téléphone si le réseau traîne plus de 3,5 s.
- **Position** : OwnTracks (automatique) + « Partager ma position » (manuel) + géolocalisation des photos. Rien n'est public avant la date de départ ; délai de confidentialité réglable.
- **Tracé** : GPX officiel 2026-27 du Te Araroa Trust, importé et assemblé en PostGIS (`trail-import`), publié dans `site/trail.json`.

## Développer

```bash
cd web
npm install
npm run dev            # http://localhost:5173/?mock  (données d'exemple, carte hors-ligne)
npm run build          # génère web/dist
```

`?mock` charge des données fictives ; ajouter `&offline-map` pour une carte simplifiée quand les serveurs de tuiles sont inaccessibles. Sans `?mock` le site lit la vraie base.

Données du sentier : pousser sur la branche `bot/data` lance `.github/workflows/data.yml` (Overpass + altitudes) ; les fichiers arrivent sur `bot/data-out`, à copier dans `web/public/data/`. Captures : pousser sur `bot/qa`, résultats sur `bot/qa-out`.

## Mise en ligne

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` : build avec `SITE_URL` (liens d'aperçu absolus), puis publication du dossier `web/dist` sur la branche `gh-pages`. Dans GitHub, *Settings › Pages* doit pointer sur la branche `gh-pages`, dossier `/`.

## Crédits

- Tracé : [Te Araroa Trust](https://www.teararoa.org.nz/trail-maps/), licence CC BY 4.0
- Carte et lieux : [OpenFreeMap](https://openfreemap.org), © [les contributeurs d'OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)
- Imagerie : Esri, Maxar, Earthstar Geographics (ou © Toitū Te Whenua LINZ, CC BY 4.0, avec une clé LINZ)
- Relief : Terrain Tiles (Mapzen / AWS Open Data)
- Météo : Open-Meteo
- Police des récits : Literata (SIL Open Font License)
