#!/usr/bin/env bash
# Rebuild rápido de um serviço da VPS, pra rodar pelo celular sem colar comando
# gigante. Uso (dentro de ~/trackr):
#   bash deploy-vps.sh transcritor    # ou: rastreador
# Atalho: se não passar nada, faz o transcritor.
set -e
cd "$(dirname "$0")"
svc="${1:-transcritor}"
echo ">> atualizando código..."
git pull
echo ">> rebuildando vps-$svc..."
cd "vps-$svc"
docker compose up -d --build
echo ">> pronto."
