# 🎬 CineScope

CineScope est une application web de découverte de films réalisée avec **Angular** pour le frontend et **Python / FastAPI** pour le backend. Elle propose un catalogue de films et utilise l'API **TMDB (The Movie Database)** pour la recherche et les fiches détaillées.

## Fonctionnalités

- Affichage d'un catalogue de films et de leurs affiches.
- Recherche de films par titre dans le catalogue local.
- Filtrage du catalogue par genre.
- Recherche de films sur TMDB via le backend FastAPI.
- Consultation de fiches détaillées : synopsis, année, genres, durée, réalisateur, acteurs, note et bande-annonce (selon les informations disponibles sur TMDB).
- Ajout de commentaires sur une fiche film **pendant la session**. Ces commentaires ne sont pas enregistrés en base de données et disparaissent au rechargement de la page.

## Technologies

| Partie | Technologies |
| --- | --- |
| Frontend | Angular 22, TypeScript, SCSS |
| Backend | Python 3.13, FastAPI, HTTPX |
| Données de films | Catalogue local et API TMDB |
| Exécution conteneurisée | Docker, Docker Compose, Nginx |
| Tests frontend | Vitest / Angular TestBed |
| Versionnement | Git et GitHub |

## Structure du projet

```text
cinescope-complet/
├── cinescope/              # Application Angular
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── proxy.conf.json
│   └── package.json
├── cinescope-api/          # API Python / FastAPI
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── .env            # À créer localement : non versionné
├── compose.yaml            # Démarrage des deux services
├── .gitignore
└── README.md
```

## Prérequis

**Pour le lancement recommandé avec Docker :**
- Git (pour récupérer le dépôt).
- Docker Desktop avec Docker Compose.
- Un **token d'accès en lecture à l'API TMDB** (Bearer token).

**Pour un lancement sans Docker :**
- Node.js 24 et npm pour Angular.
- Python 3.13 pour FastAPI.

## Démarrage rapide avec Docker Compose (recommandé)

Toutes les commandes ci-dessous sont à exécuter depuis le dossier **racine** `cinescope-complet`, où se trouve `compose.yaml`.

### 1. Récupérer le projet

```powershell
git clone https://github.com/SOSO556/cinescope.git cinescope-complet
cd cinescope-complet
```

> Le dépôt GitHub doit contenir `cinescope/`, `cinescope-api/` et `compose.yaml`. Si ce n'est pas encore le cas, il faut d'abord publier la réorganisation du dépôt.

### 2. Configurer le token TMDB

Dans `cinescope-api`, créer le fichier `.env` à partir du modèle :

```powershell
Copy-Item .\cinescope-api\.env.example .\cinescope-api\.env
```

Éditer ensuite `cinescope-api/.env` :

```dotenv
TMDB_TOKEN=votre_token_de_lecture_tmdb
```

Le token est le **jeton d'accès en lecture à l'API TMDB**, pas la clé API classique. Ne jamais publier ce fichier ni communiquer le vrai token dans un commit.

Si `.env.example` n'est pas encore présent, créer manuellement le fichier `.env` avec la ligne indiquée ci-dessus.

### 3. Construire et démarrer les services

Vérifier que Docker Desktop est lancé, puis exécuter :

```powershell
docker compose up --build -d
```

Cette commande construit et démarre :
- `api` : le backend FastAPI, accessible uniquement aux autres conteneurs sur le réseau Docker.
- `web` : le frontend Angular servi par Nginx, exposé sur le port `8080` de l'ordinateur.

### 4. Ouvrir l'application

**http://localhost:8080**

Pour consulter l'état des conteneurs :

```powershell
docker compose ps
```

Pour lire les journaux :

```powershell
docker compose logs -f
```

Pour arrêter les services :

```powershell
docker compose down
```

## Lancement sans Docker (développement)

Il faut ouvrir **deux terminaux** : un pour le backend et un pour le frontend.

### Terminal 1 : backend FastAPI

Depuis la racine du projet :

```powershell
cd cinescope-api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Créer le fichier `.env` dans `cinescope-api` et y configurer `TMDB_TOKEN` comme expliqué plus haut, puis lancer :

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

- API : **http://127.0.0.1:8000**
- Documentation interactive : **http://127.0.0.1:8000/docs**

### Terminal 2 : frontend Angular

Depuis la racine du projet :

```powershell
cd cinescope
npm install
npm start
```

Ouvrir **http://localhost:4200**.

Le fichier `cinescope/proxy.conf.json` redirige les appels frontend vers `/api/...` au backend local sur le port `8000`. Il faut donc garder le backend démarré pour effectuer les recherches TMDB.

## Tests et compilation Angular

Depuis `cinescope/` :

```powershell
npm run build
npm test -- --watch=false
```

La première commande compile le frontend. La seconde exécute une fois les tests unitaires.

## Principales routes de l'API

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/` | Vérification simple de l'API |
| `GET` | `/api/films` | Route de démonstration, avec données fixes |
| `GET` | `/api/recherche?titre=Batman` | Recherche de films sur TMDB |
| `GET` | `/api/fiche/ID_TMDB` | Fiche détaillée d'un film TMDB |
| `GET` | `/api/fiche-locale?titre=Interstellar&annee=2014` | Recherche de la correspondance TMDB d'un film du catalogue local |

En mode Docker, Nginx transmet automatiquement les requêtes `/api/...` du frontend au service FastAPI. Le port `8000` du conteneur API **n'est pas publié directement sur l'ordinateur** par `compose.yaml`.

## Travail collaboratif avec Git

Après avoir cloné le dépôt, chaque membre configure son propre `cinescope-api/.env` puis démarre le projet.

Pour récupérer les dernières modifications :

```powershell
git pull
```

Avant de proposer ses changements :

```powershell
git status
git add <fichiers_modifies>
git commit -m "Description des modifications"
git push
```

Il est conseillé de travailler sur des branches distinctes pour éviter de modifier simultanément les mêmes fichiers.

**Important :** ne pas versionner `.env`, `.venv/`, `node_modules/`, les fichiers compilés et les caches.

## Limites actuelles

- Aucun système de comptes utilisateurs ni de base de données SQL n'est intégré à ce stade.
- Les commentaires sont temporaires : ils ne sont pas sauvegardés après un rechargement.
- Les informations et bandes-annonces TMDB nécessitent une connexion Internet, un token valide et dépendent des données disponibles sur TMDB.

## Source des données

Ce projet utilise l'API **The Movie Database (TMDB)** pour enrichir les informations sur les films. Il n'est pas affilié à TMDB.
