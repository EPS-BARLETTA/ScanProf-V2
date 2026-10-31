# ScanProf V2

Application web pour les enseignants d'EPS : scanner les QR codes JSON des applications élèves, gérer les participants, les classes et les séances, former des groupes ZENOS.

Équipe EPS Lycée Vauban – Luxembourg.

## Pages

| Page | Rôle |
|---|---|
| `index.html` | Accueil |
| `scanner.html` | Scanner des QR codes (JSON) |
| `participants.html` | Tableau des participants : tri, filtre, colonnes, export CSV / PDF |
| `classes.html`, `class.html`, `activity.html` | Classes → activités → séances archivées |
| `groupe-zenos.html` | Groupes équilibrés ZENOS Tour |
| `sauvegarde.html` | Sauvegarde et restauration de toutes les données (fichier HTML) |
| `applications.html` | Explorateur des applications archivées depuis les QR |
| `aide.html` | Aide |

Les QR des courses (Chrono Carnet EPS) se scannent dans **DemiFondScan** (bouton sur l'accueil).

## Données

Tout est enregistré dans le navigateur de l'appareil (localStorage). Safari peut effacer ces données : faire régulièrement une sauvegarde depuis **💾 Sauvegarder / Restaurer**.

Le fichier de sauvegarde est une page HTML lisible (tableaux) qui contient aussi toutes les données ; il se restaure depuis la même page.

## Fichiers techniques

- `scanprof-core.js` : chargé sur toutes les pages (alerte mémoire pleine, récupération après une édition de séance interrompue, outils CSV compatibles Excel, réparation des accents des QR, mode hors-ligne).
- `sw.js` : mode hors-ligne. **Augmenter `VERSION` à chaque mise en ligne.**
- `lib/html5-qrcode.min.js` : lecteur QR (html5-qrcode 2.3.8, licence Apache 2.0, voir `lib/html5-qrcode-LICENSE.txt`).
