# Catalogue Films & Séries (catalogue-seriefilms)

Application Angular pour découvrir des films et des séries, filtrer un catalogue, consulter des fiches détaillées et obtenir des recommandations avec le chatbot.

## Guide visiteur

### Découvrir le catalogue

1. Depuis la page d’accueil, sélectionnez **Découvrir** pour ouvrir le catalogue.
2. Utilisez la loupe pour rechercher un titre. La recherche commence à partir de deux caractères.
3. Affinez la liste avec les filtres de type (film ou série), genre, année ou décennie, et note.
4. Parcourez les pages de résultats avec les boutons de pagination.
5. Sélectionnez une affiche ou un titre pour ouvrir sa fiche.

Les notes affichées sont ramenées à une échelle de cinq. Si une source ne fournit pas de note, le site l’indique au lieu d’en inventer une.

### Consulter une fiche

Une fiche peut présenter le synopsis, l’année, le genre, la note, le réalisateur ou le créateur, le pays, des récompenses et des informations issues de Wikipédia. Selon les données disponibles et la configuration du serveur, elle peut aussi proposer des bandes-annonces et une playlist de bande originale.

La section des commentaires permet de publier un nom ou pseudo et un message. Les commentaires sont enregistrés dans le stockage local du navigateur : ils ne sont pas partagés avec les autres visiteurs et ne suivent pas l’utilisateur sur un autre appareil.

### Demander une recommandation

Ouvrez **ChatBot AI** depuis la barre supérieure. Vous pouvez choisir une suggestion rapide ou écrire une demande, par exemple : « une série policière récente » ou « un film d’aventure bien noté ».

Précisez le type, le genre, la période, la note ou l’ambiance. Vous pouvez ensuite affiner les résultats avec les boutons de suivi. Sélectionnez **Voir la fiche** pour consulter un titre recommandé.

Si Gemini est configuré sur le serveur, le chatbot l’utilise pour formuler ses réponses. Sinon, il continue avec son système local de recommandations.

### Changer la langue

Le sélecteur en haut de page permet de changer la langue de l’interface. Le site propose quinze langues. Les données et les synopsis dépendent des sources disponibles ; leur traduction peut prendre quelques instants ou ne pas être proposée pour certains titres.

## Guide développeur

### Prérequis

- Node.js et npm compatibles avec les dépendances Angular du projet.
- Une connexion Internet pour installer les dépendances et récupérer les données des services publics.

### Installer et lancer le site

Depuis le dossier `catalogue-films-series` :

```bash
npm install
npm start
```

Ouvrez ensuite [http://localhost:4200](http://localhost:4200). Le serveur de développement recharge l’application lorsque les fichiers changent.

### Configurer les services facultatifs

Copiez `.env.example` vers `.env`, puis renseignez les clés dont vous avez besoin. Le serveur lit ce fichier au démarrage.

| Variable | Utilité |
| --- | --- |
| `GOOGLE_STUDIO_API_KEY` | Active les réponses Gemini du chatbot. Sans cette clé, les recommandations locales restent disponibles. |
| `YOUTUBE_API_KEY` | Permet la recherche de bandes-annonces et de playlists YouTube sur les fiches. |
| `TMDB_API_READ_ACCESS_TOKEN` | Active l’enrichissement du catalogue avec les données TMDB lorsqu’elles sont disponibles. |

Ces variables sont facultatives pour lancer le site. Gardez les clés dans le `.env` du serveur, jamais dans le code client. Ne publiez pas le fichier `.env`.

### Commandes utiles

```bash
npm start                           # serveur de développement Angular
npm run build                       # build de production avec rendu serveur
npm run watch                       # build de développement en mode surveillance
npm test                            # tests unitaires avec Vitest
npm run serve:ssr:catalogue-films-series  # démarre le build SSR déjà généré
```

Le serveur SSR écoute le port `4000` par défaut. Pour le changer, définissez la variable d’environnement `PORT` avant de le lancer.

### Importer l’index IMDb local (facultatif)

Le serveur peut utiliser un index SQLite local pour le catalogue. Pour télécharger les fichiers publics IMDb et construire cet index :

```bash
npm run import:imdb
npm run index:imdb
```

L’import télécharge plusieurs fichiers de données volumineux et crée les fichiers dans `data/imdb/`. Relancez `npm run index:imdb` après un nouvel import pour recalculer l’ordre de pagination.

### Repères dans le code

- `src/app/app.routes.ts` : routes de l’accueil, du catalogue, des fiches et du chatbot.
- `src/app/catalogue/` : affichage, recherche et filtres du catalogue.
- `src/app/media-detail/` : fiche d’un film ou d’une série et commentaires.
- `src/app/chatbot/` : interface du chatbot et suggestions.
- `src/app/services/` : accès aux données, langues et recommandations.
- `src/server.ts` : serveur Express/Angular SSR et routes pour les sources de données externes.
- `scripts/` : import des données IMDb et indexation SQLite.

### Sources de données

Le site utilise notamment MediaWiki/Wikipedia, Wikidata et TVmaze. TMDB et YouTube peuvent fournir des données supplémentaires si leurs clés sont configurées. La disponibilité et l’exhaustivité des informations dépendent de ces services externes.
