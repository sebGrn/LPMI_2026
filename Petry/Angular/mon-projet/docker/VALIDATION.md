# Contrôles de la configuration Docker

Vérification effectuée le 20 octobre 2026.

## Vérifié dans cet environnement

- Le build de production Angular réussit avec `npm run build`.
- Docker Compose 5.6.0 valide les configurations locale, NVIDIA, HTTPS et NVIDIA+HTTPS
  avec `config`. Ces validations ne nécessitent pas de daemon Docker.
- La fusion de production publie uniquement 80/TCP et 443/TCP+UDP, remplace le port
  local 8080, définit l’origine HTTPS attendue et monte le bon fichier Caddy.
- L’API et Ollama n’ont aucun port hôte publié dans ces configurations.
- Caddy 2.11.7 valide les configurations locale et HTTPS. Pour cette vérification hors
  conteneur, seul le chemin d’import `/etc/caddy/routes.caddy` est remplacé par un
  chemin temporaire contenant une copie identique du fichier.
- Les manifestes du registre Docker confirment des images Linux AMD64 et ARM64 pour
  Node `24-bookworm-slim`, Python `3.13-slim-bookworm`, Caddy `2-alpine` et
  Ollama `0.40.6`.
- `bash -n scripts/install-docker-linux.sh` réussit.
- Les 28 tests Python passent après adaptation du message de diagnostic Ollama aux
  installations locales et Docker.
- Un test d’intégration hors conteneur utilise les mêmes règles Caddy, avec seulement
  les chemins de fichiers et l’adresse du service remplacés par leurs équivalents
  locaux. Il vérifie : frontend compilé, fallback Angular, fichiers JavaScript,
  santé de l’API, cours réels, historique Coinbase, WebSocket, conservation du contrôle
  des origines et réponse réelle d’Ollama via le proxy.

## Non exécuté ici

Docker Engine n’est pas installé, aucun socket Docker n’est disponible et `sudo`
requiert un mot de passe administrateur. Les commandes d’installation système n’ont
pas été exécutées. Les images n’ont donc pas été construites avec Docker et les
conteneurs n’ont pas été démarrés dans cet environnement.

Aucune VM distante, règle réseau publique, configuration DNS ou émission de certificat
n’a été créée. La configuration HTTPS a été validée syntaxiquement ; son activation
nécessite un domaine réel et un serveur dont les ports sont accessibles.

Les commandes pour effectuer ces opérations et les contrôles après démarrage figurent
dans `DEPLOYMENT.md`. Une validation de configuration ne constitue pas une validation
de démarrage des images ni une garantie de disponibilité du fournisseur gratuit.
