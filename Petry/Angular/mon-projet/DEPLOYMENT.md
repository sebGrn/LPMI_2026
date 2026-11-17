# Déployer CryptoScope avec Docker

Ce guide couvre la construction des images, le lancement sur ta machine, puis le
transfert vers un serveur Linux. Aucune inscription ni dépense de serveur n’est
nécessaire pour le lancement local. Il utilise Docker Compose, sans Kubernetes.

## 1. Ce qui sera lancé

```text
Navigateur → web : Angular compilé + Caddy
                 ├─ /api/* → api : FastAPI → Coinbase
                 └─ /ws/*  → api : WebSocket des cours
                                  └─ ollama : modèle local
```

Une **image** contient le logiciel construit ; un **conteneur** est une instance de
cette image en cours d’exécution. Compose relie les trois conteneurs. Le service
`ollama-init` est une tâche ponctuelle qui télécharge le modèle dans un volume.

| Fichier | Rôle |
| --- | --- |
| `Dockerfile` | Compile Angular avec Node puis copie les fichiers dans Caddy. |
| `backend/Dockerfile` | Installe Python et lance FastAPI avec un utilisateur non root. |
| `compose.yaml` | Lance web, API et Ollama, avec leurs contrôles de santé. |
| `compose.gpu.yaml` | Ajoute l’accès à un GPU NVIDIA pour Ollama. |
| `compose.production.yaml` | Publie le site en HTTPS avec un mot de passe. |
| `docker/Caddyfile*`, `docker/routes.caddy` | Fichiers Angular, proxy API et WebSocket. |
| `.env.example` | Paramètres à copier dans `.env`. |

En local, seul `127.0.0.1:8080` est publié. Python et Ollama communiquent sur le réseau
Docker, via `api:8000` et `ollama:11434`. Le navigateur reste sur la même origine :
aucun changement du code Angular ni de ses URL n’est nécessaire.

Les dossiers `.local`, `node_modules`, les environnements Python et `.env` sont exclus
des contextes de construction. Le modèle n’est donc pas ajouté aux images.

## 2. Choisir local ou serveur gratuit

**Sur ta machine** : la configuration fonctionne avec le CPU ; l’option NVIDIA permet
d’utiliser ta RTX 3060. Prévoir au moins 8 Go de RAM disponibles et environ 20 Go de
disque pour Docker, les images et le modèle. La machine doit rester allumée pour
que le site reste disponible.

**VM gratuite possible** : selon la documentation Oracle consultée le 20 octobre 2026,
l’offre Always Free Ampere A1 permet jusqu’à 2 OCPU et 12 Go de RAM dans les quotas
mensuels indiqués. Une VM Ubuntu ARM peut donc être candidate à ce tracker, avec Ollama
sur CPU. Les images choisies prennent en charge Linux AMD64 et ARM64. Les temps de
réponse sur cette VM n’ont pas été mesurés. La capacité gratuite peut manquer et une
VM jugée inactive peut être récupérée par Oracle : cette offre ne garantit pas un
hébergement permanent. Vérifier l’éligibilité et les quotas affichés avant de créer
la VM, sans activer de ressource payante.
[Source Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Un compte fournisseur et une VM accessible en SSH sont nécessaires au déploiement
distant. Ils ne sont pas créés par ces fichiers. Sans VM disponible, suivre les
sections locales : elles ne dépendent pas d’un hébergeur.

## 3. Installer Docker sur Debian ou Ubuntu

Sur ta machine actuelle, le système est Debian 13. Ouvrir un terminal :

```bash
cd /home3/tp489248/Documents/angular/mon-projet
sudo bash scripts/install-docker-linux.sh
sudo docker run --rm hello-world
sudo docker compose version
```

Le script configure le dépôt officiel et installe Docker Engine, Buildx et le plugin
Compose. Il nécessite un compte administrateur et peut demander ton mot de passe
système dans le terminal. Il ne change pas les groupes de ton compte et ne supprime
pas d’installation concurrente. Si Docker ou containerd est déjà géré par ton
administrateur, lui confier cette étape.

Les commandes ci-dessous utilisent `sudo` pour fonctionner sans ajout au groupe Docker.
Sur Windows/macOS, installer Docker Desktop et omettre `sudo` ; les étapes GPU de ce
guide ciblent Linux avec NVIDIA. Utiliser Compose 2.24.4 ou plus récent pour l’option
HTTPS (`!override`). Les fichiers ont été contrôlés avec Compose 5.6.0.

Documentation : [Debian](https://docs.docker.com/engine/install/debian/),
[Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 4. Préparer la configuration

À la racine de `mon-projet` :

```bash
cp .env.example .env
```

Ne pas écraser un `.env` existant : le modifier à la place. Les valeurs locales sont :

```dotenv
WEB_BIND=127.0.0.1
WEB_PORT=8080
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
OLLAMA_MODEL=qwen3:4b-instruct
IMAGE_TAG=local
```

Si tu modifies le port, adapter aussi les deux origines. `.env` est ignoré par Git.
Ne pas utiliser `localhost:11434` pour l’API dans Docker : ce serait le conteneur Python
lui-même. Compose configure déjà `OLLAMA_BASE_URL=http://ollama:11434`.

### Option NVIDIA pour ta machine

Le lancement CPU ne nécessite pas cette étape. Pour utiliser ta RTX :

1. Vérifier que le pilote hôte fonctionne avec `nvidia-smi`.
2. Installer NVIDIA Container Toolkit et configurer Docker, avant de lancer le tracker :

```bash
sudo apt-get update
sudo apt-get install -y curl gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

3. Ajouter cette ligne dans `.env` :

```dotenv
COMPOSE_FILE=compose.yaml:compose.gpu.yaml
```

Toutes les commandes `sudo docker compose ...` suivantes utiliseront alors le GPU.
Sur une VM gratuite sans GPU, garder uniquement `compose.yaml` et ne pas ajouter cette
ligne. Le redémarrage du service Docker concerne aussi les autres conteneurs de la machine.
[Guide NVIDIA](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).

## 5. Construire les images

```bash
sudo docker compose config --quiet
sudo docker compose build
```

La construction exécute `npm ci`, compile Angular en production et prépare l’API Python.
Node.js sert uniquement à construire le frontend ; le conteneur web final utilise Caddy.
Python est lancé sans `--reload`, avec un seul worker pour partager le flux Coinbase.

Pour inspecter les images :

```bash
sudo docker image ls cryptoscope-web
sudo docker image ls cryptoscope-api
```

## 6. Créer les conteneurs et installer le modèle

```bash
sudo docker compose up -d --wait
sudo docker compose run --rm ollama-init
sudo docker compose exec ollama ollama list
```

`up` crée le réseau, les volumes et les conteneurs, puis attend leurs contrôles de santé.
Le téléchargement du modèle représente environ 2,5 Go. Il se fait une seule fois dans
le volume persistant `cryptoscope_ollama_data`. L’IA reste indisponible jusqu’à la fin
du téléchargement ; le tracker peut déjà afficher ses cours.

Si tu veux réutiliser le modèle installé précédemment dans le projet, remplacer la
commande de téléchargement par les commandes suivantes, après `up` :

```bash
sudo docker compose cp .local/ollama/models/. ollama:/root/.ollama/models/
sudo docker compose run --rm ollama-init
```

La seconde commande vérifie/réutilise les fichiers existants et ne retélécharge que
les éléments manquants. Cette copie est facultative ; le téléchargement seul suffit.

## 7. Vérifier le déploiement local

Ouvrir **http://localhost:8080** puis lancer :

```bash
sudo docker compose ps
curl --fail http://localhost:8080/healthz
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8080/api/prices
curl --fail http://localhost:8080/api/assistant/status
sudo docker compose logs --tail=50 api ollama web
```

Attendre les premières cotations après le démarrage. `feed_status` distingue le serveur
Python du flux Coinbase. Cliquer sur une monnaie pour vérifier les graphiques, puis
poser une question dans le panneau IA. L’état de l’assistant doit indiquer `available: true`.
Les connexions sortantes vers Coinbase et le registre Ollama doivent être autorisées.

Avec NVIDIA :

```bash
sudo docker compose exec ollama ollama ps
sudo docker compose exec ollama nvidia-smi
```

Le premier chargement peut prendre plus de temps. Sur un petit CPU, une génération
peut atteindre le délai de réponse de l’application ; choisir un modèle de conversation
plus léger compatible ou utiliser le GPU. La configuration de base n’impose pas de GPU.

## 8. Transférer vers une VM gratuite ou un autre serveur

Dans la console du fournisseur : créer une VM Linux compatible, récupérer son IP et
configurer une clé SSH. Pour Oracle, choisir une configuration explicitement incluse
dans Always Free et rester dans les quotas. Autoriser SSH depuis ton IP dans les règles
réseau. Les commandes suivantes supposent une VM Ubuntu et son utilisateur `ubuntu`.

Sur ton PC, depuis `mon-projet` :

```bash
tar -czf /tmp/cryptoscope-src.tgz \
  --exclude='./node_modules' --exclude='./.local' --exclude='./.angular' \
  --exclude='./dist' --exclude='./backend/.venv' \
  --exclude='./backend/__pycache__' --exclude='./backend/.pytest_cache' \
  --exclude='./.env' --exclude='./.git' .
scp /tmp/cryptoscope-src.tgz ubuntu@IP_DU_SERVEUR:~/cryptoscope-src.tgz
ssh ubuntu@IP_DU_SERVEUR
```

Si nécessaire, ajouter `-i /chemin/cle-ssh` aux commandes `scp` et `ssh`.
Sur le serveur :

```bash
mkdir -p ~/cryptoscope
tar -xzf ~/cryptoscope-src.tgz -C ~/cryptoscope
cd ~/cryptoscope
sudo bash scripts/install-docker-linux.sh
cp .env.example .env
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose up -d --wait
sudo docker compose run --rm ollama-init
sudo docker compose ps
```

Les images seront construites nativement pour l’architecture du serveur, y compris ARM64.
Il n’est pas nécessaire de publier les images dans Docker Hub. Les modèles présents
sur ton PC ne sont pas transférés par l’archive et seront téléchargés dans la VM.

### Accès privé gratuit, sans domaine

Garder la configuration locale du serveur, qui publie uniquement sur son loopback.
Depuis ton PC, dans un terminal laissé ouvert :

```bash
ssh -N -L 8080:127.0.0.1:8080 ubuntu@IP_DU_SERVEUR
```

Ouvrir **http://localhost:8080** sur ton PC. Le site est alors hébergé sur le serveur
et accessible par le tunnel SSH, sans publier les ports Python/Ollama ni acheter un
nom de domaine. Arrêter auparavant un éventuel tracker local déjà lancé sur le port
8080. Pour choisir un autre port local, l’ajouter aux origines autorisées sur la VM.

## 9. Publier sur Internet avec HTTPS

Cette étape est facultative. Il faut un nom de domaine ou sous-domaine que tu contrôles.
Elle ajoute un mot de passe à l’application pour limiter l’accès au serveur IA.

1. Faire pointer un enregistrement DNS **A** de `crypto.exemple.fr` vers l’IPv4 du serveur.
   N’ajouter un enregistrement AAAA que si son accès IPv6 fonctionne.
2. Autoriser TCP 80 et 443 dans le réseau du fournisseur et le pare-feu du serveur.
   UDP 443 est facultatif pour HTTP/3. Garder SSH accessible à ton IP.
   Les services Python et Ollama restent sans port publié.
3. Générer un hash de mot de passe sur le serveur :

```bash
sudo docker run --rm -it caddy:2-alpine caddy hash-password
```

4. Dans `.env`, définir :

```dotenv
SITE_DOMAIN=crypto.exemple.fr
BASIC_AUTH_USER=tracker
BASIC_AUTH_HASH='$2a$REMPLACER_PAR_LE_HASH_COMPLET'
COMPOSE_FILE=compose.yaml:compose.production.yaml
```

Garder les quotes simples autour du hash pour préserver les caractères `$`.
Avec un GPU, utiliser à la place :

```dotenv
COMPOSE_FILE=compose.yaml:compose.gpu.yaml:compose.production.yaml
```

5. Appliquer la configuration :

```bash
sudo docker compose config --quiet
sudo docker compose up -d --build --wait
sudo docker compose logs --tail=50 web
```

Ouvrir **https://crypto.exemple.fr** et saisir l’identifiant/mot de passe dans la fenêtre
du navigateur. Caddy récupère et renouvelle les certificats quand le domaine et les
ports sont accessibles. Compose remplace les ports locaux par les ports HTTPS et
configure automatiquement l’origine `https://crypto.exemple.fr` côté Python.

Ne pas exposer directement 8000 ou 11434. Les règles Docker de publication de ports
peuvent contourner certaines règles UFW ; conserver la configuration fournie et
contrôler aussi les règles réseau du fournisseur.
[HTTPS Caddy](https://caddyserver.com/docs/automatic-https),
[authentification Caddy](https://caddyserver.com/docs/caddyfile/directives/basic_auth).

## 10. Mise à jour, arrêt et retour arrière

Pour reconstruire après une modification du code :

```bash
sudo docker compose up -d --build --wait
```

Pour arrêter et supprimer les conteneurs en conservant les volumes :

```bash
sudo docker compose down
```

Pour relancer sans reconstruire :

```bash
sudo docker compose up -d --wait
```

Ne pas ajouter `-v` à `down` si tu veux conserver les modèles et certificats. Les caches
Python sont en mémoire et se reconstruisent après redémarrage ; aucune base de données
persistante n’est nécessaire au fonctionnement actuel.

Pour un déploiement avec retour arrière, conserver l’ancienne version du code et
construire les images avec un nouveau `IMAGE_TAG` dans `.env`, par exemple `v2`. En cas
de problème, rétablir le code/configuration précédents et leur `IMAGE_TAG`, puis utiliser
`sudo docker compose up -d --no-build --wait`. Ne pas supprimer les anciennes images
avant d’avoir vérifié la nouvelle version. Garder `.env` et les accès SSH en lieu sûr.

## 11. Dépannage

- **Docker absent** : effectuer l’installation administrateur de la section 3.
- **Permission denied sur docker.sock** : utiliser `sudo docker ...`.
- **Port 8080 occupé** : modifier `WEB_PORT` et les origines dans `.env`.
- **Ollama indisponible** : consulter `sudo docker compose logs ollama api`, puis vérifier
  `sudo docker compose exec ollama ollama list` et relancer `ollama-init` si nécessaire.
- **WebSocket refusé / prix figés** : vérifier que l’URL exacte utilisée dans le navigateur
  figure dans `ALLOWED_ORIGINS`, puis recréer l’API avec `sudo docker compose up -d api`.
- **GPU non détecté** : vérifier le pilote hôte, NVIDIA Container Toolkit et la présence
  de `compose.gpu.yaml` dans `COMPOSE_FILE`.
- **502 au proxy** : vérifier la santé et les logs d’`api` ; Caddy vise `api:8000`.
- **Erreur `!override`** : mettre à jour Docker Compose, minimum 2.24.4 pour ce guide.
- **Certificat HTTPS impossible** : vérifier DNS, ports publics 80/443 et logs `web`.

## État de validation

Les contrôles effectués et leurs limites sont consignés dans `docker/VALIDATION.md`.
Les commandes d’installation système, de construction Docker et de publication doivent
être exécutées sur un hôte disposant des droits Docker. La création d’une VM et sa
publication demandent un compte et un serveur fournis par l’utilisateur.
