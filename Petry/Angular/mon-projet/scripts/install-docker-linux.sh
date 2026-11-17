#!/usr/bin/env bash
# Installation from Docker's official Debian/Ubuntu repository. Run with sudo.
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  echo 'Exécuter : sudo bash scripts/install-docker-linux.sh' >&2
  exit 1
fi
. /etc/os-release
case "$ID" in
  debian|ubuntu) docker_distribution="$ID" ;;
  *) echo 'Script prévu pour Debian ou Ubuntu. Consulter docs.docker.com/engine/install.' >&2; exit 1 ;;
esac
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo 'Docker et Compose sont déjà installés.'
  docker version
  exit 0
fi
apt-get update
apt-get install -y ca-certificates curl
install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location \
  "https://download.docker.com/linux/$docker_distribution/gpg" \
  --output /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<SOURCES
Types: deb
URIs: https://download.docker.com/linux/$docker_distribution
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
SOURCES
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
docker info
