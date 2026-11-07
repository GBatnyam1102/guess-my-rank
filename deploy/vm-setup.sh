#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 VM (Oracle Cloud Always Free). Safe to run again.
# Installs Docker Engine + Compose from Docker's apt repository, opens 80/443, adds swap on small VMs.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Oracle's Ubuntu images ship iptables rules that reject everything except SSH.
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
  # shellcheck disable=SC2086
  sudo iptables -C INPUT $rule -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT $rule -m state --state NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save; fi

# The 1 GB micro shape needs swap to build the images.
mem_mb="$(free -m | awk '/^Mem:/{print $2}')"
if [ "$mem_mb" -lt 3000 ] && [ -z "$(swapon --show)" ]; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "VM ready: $(docker --version), $(docker compose version), RAM ${mem_mb} MB, arch $(uname -m)"
