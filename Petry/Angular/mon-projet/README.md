# CryptoScope : Angular + Python

Premier tableau de bord crypto en français : Bitcoin, Ethereum, Solana et Cardano
cotés en euros, avec cours, variation et extrêmes sur 24 h, recherche et état de connexion.
Un clic sur une carte ou le nom d’une monnaie ouvre son graphique interactif.

## Docker et déploiement

Voir le guide complet [`DEPLOYMENT.md`](DEPLOYMENT.md) : création des images, lancement
local, accélération NVIDIA, VM gratuite, accès SSH et publication HTTPS.

## Démarrer

Les dépendances sont déjà installées dans cet environnement. Ouvrir deux terminaux
à la racine de `mon-projet`.

Terminal 1 — serveur Python :

```bash
npm run start:api
```

Terminal 2 — interface Angular :

```bash
npm start -- --open
```

Interface : <http://localhost:4200>. Documentation interactive de l’API :
<http://127.0.0.1:8000/docs>. Arrêt : `Ctrl+C` dans chaque terminal.

Le CLI Angular local est utilisé par `npm start` et `npx ng` ; aucune installation
globale supplémentaire n’est nécessaire. Par exemple :

```bash
npx ng generate component ma-nouvelle-vue
```

## Réinstaller sur une autre machine Linux/macOS

Prérequis : Node.js 24.15+ dans la branche 24 LTS, npm et Python 3.11+ avec `venv`.
La configuration a été vérifiée avec Node 24.20 et Python 3.13.

```bash
cd mon-projet
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Les commandes npm du serveur ciblent Linux/macOS. Sous Windows, utiliser
`backend\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload --port 8000`
pour lancer Python après avoir créé l’environnement avec `py -m venv backend/.venv`.

## Graphiques historiques

Cliquer sur une carte ou sur le nom d’une monnaie dans le tableau. La fenêtre propose :

- **Aujourd’hui** : depuis minuit dans le fuseau du navigateur, clôtures de 5 minutes.
- **7 jours** : les sept derniers jours, clôtures horaires.
- **1 mois** : depuis la même date du mois précédent, clôtures de 6 heures.
- **1 an** : depuis la même date de l’année précédente, clôtures journalières.
- **Max** : tout l’historique disponible pour cette paire Coinbase, clôtures journalières.

Les fins de mois et les années bissextiles sont prises en compte. Survoler ou toucher
la courbe affiche le prix et sa date. Le bouton « Afficher les données du graphique »
donne accès aux valeurs dans un tableau. Le dernier cours reçu complète la courbe en
direct ; les graphiques indiquent les interruptions du flux.

L’API `GET /api/history/BTC-EUR?period=day&timezone=Europe%2FParis` accepte les périodes
`day`, `week`, `month`, `year`, `max` et un fuseau IANA. Le serveur récupère toutes les
pages Coinbase (moins de 300 bougies par requête), trie les points et supprime les
doublons. Max parcourt la période depuis 2009, y compris les pages vides, pour retrouver
les premières cotations de chaque paire. L’historique des cryptomonnaies avant leur
cotation sur Coinbase n’est pas fourni par cette source.

Les réponses sont mises en cache une minute (une heure pour Max) ; les requêtes REST
sont espacées pour respecter les limites du fournisseur. La première ouverture de
Max peut prendre quelques secondes. Une erreur sur une page interrompt la réponse
complète et propose de réessayer, sans présenter un historique partiel comme complet.

## Assistant IA local avec Ollama

Un panneau « Assistant IA » permet de poser une question sur les quatre cryptos.
Choisir 7 jours, un mois ou un an, puis lancer l’analyse. Le serveur calcule les
variations, la baisse maximale et la volatilité à partir des clôtures historiques,
puis transmet cette synthèse datée au modèle. Le résultat est accompagné d’un tableau
« Voir les données utilisées » pour vérifier les chiffres et repérer les cotations anciennes.

Dans cet environnement, Ollama 0.40.6 est installé dans `.local/ollama`, avec le modèle
`qwen3:4b-instruct`. Les fichiers lourds sont ignorés par Git. Trois processus sont nécessaires,
chacun dans son terminal à la racine de `mon-projet` :

```bash
npm run start:ollama
```

```bash
npm run start:api
```

```bash
npm start -- --open
```

Le script `scripts/ollama.sh` limite le serveur à `127.0.0.1:11434`, stocke les modèles
dans `.local/ollama/models` et désactive les fonctionnalités cloud d’Ollama. La génération
reste sur la machine ; le tracker contacte Coinbase pour obtenir les cours et historiques.
Le premier lancement d’Ollama peut créer ses clés dans le dossier utilisateur `~/.ollama`.

Pour vérifier les modèles installés :

```bash
npm run ollama:list
```

Si le modèle manque, démarrer Ollama puis, dans un autre terminal :

```bash
npm run ollama:pull
```

Après une installation sur une autre machine, installer d’abord Ollama depuis sa
[documentation officielle](https://docs.ollama.com/linux), puis utiliser les mêmes
scripts npm. Le script accepte aussi un exécutable `ollama` présent dans le PATH.
Le modèle Qwen3 4B représente environ 2,5 Go de téléchargement, en plus du moteur.

Le serveur Python lit deux variables d’environnement au démarrage :

- `OLLAMA_BASE_URL` : `http://127.0.0.1:11434` par défaut.
- `OLLAMA_MODEL` : `qwen3:4b-instruct` par défaut. Pour changer de modèle, le télécharger dans
  Ollama et définir cette variable avant `npm run start:api`.

Exemple pour un autre modèle déjà téléchargé :

```bash
OLLAMA_MODEL=nom-du-modele npm run start:api
```

Les paramètres du modèle et l’adresse d’Ollama restent configurés côté serveur.
Le navigateur envoie uniquement la question, la période et son fuseau horaire :

- `GET /api/assistant/status` : disponibilité du modèle configuré.
- `POST /api/assistant/analyze` : analyse fondée sur les données du tracker.
- `backend/assistant.py` : calculs, consignes et appel à `/api/chat` d’Ollama.
- `src/app/market-assistant/` : formulaire et affichage de l’analyse.

Cette première version est un assistant interrogé à la demande : elle ne surveille
pas automatiquement le marché et ne passe aucun ordre. Elle utilise une synthèse
préparée par Python ; aucun accès au terminal, aux fichiers ou à un compte de trading
n’est fourni au modèle. Elle ne consulte pas les actualités et ne connaît pas le profil
financier de l’utilisateur. Le commentaire généré n’est pas validé phrase par phrase : le tableau calculé par Python
reste la référence numérique. Les résultats peuvent être erronés et les rendements passés
ne prédisent pas les rendements futurs. Les consignes demandent une comparaison
conditionnelle des risques et les informations manquantes avant tout conseil personnalisé.

Les mesures sont calculées sur les clôtures disponibles : la volatilité est l’écart type
des rendements logarithmiques par intervalle, non annualisé ; la baisse maximale est le
plus grand recul d’une clôture depuis un sommet précédent. Les trous sont signalés et
peuvent biaiser la comparaison. Le modèle n’effectue pas ces calculs lui-même.

Une seule génération est acceptée à la fois par processus Python. Une panne d’Ollama
ou un modèle manquant laisse le reste du dashboard utilisable ; le panneau indique
comment rétablir l’assistant. Les tests automatisés simulent Ollama et vérifient les
indicateurs, les erreurs et l’affichage de la réponse comme texte.

Documentation : [API chat Ollama](https://docs.ollama.com/api/chat),
[Qwen3 4B](https://ollama.com/library/qwen3:4b-instruct).

## Fonctionnement

```text
Coinbase Exchange (WebSocket public)
              ↓ ticker + heartbeat
Python / FastAPI (port 8000, cache en mémoire)
              ↓ WebSocket /ws/prices, un instantané par seconde
Angular + Material + SCSS (port 4200)
```

Le flux `ticker` fournit les mises à jour lors des transactions. Le serveur maintient
une seule connexion Coinbase par processus et partage les cours entre les navigateurs.
Il calcule la variation à partir de `open_24h`. Il se reconnecte automatiquement avec
un délai progressif en cas de coupure ; Angular se reconnecte également si le serveur
Python s’arrête. Les derniers prix restent visibles et sont signalés comme tels.
Les horodatages indiquent la réception par le serveur Python, affichée dans le fuseau
du navigateur. Aucun cours de démonstration n’est injecté.

Une connexion Internet vers `wss://ws-feed.exchange.coinbase.com` est nécessaire.
Aucune clé API n’est nécessaire pour ce flux public. Un actif peu échangé peut ne
recevoir un nouveau cours qu’au prochain échange. Les cours affichés sont ceux de
Coinbase, et non une moyenne de toutes les plateformes.

Les routes `/api/**` et `/ws/**` passent par le proxy Angular défini dans
`proxy.conf.json`. En développement, ouvrir l’interface sur `localhost:4200` ou
`127.0.0.1:4200`. Pour une autre origine, définir `ALLOWED_ORIGINS` avant de lancer
le serveur Python (liste séparée par des virgules).

## Fichiers à connaître

- `backend/main.py` : source Coinbase, liste `PRODUCTS`, cache, API et WebSocket.
- `backend/history.py` : historique, périodes, pagination et cache Coinbase.
- `src/app/coin-chart/` : fenêtre des graphiques Chart.js et sélection des périodes.
- `src/app/crypto.service.ts` : connexion Angular au serveur Python et reconnexion.
- `src/app/tableau-de-bord/` : composant du dashboard, HTML et SCSS.
- `src/styles.scss` : thème Angular Material.
- `proxy.conf.json` : liaison locale entre Angular et Python.

Pour ajouter une crypto, ajouter sa paire EUR dans `PRODUCTS`, vérifier sa disponibilité
chez Coinbase et actualiser les libellés de l’interface.

## Vérifications

```bash
npm run build
npm test
npm run test:api
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/prices
```

Les tests automatisés utilisent des données fixes et ne dépendent pas de Coinbase.
La réponse de santé distingue le serveur (`status`) du flux externe (`feed_status`).

Cette base conserve les derniers cours et un cache temporaire des historiques en mémoire.
Les graphiques récupèrent les anciennes cotations à la demande chez Coinbase. Une base
de données permettrait de conserver cet historique indépendamment du fournisseur. Pour une mise en production,
servir `dist/mon-projet/browser` avec un serveur web et router `/api` et `/ws` vers
FastAPI en HTTPS/WSS ; `ng serve` et `--reload` servent au développement.

Documentation : [Angular](https://angular.dev/installation),
[compatibilité des versions](https://angular.dev/reference/versions),
[FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/),
[canaux Coinbase](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels).

Graphiques : [Chart.js](https://www.chartjs.org/docs/latest/charts/line.html).
Historique : [API Coinbase candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).
