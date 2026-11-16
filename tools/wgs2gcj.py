#!/usr/bin/env python3
"""把 qr-gps 输出转换为高德 GCJ-02 坐标，并生成 data.js 可用的桩位条目。

用法：
    python3 tools/wgs2gcj.py /tmp/piles.json [--start 1]

输入：qr-gps.swift 输出的 JSON 数组（含 file / lat / lon / codes）。
输出：JSON 数组，字段与 assets/data.js 中的 pile 条目一致，按文件名顺序编号。
"""

import argparse
import json
import math
import re
import sys


def _transform_lat(x, y):
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lng(x, y):
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


def wgs2gcj(lat, lng):
    """WGS-84 → GCJ-02（高德坐标），返回 7 位小数。"""
    a = 6378245.0
    ee = 0.00669342162296594323
    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * math.pi
    magic = math.sin(radlat)
    magic = 1 - ee * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180.0) / (a / sqrtmagic * math.cos(radlat) * math.pi)
    return round(lat + dlat, 7), round(lng + dlng, 7)


def file_order(name):
    match = re.search(r"(\d+)", name)
    return (int(match.group(1)) if match else 0, name)


def code_from_payload(payload):
    match = re.search(r"[?&]id=([A-Z0-9]+)", payload)
    if not match:
        raise ValueError(f"无法从二维码内容中解析桩码：{payload}")
    return match.group(1)


def main():
    parser = argparse.ArgumentParser(description="WGS-84 → GCJ-02，生成桩位条目")
    parser.add_argument("input", help="qr-gps.swift 输出的 JSON 文件")
    parser.add_argument("--start", type=int, default=1, help="起始桩号，默认 1")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as fh:
        photos = json.load(fh)

    usable = []
    for photo in photos:
        if not photo.get("codes"):
            print(f"跳过（未识别到二维码）：{photo.get('file')}", file=sys.stderr)
            continue
        if photo.get("lat") is None or photo.get("lon") is None:
            print(f"跳过（没有 GPS）：{photo.get('file')}", file=sys.stderr)
            continue
        usable.append(photo)

    usable.sort(key=lambda item: file_order(item["file"]))

    piles = []
    for index, photo in enumerate(usable, start=args.start):
        code = code_from_payload(photo["codes"][0])
        wgs_lat = round(float(photo["lat"]), 7)
        wgs_lng = round(float(photo["lon"]), 7)
        lat, lng = wgs2gcj(wgs_lat, wgs_lng)
        piles.append({
            "id": code.lower(),
            "label": f"{index}号桩",
            "code": code,
            "power": 1200,
            "totalPorts": 12,
            "lat": lat,
            "lng": lng,
            "wgsLat": wgs_lat,
            "wgsLng": wgs_lng,
            "slots": None,
            "snapshotPorts": None,
        })

    if not piles:
        print("没有可用的照片", file=sys.stderr)
        return 1

    center_lat = round(sum(p["lat"] for p in piles) / len(piles), 7)
    center_lng = round(sum(p["lng"] for p in piles) / len(piles), 7)
    print(f"共 {len(piles)} 台桩，中心坐标 {center_lat}, {center_lng}", file=sys.stderr)
    json.dump(piles, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
