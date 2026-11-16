#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi

PUBLIC_IP="${1:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org || true)
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "usage: sudo bash setup-tls.sh <public-ip>" >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout /etc/caddy/hnu.key \
  -out /etc/caddy/hnu.crt \
  -subj "/CN=${PUBLIC_IP}" \
  -addext "subjectAltName=IP:${PUBLIC_IP},IP:127.0.0.1,DNS:localhost"

chown caddy:caddy /etc/caddy/hnu.key /etc/caddy/hnu.crt
chmod 600 /etc/caddy/hnu.key
chmod 644 /etc/caddy/hnu.crt
echo "self-signed certificate written for ${PUBLIC_IP}"
