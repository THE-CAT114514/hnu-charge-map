#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi

read -rsp "Paste ZHUMANG_TOKEN (without Bearer): " token
echo

if [ -z "$token" ]; then
  echo "empty token" >&2
  exit 1
fi

umask 077
printf 'ZHUMANG_TOKEN=%s\n' "$token" > /etc/hnu-charge-map.env
chmod 600 /etc/hnu-charge-map.env

systemctl restart hnu-charge-map
echo "token updated; hnu-charge-map restarted"
