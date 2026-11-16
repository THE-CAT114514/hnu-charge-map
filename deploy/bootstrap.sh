#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi

apt-get update
apt-get install -y python3 caddy rsync ufw curl openssl

if ! id -u hnu >/dev/null 2>&1; then
  useradd --system --home /opt/hnu-charge-map --shell /usr/sbin/nologin hnu
fi

mkdir -p /opt/hnu-charge-map /etc/hnu-charge-map
chown -R hnu:hnu /opt/hnu-charge-map
chmod 700 /etc/hnu-charge-map

install -m 644 /opt/hnu-charge-map/deploy/hnu-charge-map.service /etc/systemd/system/hnu-charge-map.service
systemctl daemon-reload
systemctl enable hnu-charge-map
systemctl restart hnu-charge-map

systemctl stop caddy 2>/dev/null || true

if [ ! -f /etc/caddy/hnu.crt ]; then
  bash /opt/hnu-charge-map/deploy/setup-tls.sh || true
fi

if [ -f /etc/caddy/Caddyfile ]; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.dist 2>/dev/null || true
fi
install -m 644 /opt/hnu-charge-map/deploy/Caddyfile.temp /etc/caddy/Caddyfile

echo "bootstrap done"
echo "next: edit /etc/caddy/Caddyfile and replace REPLACE_WITH_BCRYPT_HASH"
echo "next: sudo bash /opt/hnu-charge-map/deploy/update-token.sh"
echo "next: sudo systemctl restart caddy"
