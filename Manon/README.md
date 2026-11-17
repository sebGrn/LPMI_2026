# Catalogue de films et séries

Application web permettant de consulter un catalogue de films et de séries à partir de l'API TMDB.

# Installation et configuration

Les étapes suivantes permettent d'installer et de lancer le projet sur un ordinateur Windows.

## 1. Installation des prérequis

### 1.1. Installer Git

Git permet de récupérer le projet depuis GitHub.

Télécharger et installer Git pour Windows :
https://git-scm.com/downloads/win

Vérifier l'installation dans PowerShell :

```powershell
git --version
```

### 1.2. Installer uv

uv permet de gérer l'environnement Python et les dépendances du backend.

Documentation et installation :
https://docs.astral.sh/uv/getting-started/installation/

Vérifier l'installation :

```powershell
uv --version
```

### 1.3. Installer Node.js et npm

Node.js permet d'exécuter les outils nécessaires au frontend Angular. npm est installé automatiquement avec Node.js.

#### Installer fnm

fnm (Fast Node Manager) permet de gérer les versions de Node.js.

Dans PowerShell :

```powershell
winget install Schniz.fnm
```

#### Installer Node.js

Installer la version 26 de Node.js :

```powershell
fnm install 26
```

#### Configurer fnm dans PowerShell

Activer fnm dans le terminal PowerShell :

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

Sélectionner Node.js 26 :

```powershell
fnm use 26
```

Pour rendre cette configuration permanente, ouvrir le profil PowerShell :

```powershell
notepad $PROFILE
```

Ajouter la ligne suivante dans le fichier :

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

Enregistrer le fichier, puis fermer et rouvrir le terminal.

#### Configurer la politique d'exécution PowerShell

Si PowerShell bloque l'exécution de npm, exécuter :

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Confirmer avec `O` puis Entrée.

#### Vérifier les installations

```powershell
node -v
npm -v
```

### 1.4. Installer Angular CLI

Angular CLI permet de créer, gérer et lancer une application Angular.

Dans PowerShell, exécuter :

```powershell
npm install -g @angular/cli
```

Vérifier l'installation :

```powershell
ng version
```

## 2. Récupérer le projet

Cloner le repository GitHub :

```powershell
git clone https://github.com/TON-PSEUDO/TON-REPOSITORY.git
```

Se placer à la racine du projet :

```powershell
cd TON-REPOSITORY
```

## 3. Configurer le backend

### 3.1. Installer les dépendances Python

Se placer dans le dossier du backend :

```powershell
cd backend
```

Installer les dépendances du projet :

```powershell
uv sync
```

### 3.2. Configurer le fichier .env

Créer un fichier `.env` à la racine du dossier `backend`.

Ajouter le jeton d'accès en lecture à l'API TMDB :

```env
TMDB_TOKEN=VOTRE_JETON_API
```

Remplacer `VOTRE_JETON_API` par son propre jeton d'accès.

Le jeton peut être obtenu depuis son compte TMDB :
https://www.themoviedb.org/settings/api

**Important :** le fichier `.env` ne doit pas être envoyé sur GitHub.

## 4. Configurer le frontend Angular

Se placer à la racine du projet Angular, dans le dossier contenant `package.json`.

```powershell
cd ..
```

Installer les dépendances :

```powershell
npm install
```

# Lancement de l'application

## 1. Lancer le backend FastAPI

Dans un premier terminal PowerShell :

```powershell
cd backend
uv run fastapi dev
```

L'API est accessible à l'adresse :

http://127.0.0.1:8000

La documentation interactive de l'API est disponible à l'adresse :

http://127.0.0.1:8000/docs

## 2. Lancer le frontend Angular

Dans un second terminal PowerShell, depuis la racine du projet :

```powershell
cd src
ng serve
```

L'application est accessible à l'adresse :

http://localhost:4200


# Technologies utilisées

- Angular
- TypeScript
- Python
- FastAPI
- uv
- TMDB API