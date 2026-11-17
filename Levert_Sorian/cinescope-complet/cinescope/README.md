# CineScope 🎬

## Présentation

CineScope est une application web permettant de découvrir et consulter des films.

Le projet utilise Angular pour l'interface utilisateur et Python avec FastAPI pour le serveur. Les informations des films sont récupérées grâce à l'API TMDB.

## Technologies utilisées

- Angular : interface frontend
- TypeScript : développement frontend
- Python : développement backend
- FastAPI : création de l'API
- TMDB : récupération des informations des films
- Docker : conteneurisation de l'application
- Git : gestion des versions

## Organisation du projet

Le projet est organisé en deux dossiers :

- `cinescope` : application Angular
- `cinescope-api` : serveur Python FastAPI

## Installation du frontend

Prérequis : Node.js et npm.

Depuis le dossier `cinescope` :

```powershell
npm install
```

Pour démarrer le serveur Angular :

```powershell
ng.cmd serve --open
```

L'application est accessible à l'adresse :

http://localhost:4200

## Installation du backend

Prérequis : Python.

Depuis le dossier `cinescope-api`, créer l'environnement virtuel si nécessaire :

```powershell
python -m venv .venv
```

Installer les dépendances :

```powershell
.\.venv\Scripts\python.exe -m pip install fastapi uvicorn httpx python-dotenv
```

Configurer le fichier `.env` avec le token personnel TMDB :

```env
TMDB_TOKEN=votre_token_tmdb
```

Démarrer le serveur :

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

L'API est accessible à l'adresse :

http://127.0.0.1:8000

La documentation interactive de l'API est disponible sur :

http://127.0.0.1:8000/docs

## Lancement avec Docker

Depuis le dossier `cinescope`, construire l'image :

```powershell
docker build -t cinescope-web:1.0 .
```

Créer et démarrer le conteneur :

```powershell
docker run -d --name cinescope-web -p 4200:80 cinescope-web:1.0
```

Accéder à l'application :

http://localhost:4200

Pour arrêter le conteneur :

```powershell
docker stop cinescope-web
```

Pour le redémarrer :

```powershell
docker start cinescope-web
```

**Remarque :** cette configuration Docker concerne actuellement le frontend. Le backend Python doit encore être démarré séparément.

## Fonctionnalités principales

- Consultation du catalogue de films.
- Recherche de films par titre.
- Filtrage par catégorie.
- Affichage des affiches de films.
- Consultation des fiches détaillées.
- Récupération d'informations depuis TMDB.
- Affichage des synopsis, acteurs, réalisateurs et bandes-annonces.
- Ajout de commentaires sur les fiches de films.

## Gestion du code

Le projet utilise Git pour suivre les modifications et conserver les différentes versions du code.