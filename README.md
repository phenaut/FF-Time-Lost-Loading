





# FF Time Lost Loading 1.8.3

**Auteur :** Pierre Henaut  
**GitHub :** https://github.com/phenaut/FF-Time-Lost-Loading  
**Compatibilité :** Firefox 142+

---

## Présentation

**FF Time Lost Loading** est une extension Firefox qui mesure le temps perdu en attente de chargement sur les sites web que vous visitez. Elle affiche un compteur en temps réel sur l'icône de l'extension, et enregistre des statistiques par site, par jour et par mois.

---

## Fonctionnalités

- ⏱️ **Compteur en temps réel** sur l'icône Firefox pendant chaque mesure
- 📊 **Statistiques** par domaine, par mois : total, moyenne, min, max, pages lentes
- 🔍 **Analyseur automatique** de site pour suggérer les règles adaptées
- ⚙️ **Règles configurables** par domaine avec plusieurs modes de détection
- 🚫 **Domaines exclus** : suppression automatique des stats à l'ajout en exclusion
- 📋 **Tableau de bord** global avec toutes les mesures

---

## Interface

### Popup (clic sur l'icône)
- Affiche le temps perdu sur le site actif (aujourd'hui / ce mois / cette année)
- Bouton **Analyser ce site** : détecte automatiquement le mode de mesure adapté
- Bouton **Tableau de bord** : accès aux statistiques globales
- Bouton **Paramètres** : configuration des règles
- Toggle **Actif / Inactif** : active ou désactive toute mesure

### Paramètres
- **Domaines suivis** : liste blanche (vide = tous les sites)
- **Domaines exclus** : liste noire (les stats existantes sont supprimées à l'enregistrement)
- **Règles par domaine** : définit le mode de mesure pour chaque site
- **Seuil page lente** : durée en ms au-delà de laquelle une mesure est comptée comme "lente"

### Tableau de bord
- Vue globale de tout le temps perdu (aujourd'hui / ce mois / cette année)
- Tableau détaillé par domaine et par mois

---

## Modes de mesure

Chaque domaine peut avoir une ou plusieurs règles. Chaque règle définit un **mode** de détection.

---

### 🔵 Mode `xhr` — XHR + fenêtre de calme

**Principe :**  
Mesure le temps entre le début du chargement de la page (`main_frame`) et la fin de toute activité réseau XHR. La mesure s'arrête après une fenêtre de calme de 5 secondes sans aucune requête.

**Déclenchement :**
- Début : dès que Firefox commence à charger une nouvelle page sur ce domaine
- Fin : 5 secondes après la dernière requête XHR terminée
- Sécurité : arrêt forcé après 2 minutes si l'activité ne s'arrête pas

**Idéal pour :**  
Applications SPA (Single Page Application) qui chargent leurs données via des requêtes XHR au démarrage (Angular, React, Vue...).

**Exemple :**
```
Site : monapp.entreprise.com
Mode : xhr
→ L'utilisateur navigue vers monapp.entreprise.com
→ Le compteur démarre à 0
→ L'application charge ses données (5 requêtes XHR en 8 secondes)
→ Plus aucune requête pendant 5 secondes
→ Mesure enregistrée : 13 secondes
```

**Configuration :**
```
Domaine : monapp.entreprise.com
Mode    : XHR + calme 5 s
```

---

### 🟣 Mode `xhr-action` — XHR action utilisateur

**Principe :**  
Mesure le temps de chaque requête XHR/POST déclenchée par une **action utilisateur** (recherche, filtre, soumission de formulaire...) sur une page déjà chargée. Chaque requête est mesurée individuellement.

**Déclenchement :**
- Début : dès qu'une requête XHR part sur ce domaine (hors navigation)
- Fin : dès que cette requête reçoit une réponse
- Le badge affiche le temps de la requête en cours

**Idéal pour :**  
Sites e-commerce, catalogues produits, outils de recherche interne — partout où l'utilisateur effectue des recherches ou filtre des résultats qui génèrent des appels réseau.

**Exemple :**
```
Site : catalogue.entreprise.com
Mode : xhr-action
→ L'utilisateur tape un mot-clé dans la barre de recherche
→ Une requête POST part vers le serveur
→ Le compteur démarre : 1, 2, 3...
→ La réponse arrive après 4 secondes
→ Mesure enregistrée : 4 secondes
→ L'utilisateur affine sa recherche → nouvelle mesure indépendante
```

**Configuration :**
```
Domaine : catalogue.entreprise.com
Mode    : XHR action utilisateur
```

> 💡 **Astuce :** Utilisez l'analyseur automatique après avoir effectué une recherche sur le site. Si une requête POST lente est détectée, la suggestion `xhr-action` apparaît automatiquement.

---

### 🟢 Mode `loader` — Loader CSS

**Principe :**  
Surveille l'apparition et la disparition d'un élément HTML visible (spinner, overlay de chargement) identifié par son sélecteur CSS. La mesure dure tant que l'élément est visible.

**Déclenchement :**
- Début : l'élément CSS apparaît dans le DOM et est visible (pas de classe cachée, pas `display:none`, pas `aria-hidden="true"`)
- Fin : l'élément disparaît ou reçoit la classe cachée définie
- Debounce : 300ms par défaut pour éviter les clignotements
- Maximum : 2 minutes par défaut

**Idéal pour :**  
Applications qui affichent un spinner ou un overlay pendant le chargement.

**Exemple :**
```
Site    : erp.entreprise.com
Mode    : loader
Sélecteur : .loading-overlay
Classe cachée : hidden
→ L'utilisateur ouvre un module
→ .loading-overlay apparaît (sans classe "hidden")
→ Le compteur démarre
→ Les données se chargent, .loading-overlay reçoit la classe "hidden"
→ Mesure enregistrée : 6 secondes
```

**Exemples de sélecteurs courants :**
| Framework   | Sélecteur                  | Classe cachée |
|-------------|----------------------------|---------------|
| Bootstrap   | `.spinner-border`          | `d-none`      |
| Angular     | `.mx-grid-loading`         | `ng-hide`     |
| Tailwind    | `.loading`                 | `hidden`      |
| Générique   | `[aria-busy="true"]`        | *(vide)*      |

---

### 🟡 Mode `text` — Loader texte

**Principe :**  
Surveille l'apparition d'un texte spécifique dans un élément HTML (ex: "Chargement...", "Loading..."). La mesure dure tant que ce texte est présent.

**Déclenchement :**
- Début : le texte défini apparaît dans l'élément ciblé par le sélecteur
- Fin : le texte disparaît de l'élément
- Sensibilité à la casse : configurable
- Debounce : 300ms par défaut
- Maximum : 2 minutes par défaut

**Idéal pour :**  
Applications accessibles (ARIA) qui indiquent le chargement via du texte masqué visuellement mais présent dans le DOM.

**Exemple :**
```
Site      : monapp.entreprise.com
Mode      : text
Sélecteur : .mx-aria-only
Texte     : Chargement
→ L'utilisateur navigue vers une page
→ L'élément .mx-aria-only contient le texte "Chargement en cours..."
→ Le compteur démarre
→ Le texte disparaît une fois les données affichées
→ Mesure enregistrée : 3 secondes
```

**Exemples de sélecteurs courants :**
| Usage              | Sélecteur           | Texte à détecter        |
|--------------------|---------------------|-------------------------|
| ARIA live region   | `[role="status"]`    | `Loading` / `Chargement`|
| Angular ARIA       | `.mx-aria-only`      | `Chargement`            |
| Bootstrap          | `.visually-hidden`   | `Loading...`            |
| Générique          | `.sr-only`           | `Please wait`           |

---

## Analyseur automatique

L'analyseur (bouton **"Analyser ce site"** dans le popup) inspecte la page courante et suggère automatiquement les règles adaptées.

### Ce qu'il détecte :

| Détection | Mode suggéré | Condition |
|---|---|---|
| Spinners CSS classiques | `loader` | `.spinner-border`, `.spinner`, `.skeleton`... présents dans le DOM |
| Texte ARIA de chargement | `text` | `[role="status"]`, `.sr-only`... contenant "loading", "chargement"... |
| Requête POST lente (> 500ms) | `xhr-action` | Une requête POST a été interceptée et a pris plus de 500ms |
| Formulaire / barre de recherche | `xhr-action` | `input[type="search"]`, `[role="search"]`, `form[action]`... présents dans le DOM |

> ⚠️ **Pour détecter les requêtes POST lentes**, effectuez d'abord une recherche ou une interaction sur le site, **puis** cliquez sur "Analyser ce site".

---

## Règles multiples par domaine

Un même domaine peut avoir plusieurs règles simultanées. Elles s'exécutent en parallèle et de façon indépendante.

**Exemple — Application métier avec loader visuel ET texte ARIA :**
```
Domaine : erp.entreprise.com
Règle 1 : loader  → .mx-grid-loading  (classe cachée : ng-hide)
Règle 2 : text    → .mx-aria-only     (texte : Chargement)
```

---

## Compteur en temps réel

Pendant chaque mesure, un **badge numérique** apparaît sur l'icône de l'extension et s'incrémente chaque seconde : `0`, `1`, `2`, `3`...

- Le badge est **par onglet** : chaque onglet a son propre compteur
- Il s'efface automatiquement à la fin de la mesure
- Fonctionne pour tous les modes : `xhr`, `xhr-action`, `loader`, `text`

---

## Statistiques

Chaque mesure enregistre :
- **Domaine** et **mois**
- **Nombre de mesures**
- **Temps total, moyen, minimum, maximum**
- **Nombre de pages lentes** (au-delà du seuil configurable, défaut : 3000ms)
- **Mode utilisé** (`xhr`, `xhr-action`, `loader`, `text`, `multi-loader`)

> 🗑️ **Suppression automatique :** si vous ajoutez un domaine dans la liste d'exclusion et enregistrez, toutes ses statistiques passées sont **immédiatement supprimées**.

---

## Historique des versions

### 1.8.3
- Tri alphabétique des domaines dans l'écran des paramètres
- Suppression automatique des stats lors de l'ajout en liste d'exclusion
- Compteur en temps réel sur l'icône (badge par onglet)
- Nouveau mode `xhr-action` : mesure des requêtes XHR par action utilisateur
- Détection automatique des requêtes POST lentes dans l'analyseur
- Correction : arrêt du compteur en cas de redirection (`main_frame`)
- Correction : timeout de sécurité 2 minutes pour les mesures XHR bloquées
- Reformatage complet du code source (indentation)

### 1.8.2
- Bandeau version / auteur / GitHub dans Paramètres et Tableau de bord

### 1.8.1
- Corrections AMO (addons.mozilla.org)
- Support multi-règles par domaine

---

## Licence

Voir [LICENSE](LICENSE)
