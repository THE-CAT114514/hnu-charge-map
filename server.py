#!/usr/bin/env python3
"""Local server for the HNU charge map: static files plus a cached scan-code proxy."""

import argparse
import base64
import json
import os
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
API_URL = "https://union.zhumanggroup.com/api/rent/scan-code"
TOKEN = os.environ.get("ZHUMANG_TOKEN", "").strip()
CACHE_TTL = 60
FORCE_COOLDOWN = 30
TZ = timezone(timedelta(hours=8))

DEVICES = [
    {"id": "xua10001", "code": "XUA10001", "label": "1号桩", "power": 1200, "station": "first-field"},
    {"id": "xua10002", "code": "XUA10002", "label": "2号桩", "power": 1200, "station": "first-field"},
    {"id": "xua10003", "code": "XUA10003", "label": "3号桩", "power": 1200, "station": "first-field"},
    {"id": "xua10004", "code": "XUA10004", "label": "4号桩", "power": 1200, "station": "first-field"},
    {"id": "xua10005", "code": "XUA10005", "label": "1号桩", "power": 1200, "station": "second-field-west"},
    {"id": "xua10006", "code": "XUA10006", "label": "2号桩", "power": 1200, "station": "second-field-west"},
    {"id": "xua10007", "code": "XUA10007", "label": "3号桩", "power": 1200, "station": "second-field-west"},
    {"id": "xua10008", "code": "XUA10008", "label": "4号桩", "power": 1200, "station": "second-field-west"},
    {"id": "xua10009", "code": "XUA10009", "label": "1号桩", "power": 1200, "station": "gym-east"},
    {"id": "xua10010", "code": "XUA10010", "label": "2号桩", "power": 1200, "station": "gym-east"},
    {"id": "xua10011", "code": "XUA10011", "label": "3号桩", "power": 1200, "station": "gym-east"},
    {"id": "xua10012", "code": "XUA10012", "label": "4号桩", "power": 1200, "station": "gym-east"},
]

STATIONS = [
    {"id": "first-field", "name": "第一运动场（1期）", "lat": 30.00025, "lng": 120.0},
    {"id": "second-field-west", "name": "第二田径场（西侧）", "lat": 30.0018, "lng": 119.999},
    {"id": "gym-east", "name": "体育馆（东侧）", "lat": 30.0009, "lng": 120.0011},
]

CACHE_LOCK = threading.Lock()
CACHE = {"at": 0.0, "payload": None}
FORCE_LOCK = threading.Lock()
LAST_FORCE = 0.0


class ApiError(Exception):
    pass


class TokenExpired(ApiError):
    pass


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


def token_expiry():
    if not TOKEN:
        return None
    try:
        payload = TOKEN.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
        return datetime.fromtimestamp(int(data["exp"]), tz=TZ).isoformat(timespec="seconds")
    except (IndexError, ValueError, KeyError, TypeError):
        return None


def token_is_expired():
    expiry = token_expiry()
    if not expiry:
        return False
    return datetime.fromisoformat(expiry) <= datetime.now(TZ)


def api_headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "sd-env": "PROD",
        "xweb_xhr": "1",
        "sd-version": "1.18.0",
        "zm-origin": "1",
        "app-source": "jd",
        "Accept": "*/*",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 "
            "MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Mac "
            "MacWechat/WMPF MacWechat/3.8.7(0x13080712) UnifiedPCMacWechat(0xf2641f50) "
            "XWEB/25755"
        ),
        "Referer": "https://servicewechat.com/wxc73fedf63187e001/128/page-frame.html",
    }


def fetch_pile(device):
    body = json.dumps({"out_number": device["code"]}, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(API_URL, data=body, headers=api_headers(), method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise TokenExpired("接口返回 401，token 已失效")
        raise ApiError(f"{device['code']} HTTP {error.code}")
    except (urllib.error.URLError, TimeoutError) as error:
        raise ApiError(f"{device['code']} 网络错误：{error}")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ApiError(f"{device['code']} 响应不是 JSON：{error}")

    if payload.get("code") != 200:
        message = payload.get("message") or payload.get("msg") or "接口返回失败"
        raise ApiError(f"{device['code']}：{message}")

    data = payload.get("data") or {}
    slots = []
    for slot in data.get("slotsData") or []:
        try:
            slots.append({
                "slotId": int(slot.get("slotId")),
                "status": int(slot.get("status"))
            })
        except (TypeError, ValueError):
            continue

    return {
        "id": device["id"],
        "station": device["station"],
        "label": device["label"],
        "code": device["code"],
        "power": data.get("powerMax") or device["power"],
        "totalPorts": len(slots),
        "slots": slots,
        "shopName": data.get("shopName") or "",
        "equipId": data.get("equipId") or ""
    }


def fetch_status():
    if not TOKEN:
        raise ApiError("missing_token")
    if token_is_expired():
        raise TokenExpired("token 已过期，请重新抓取 Authorization")

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {device["code"]: executor.submit(fetch_pile, device) for device in DEVICES}
        piles = []
        errors = []
        for code, future in futures.items():
            try:
                piles.append(future.result())
            except ApiError as error:
                errors.append(str(error))
            except Exception as error:
                errors.append(f"{code}：{error}")

    if not piles:
        raise ApiError("; ".join(errors) or "没有拿到任何桩的数据")

    by_station = {}
    for pile in piles:
        by_station.setdefault(pile["station"], []).append(pile)

    stations = []
    for meta in STATIONS:
        station_piles = by_station.get(meta["id"])
        if not station_piles:
            continue
        stations.append({
            "id": meta["id"],
            "name": meta["name"],
            "lat": meta["lat"],
            "lng": meta["lng"],
            "piles": station_piles
        })

    return {
        "ok": True,
        "updatedAt": now_iso(),
        "source": "union.zhumanggroup.com/api/rent/scan-code",
        "stale": False,
        "tokenExpiresAt": token_expiry(),
        "stations": stations,
        "errors": errors
    }


def get_status(force=False):
    global LAST_FORCE
    now = time.time()
    if force:
        with FORCE_LOCK:
            if now - LAST_FORCE < FORCE_COOLDOWN:
                force = False
            else:
                LAST_FORCE = now
    with CACHE_LOCK:
        cached = CACHE["payload"]
        cached_at = CACHE["at"]
    if not force and cached and now - cached_at < CACHE_TTL:
        return cached

    try:
        payload = fetch_status()
    except ApiError as error:
        message = str(error)
        with CACHE_LOCK:
            previous = CACHE["payload"]
        if previous:
            stale = dict(previous)
            stale["stale"] = True
            stale["error"] = message
            return stale
        code = "missing_token" if message == "missing_token" else "fetch_failed"
        return {"ok": False, "error": code, "message": message}
    except Exception as error:
        message = f"{type(error).__name__}: {error}"
        with CACHE_LOCK:
            previous = CACHE["payload"]
        if previous:
            stale = dict(previous)
            stale["stale"] = True
            stale["error"] = message
            return stale
        return {"ok": False, "error": "fetch_failed", "message": message}

    with CACHE_LOCK:
        CACHE["at"] = now
        CACHE["payload"] = payload
    return payload


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            force = parse_qs(parsed.query).get("force", ["0"])[0] == "1"
            payload = get_status(force=force)
            if payload.get("ok"):
                status = 200
            elif payload.get("error") == "missing_token":
                status = 503
            else:
                status = 502
            self.send_json(payload, status)
            return
        super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        super().do_HEAD()

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve the HNU charge map and cached status API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"serving http://{args.host}:{args.port}/")
    print("token:", "configured" if TOKEN else "missing (set ZHUMANG_TOKEN)")
    expiry = token_expiry()
    if expiry:
        print("token expires:", expiry)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
