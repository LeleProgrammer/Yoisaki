#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Download Yoisaki CN media into assets/offline/ (Python 3.8+, stdlib only).

Run from the extracted project: python scripts/download_assets.py --help
Completed files are skipped; interrupted .part files use HTTP Range / If-Range.
Only public media referenced by the bundled CN master data is requested.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass

TYPES = ("cards", "thumbnails", "jackets", "audio", "charts")
DEFAULT_SOURCE = "https://storage.exmeaning.com/sekai-cn-assets"
MAX_BYTES = {"cards": 50 << 20, "thumbnails": 50 << 20,
             "jackets": 50 << 20, "audio": 256 << 20, "charts": 8 << 20}


@dataclass(frozen=True)
class Asset:
    path: str
    kind: str


def read_master(project):
    source = (project / "data" / "master.js").read_text(encoding="utf-8")
    match = re.search(r"(?:globalThis|window)\.YOISAKI_MASTER\s*=\s*", source)
    if not match:
        raise ValueError("data/master.js 不是有效的 Yoisaki 主数据文件。")
    master = json.loads(source[match.end():].strip().rstrip(";").strip())
    if master.get("meta", {}).get("region") != "cn":
        raise ValueError("下载器仅支持本项目的国服 CN 主数据。")
    return master


def parse_ids(value):
    if not value:
        return None
    try:
        values = {int(x.strip()) for x in value.split(",")}
        if not values or min(values) < 1:
            raise ValueError()
        return values
    except ValueError:
        raise argparse.ArgumentTypeError("请填写逗号分隔的正整数 ID，如 1,2,1253。")


def bundle(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("主数据包含无效的资源包名称：%r" % value)
    return value


def plan_assets(master, types=TYPES, card_ids=None, music_ids=None, audio_mode="all", now_ms=None):
    tables = master["tables"]
    now = int(time.time() * 1000) if now_ms is None else now_ms
    cutoff = min(now, master["meta"].get("releaseCutoff", now))
    cards = [c for c in tables["cards"] if c.get("releaseAt", 0) <= cutoff]
    musics = [m for m in tables["musics"]
              if (m.get("publishedAt") or m.get("releasedAt") or 0) <= cutoff
              and (not m.get("endAt") or m["endAt"] > cutoff)]
    for requested, rows, label in ((card_ids, cards, "卡牌"), (music_ids, musics, "歌曲")):
        missing = (requested or set()) - {row["id"] for row in rows}
        if missing:
            raise ValueError("以下%s ID 未在本国服快照中发布：%s" % (label, sorted(missing)))
    cards = [c for c in cards if card_ids is None or c["id"] in card_ids]
    musics = [m for m in musics if music_ids is None or m["id"] in music_ids]
    rarities = {r["cardRarityType"]: r for r in tables["cardRarities"]}
    result = {}

    def add(path, kind):
        result[path] = Asset(path, kind)

    for card in cards:
        name = bundle(card["assetbundleName"])
        states = ["normal"]
        if rarities[card["cardRarityType"]].get("trainingMaxLevel"):
            states.append("after_training")
        for state in states:
            if "cards" in types:
                add("character/member/%s/card_%s.webp" % (name, state), "cards")
            if "thumbnails" in types:
                add("thumbnail/chara/%s_%s.webp" % (name, state), "thumbnails")
    ids = {m["id"] for m in musics}
    if "jackets" in types:
        for music in musics:
            name = bundle(music["assetbundleName"])
            add("music/jacket/%s/%s.webp" % (name, name), "jackets")
    if "audio" in types:
        seen = set()
        for vocal in tables.get("musicVocals", []):
            if vocal["musicId"] not in ids or (audio_mode == "first" and vocal["musicId"] in seen):
                continue
            name = bundle(vocal["assetbundleName"])
            add("music/long/%s/%s.mp3" % (name, name), "audio")
            seen.add(vocal["musicId"])
    if "charts" in types:
        for chart in tables.get("musicDifficulties", []):
            difficulty = chart["musicDifficulty"]
            if chart["musicId"] in ids and difficulty in ("easy", "normal", "hard", "expert", "master", "append"):
                add("music/music_score/%04d_01/%s.txt" % (chart["musicId"], difficulty), "charts")
    return list(result.values())


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(str(temporary), str(path))


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_file(path, asset):
    size = path.stat().st_size
    if size < 16 or size > MAX_BYTES[asset.kind]:
        raise ValueError("文件长度异常：%d bytes" % size)
    with path.open("rb") as handle:
        head = handle.read(64)
        if asset.kind in ("cards", "thumbnails", "jackets"):
            if not (head[:4] == b"RIFF" and head[8:12] == b"WEBP"):
                raise ValueError("响应不是 WebP 图片（可能是镜像错误页）。")
            if int.from_bytes(head[4:8], "little") + 8 != size:
                raise ValueError("WebP 文件长度与文件头不符。")
        elif asset.kind == "audio":
            if not (head.startswith(b"ID3") or (head[0] == 255 and head[1] & 224 == 224)):
                raise ValueError("响应不是 MP3 音频（可能是镜像错误页）。")
        else:
            handle.seek(0)
            text = handle.read().decode("utf-8-sig")
            if "<html" in text.lower() or "#BPM" not in text.upper() or not re.search(r"(?m)^#\d{3}", text):
                raise ValueError("响应不是有效的 SUS 谱面。")


def existing_entry(path, asset, record=None, verify=False):
    try:
        validate_file(path, asset)
        size = path.stat().st_size
        if record and size != record.get("size"):
            return None
        digest = sha256_file(path) if verify or not record else record.get("sha256")
        if verify and record and digest != record.get("sha256"):
            return None
        return {"size": size, "sha256": digest or sha256_file(path)}
    except (OSError, ValueError):
        return None


class Downloader:
    def __init__(self, destination, source, timeout=30, retries=3, stop=None):
        self.destination = Path(destination)
        self.source = source.rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.stop = stop or threading.Event()

    def transfer(self, asset, force=False):
        target = self.destination / asset.path
        part = target.with_name(target.name + ".part")
        sidecar = part.with_name(part.name + ".json")
        target.parent.mkdir(parents=True, exist_ok=True)
        url = self.source + "/" + asset.path
        if force:
            part.unlink(missing_ok=True)
            sidecar.unlink(missing_ok=True)
        error = None
        for attempt in range(self.retries + 1):
            if self.stop.is_set():
                raise InterruptedError("下载已停止；未完成的文件会在下次继续。")
            try:
                self._request(asset, url, part, sidecar)
                validate_file(part, asset)
                entry = {"size": part.stat().st_size, "sha256": sha256_file(part)}
                os.replace(str(part), str(target))
                sidecar.unlink(missing_ok=True)
                return entry
            except InterruptedError:
                raise
            except (OSError, ValueError, urllib.error.URLError, http.client.HTTPException) as exc:
                error = exc
                # A wrong format is never a resumable partial resource.
                if isinstance(exc, ValueError):
                    part.unlink(missing_ok=True)
                    sidecar.unlink(missing_ok=True)
                if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 403, 404, 410):
                    break
                if attempt < self.retries and self.stop.wait(min(2 ** attempt, 8)):
                    raise InterruptedError("下载已停止。")
        raise RuntimeError(str(error))

    def _request(self, asset, url, part, sidecar):
        previous = load_json(sidecar, {})
        offset = part.stat().st_size if part.exists() and previous.get("url") == url else 0
        if not (previous.get("etag") or previous.get("last_modified")):
            offset = 0
        if offset > MAX_BYTES[asset.kind]:
            offset = 0
        # A fully received .part can survive an interruption before its rename.
        if offset and previous.get("total") == offset:
            validate_file(part, asset)
            return
        headers = {"User-Agent": "Yoisaki-Offline-Downloader/1.1", "Accept-Encoding": "identity"}
        if offset:
            headers["Range"] = "bytes=%d-" % offset
            validator = previous.get("etag") or previous.get("last_modified")
            if validator:
                headers["If-Range"] = validator
        request = urllib.request.Request(url, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            exc.close()
            if exc.code == 416:
                # Re-request the complete file, including when a stale partial
                # exceeds the mirror's current version. Never blindly accept it.
                part.unlink(missing_ok=True)
                sidecar.unlink(missing_ok=True)
                raise OSError("服务器拒绝旧断点，下次尝试将从头下载。") from exc
            raise
        with response:
            status = response.getcode()
            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" in content_type or "application/json" in content_type:
                raise ValueError("镜像返回了错误页面：" + content_type)
            total = None
            length = response.headers.get("Content-Length")
            length = int(length) if length is not None else None
            if status == 206:
                match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
                if not match:
                    raise ValueError("服务器返回了无效的 Content-Range。")
                start, end, total = map(int, match.groups())
                if start != offset or end < start or end >= total or (length is not None and length != end - start + 1):
                    raise ValueError("服务器返回的断点范围不匹配。")
                expected = end - start + 1
            elif status == 200:
                # If Range is ignored (or If-Range changed), truncate, not append.
                offset = 0
                total = length
                expected = length
            else:
                raise OSError("非预期的 HTTP 状态：%s" % status)
            if total is not None and total > MAX_BYTES[asset.kind]:
                raise ValueError("资源超出允许的文件大小。")
            metadata = {"url": url, "total": total,
                        "etag": response.headers.get("ETag"),
                        "last_modified": response.headers.get("Last-Modified")}
            # Weak ETags cannot be used as If-Range validators.
            if metadata["etag"] and metadata["etag"].startswith("W/"):
                metadata["etag"] = None
            # Truncate first: interruption must never associate a new ETag with
            # bytes left over from an older representation.
            with part.open("ab" if offset else "wb") as handle:
                atomic_json(sidecar, metadata)
                received = 0
                while True:
                    if self.stop.is_set():
                        raise InterruptedError("下载已停止，已保存当前断点。")
                    chunk = response.read(64 << 10)
                    if not chunk:
                        break
                    handle.write(chunk)
                    received += len(chunk)
                    if offset + received > MAX_BYTES[asset.kind]:
                        raise ValueError("资源超出允许的文件大小。")
                handle.flush()
            if expected is not None and received != expected:
                raise OSError("连接提前结束，已保存断点：%d/%d bytes" % (received, expected))
            if total is not None and offset + received != total:
                raise OSError("服务器仅返回了部分数据，已保存断点。")


def source_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError("请填写没有账号、查询参数或锚点的资源根地址。")
    if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise argparse.ArgumentTypeError("公开镜像必须使用 HTTPS；HTTP 仅允许本机测试。")
    return value.rstrip("/")


def default_project():
    script_directory = Path(__file__).resolve().parent
    for candidate in (script_directory, script_directory.parent, Path.cwd()):
        if (candidate / "data" / "master.js").is_file():
            return candidate
    return Path.cwd()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-root", type=Path, default=default_project(),
                        help="含 index.html 和 data/master.js 的项目根目录")
    parser.add_argument("--types", nargs="+", choices=TYPES, default=list(TYPES), help="下载类别；默认全部")
    parser.add_argument("--card-ids", type=parse_ids, help="仅下载指定卡牌，如 1185,1253；不限制歌曲")
    parser.add_argument("--music-ids", type=parse_ids, help="仅下载指定歌曲，如 1,2；不限制卡牌")
    parser.add_argument("--audio-mode", choices=("all", "first"), default="all", help="全部演唱版本，或每曲仅第一个；默认 all")
    parser.add_argument("--source", type=source_url, default=DEFAULT_SOURCE, help="兼容的国服公开资源镜像根地址")
    parser.add_argument("--workers", type=int, default=4, help="并发下载数，1～16；默认 4")
    parser.add_argument("--timeout", type=float, default=30, help="每次网络读写的超时秒数；默认 30")
    parser.add_argument("--retries", type=int, default=3, help="失败后额外重试次数，0～10；默认 3")
    parser.add_argument("--dry-run", action="store_true", help="仅显示清单数量，不联网、不写文件")
    parser.add_argument("--check", action="store_true", help="仅检查选定资源是否齐全，不联网")
    parser.add_argument("--verify", action="store_true", help="跳过已完成文件前重新核对 SHA-256")
    parser.add_argument("--force", action="store_true", help="重新下载选定资源；成功后才替换原文件")
    args = parser.parse_args(argv)
    if not 1 <= args.workers <= 16 or not 1 <= args.timeout <= 300 or not 0 <= args.retries <= 10:
        parser.error("workers 须为 1～16，timeout 须为 1～300，retries 须为 0～10。")
    if args.force and args.check:
        parser.error("--force 与 --check 不能同时使用。")
    project = args.project_root.resolve()
    try:
        master = read_master(project)
        assets = plan_assets(master, args.types, args.card_ids, args.music_ids, args.audio_mode)
    except (OSError, ValueError, KeyError) as exc:
        parser.error(str(exc))
    destination = project / "assets" / "offline"
    print("Yoisaki CN %s · %s" % (master["meta"]["masterVersion"], master["meta"]["sourceUpdatedAt"][:10]))
    print("下载目录：%s" % destination)
    counts = Counter(asset.kind for asset in assets)
    print("资源清单：%s；共 %d 个文件。" % (", ".join("%s=%d" % (kind, counts[kind]) for kind in TYPES if kind in args.types), len(assets)))
    print("音频默认包含所有演唱版本；全量媒体较大，请先用 --types / ID 筛选试下。")
    if args.dry_run:
        return 0
    state_path = destination / "download-manifest.json"
    state = load_json(state_path, {})
    records = state.get("files", {}) if isinstance(state, dict) else {}
    if not isinstance(records, dict):
        records = {}
    pending, skipped = [], 0
    for asset in assets:
        record = records.get(asset.path)
        entry = existing_entry(destination / asset.path, asset, record if isinstance(record, dict) else None, args.verify)
        if entry and (not args.force or args.check):
            records[asset.path] = entry
            skipped += 1
        else:
            pending.append(asset)
    print("已完成 %d；待下载／修复 %d。" % (skipped, len(pending)))
    if args.check:
        for asset in pending:
            print("MISSING " + asset.path)
        return 1 if pending else 0
    failures = []

    def save():
        atomic_json(state_path, {"schema": "yoisaki-offline-assets", "version": 1,
                                "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                                "masterCommit": master["meta"]["commit"],
                                "source": args.source, "files": records, "failures": failures})

    stop = threading.Event()
    downloader = Downloader(destination, args.source, args.timeout, args.retries, stop)
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=args.workers)
    futures = {executor.submit(downloader.transfer, asset, args.force): asset for asset in pending}
    downloaded, interrupted = 0, False
    last_save = time.monotonic()
    try:
        for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
            asset = futures[future]
            try:
                entry = future.result()
                records[asset.path] = entry
                downloaded += 1
                print("[%d/%d] OK %s (%.2f MiB)" % (done, len(pending), asset.path, entry["size"] / (1 << 20)), flush=True)
            except Exception as exc:
                failures.append({"path": asset.path, "error": str(exc)})
                print("[%d/%d] FAIL %s: %s" % (done, len(pending), asset.path, exc), flush=True)
            if done % 20 == 0 or time.monotonic() - last_save >= 5:
                save()
                last_save = time.monotonic()
    except KeyboardInterrupt:
        interrupted = True
        stop.set()
        for future in futures:
            future.cancel()
        print("\n正在保存断点；等待当前网络读取退出…", flush=True)
    finally:
        executor.shutdown(wait=True)
        save()
    print("完成：新增 %d，跳过 %d，失败 %d。%s" % (downloaded, skipped, len(failures), "本次已中止；再次运行相同命令即可继续。" if interrupted else "下载后请刷新网页。"))
    if failures:
        print("失败清单：%s；再次运行会跳过已完成的文件。" % state_path)
    return 130 if interrupted else (1 if failures else 0)


if __name__ == "__main__":
    sys.exit(main())
