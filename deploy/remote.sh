#!/usr/bin/env bash
# Runs on the VM (deploy/deploy.sh calls it): builds and (re)starts the stack, waits until it is healthy.
# Secrets live in ~/gmr.env, outside the code directory, so every deploy can replace ~/gmr entirely.
set -euo pipefail
cd "$(dirname "$0")/.."

domain="${1:?usage: remote.sh <domain>}"
env_file="$HOME/gmr.env"

if [ ! -f "$env_file" ]; then
  (
    umask 077
    {
      echo "DOMAIN=$domain"
      echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
      echo "UPLOAD_SIGNING_SECRET=$(openssl rand -hex 32)"
    } >"$env_file"
  )
  echo "created $env_file"
fi
sed -i "s/^DOMAIN=.*/DOMAIN=$domain/" "$env_file"

compose=(docker compose -f deploy/compose.yml --env-file "$env_file")
"${compose[@]}" up -d --build --remove-orphans

echo "waiting for the server and web to become healthy..."
for _ in $(seq 1 60); do
  server="$(docker inspect -f '{{.State.Health.Status}}' gmr-server-1 2>/dev/null || echo missing)"
  web="$(docker inspect -f '{{.State.Health.Status}}' gmr-web-1 2>/dev/null || echo missing)"
  if [ "$server" = healthy ] && [ "$web" = healthy ]; then break; fi
  sleep 3
done
"${compose[@]}" ps
if [ "$server" != healthy ] || [ "$web" != healthy ]; then
  echo "NOT HEALTHY (server=$server, web=$web). Last server logs:"
  "${compose[@]}" logs --tail 60 server
  exit 1
fi

docker image prune -f >/dev/null
echo "deployed: https://$domain  (server: https://api.$domain/health)"
