#!/usr/bin/env bash
# Ships the current working tree to the VM and (re)starts the stack. Run from Git Bash or Linux/macOS:
#   DEPLOY_HOST=ubuntu@<vm-ip> DOMAIN=<domain> deploy/deploy.sh            # deploy
#   DEPLOY_HOST=ubuntu@<vm-ip> DOMAIN=<domain> deploy/deploy.sh --setup    # first time: install Docker etc.
# DEPLOY_KEY defaults to ~/.ssh/gmr_oracle.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. ubuntu@1.2.3.4}"
: "${DOMAIN:?set DOMAIN, e.g. example.mn}"
key="${DEPLOY_KEY:-$HOME/.ssh/gmr_oracle}"
ssh_cmd=(ssh -i "$key" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 "$DEPLOY_HOST")

if [ "${1:-}" = "--setup" ]; then
  "${ssh_cmd[@]}" 'bash -s' <deploy/vm-setup.sh
fi

echo "uploading source to $DEPLOY_HOST..."
tar czf - \
  --exclude=node_modules --exclude=.next --exclude=server/data --exclude='*.tsbuildinfo' \
  --exclude=.env --exclude=.git --exclude=.vscode --exclude=coverage --exclude='*.log' \
  . | "${ssh_cmd[@]}" 'rm -rf ~/gmr.new && mkdir -p ~/gmr.new && tar xzf - -C ~/gmr.new && rm -rf ~/gmr && mv ~/gmr.new ~/gmr'

"${ssh_cmd[@]}" "bash ~/gmr/deploy/remote.sh '$DOMAIN'"
