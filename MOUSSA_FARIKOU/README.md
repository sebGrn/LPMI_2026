# Tracker Cryptomonnaies

Application Angular développée par **MOUSSA** (Licence Professionnelle LPMI, Université de Bourgogne),
réalisée en suivant le cours « Technologies pour le web - Framework Angular ».

## Lancer l'application

Il faut 3 terminaux, tous dans le dossier du projet :

```bash
# 1. Serveur de données JSON (port 3000) : cryptos + images
npm run json-server

# 2. Serveur Python Flask (port 5000) : message affiché dans « À propos »
#    (la première fois : python3 -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt)
npm run backend

# 3. Application Angular (port 4200)
ng serve --open
```

Les **prix en direct** viennent de l'API publique **CoinGecko** (gratuite, sans clé, appelée directement par Angular).
Si elle ne répond pas, l'application affiche les prix enregistrés dans le serveur JSON (« Prix enregistré »).

Tests automatiques : `ng test --watch=false`

Pages : Accueil (`/home`), À propos (`/aboutus`), Cryptos (`/cryptos`), détail (`/cryptodetail/:id`), Contact (`/contactus`), et la fenêtre Login.

---


This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
