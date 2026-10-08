# Te Araroa avec Ewan

Le carnet de route en ligne d'Ewan sur le Te Araroa, île du Sud (Ship Cove → Bluff, 1 334 km).
Les proches suivent sa position, ses étapes, ses photos et lui laissent des mots ; Ewan publie depuis son iPhone, même sans réseau.

## Ce que contient le dépôt

| Dossier | Rôle |
| --- | --- |
| `web/` | Le site (Vite + Preact + MapLibre). `index.html` = site public, `admin/` = le « Carnet » d'Ewan |
| `supabase/migrations/` | Schéma de la base, sécurité (RLS), fonctions SQL |
| `supabase/functions/` | Fonctions serveur : import du tracé officiel, suivi OwnTracks, création du compte admin |

## Architecture

- **Site** : application statique (GitHub Pages). Carte 3D MapLibre GL (imagerie Esri ou LINZ, relief Terrain Tiles), tracé officiel en orange au fil des étapes, panneau type Apple Maps.
- **Données** : Supabase (projet `te-araroa`, Sydney). Tables `days`, `media`, `positions`, `messages`, `reactions`, `settings`. Lecture publique limitée par RLS, écriture réservée à l'admin.
- **Photos/vidéos** : redimensionnées sur le téléphone (2048 px + vignette 640 px), vidéos ré-encodées en 720p quand c'est possible, envoi reprenable (TUS) pour les gros fichiers.
- **Hors ligne** : le Carnet enregistre tout dans IndexedDB et envoie dès que le réseau revient.
- **Position** : OwnTracks (automatique) + « Partager ma position » (manuel) + géolocalisation des photos. Rien n'est public avant la date de départ ; délai de confidentialité réglable.
- **Tracé** : GPX officiel 2026-27 du Te Araroa Trust, importé et assemblé en PostGIS (`trail-import`), publié dans `site/trail.json`.

## Développer

```bash
cd web
npm install
npm run dev            # http://localhost:5173/?mock  (données d'exemple, carte hors-ligne)
npm run build          # génère web/dist
```

`?mock` charge des données fictives et une carte vectorielle simplifiée ; sans ce paramètre le site lit la vraie base.

## Crédits

- Tracé : [Te Araroa Trust](https://www.teararoa.org.nz/trail-maps/), licence CC BY 4.0
- Imagerie : Esri, Maxar, Earthstar Geographics (ou © Toitū Te Whenua LINZ, CC BY 4.0, avec une clé LINZ)
- Relief : Terrain Tiles (Mapzen / AWS Open Data)
- Météo : Open-Meteo
- Police des récits : Literata (SIL Open Font License)
