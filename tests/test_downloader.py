"""Network-independent transfer regressions. Run: python -m unittest discover -s tests -p test_downloader.py"""
import contextlib
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import threading
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("yoisaki_download_assets", ROOT / "scripts" / "download_assets.py")
DL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = DL
SPEC.loader.exec_module(DL)
IMAGE = (ROOT / "assets" / "samples" / "res017_no046_normal.webp").read_bytes()
ASSET = DL.Asset("test.webp", "thumbnails")
MASTER = {
    "meta": {"region": "cn", "masterVersion": "test", "sourceUpdatedAt": "2026-01-01", "commit": "fixture", "releaseCutoff": 500},
    "tables": {
        "cardRarities": [{"cardRarityType": "rarity_4", "trainingMaxLevel": 60}, {"cardRarityType": "rarity_1"}],
        "cards": [{"id": 1, "cardRarityType": "rarity_4", "assetbundleName": "test", "releaseAt": 1},
                  {"id": 2, "cardRarityType": "rarity_1", "assetbundleName": "simple", "releaseAt": 1},
                  {"id": 3, "cardRarityType": "rarity_1", "assetbundleName": "future", "releaseAt": 501}],
        "musics": [{"id": 1, "assetbundleName": "jacket_s_001", "publishedAt": 1},
                   {"id": 2, "assetbundleName": "jacket_s_002", "publishedAt": 1, "endAt": 2}],
        "musicDifficulties": [{"musicId": 1, "musicDifficulty": "expert"}],
        "musicVocals": [{"musicId": 1, "assetbundleName": "0001_01"}, {"musicId": 1, "assetbundleName": "0001_02"}],
    },
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        mode = self.path.split("/")[1]
        request_range = self.headers.get("Range")
        self.server.requests.append((mode, request_range, self.headers.get("If-Range")))
        if mode == "missing":
            self.send_error(404)
            return
        if mode == "html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html>mirror error</html>")
            return
        if mode == "retry" and len([r for r in self.server.requests if r[0] == mode]) == 1:
            self.send_error(503)
            return
        if mode == "range416" and request_range:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % len(IMAGE))
            self.end_headers()
            return
        start = int(request_range.split("=")[1].split("-")[0]) if request_range and mode != "ignore" else 0
        if request_range and mode != "ignore":
            self.send_response(206)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start + (1 if mode == "bad-range" else 0), len(IMAGE) - 1, len(IMAGE)))
        else:
            self.send_response(200)
        data = IMAGE[start:]
        self.send_header("Content-Type", "image/webp")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", '"fixture-v1"')
        self.end_headers()
        # Simulate an interrupted first transfer without blocking any test.
        if mode == "truncate" and not request_range:
            self.wfile.write(data[:100])
            self.close_connection = True
        else:
            self.wfile.write(data)


class DownloaderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server.requests = []
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.server.requests.clear()

    def tearDown(self):
        self.temporary.cleanup()

    def downloader(self, mode="range", retries=0):
        root = "http://127.0.0.1:%d/%s" % (self.server.server_port, mode)
        return DL.Downloader(self.directory, root, timeout=2, retries=retries)

    def partial(self, downloader, data=IMAGE[:100], etag='"fixture-v1"', total=len(IMAGE)):
        part = self.directory / "test.webp.part"
        part.write_bytes(data)
        DL.atomic_json(part.with_name(part.name + ".json"), {"url": downloader.source + "/test.webp", "etag": etag, "total": total})
        return part

    def test_selection_filters_release_rarity_and_versions(self):
        assets = DL.plan_assets(MASTER, now_ms=500)
        self.assertEqual(len(assets), 10)
        self.assertFalse(any("future" in a.path or "0002" in a.path for a in assets))
        self.assertEqual(sum(a.kind == "cards" for a in assets), 3)
        first = DL.plan_assets(MASTER, ("audio",), music_ids={1}, audio_mode="first", now_ms=500)
        self.assertEqual([a.path for a in first], ["music/long/0001_01/0001_01.mp3"])

    def test_unknown_and_future_ids_fail(self):
        with self.assertRaises(ValueError):
            DL.plan_assets(MASTER, card_ids={3}, now_ms=500)
        with self.assertRaises(ValueError):
            DL.plan_assets(MASTER, music_ids={999}, now_ms=500)

    def test_master_is_json_not_executed_code(self):
        (self.directory / "data").mkdir()
        path = self.directory / "data/master.js"
        path.write_text("globalThis.YOISAKI_MASTER=" + json.dumps(MASTER) + ";", encoding="utf-8")
        self.assertEqual(DL.read_master(self.directory), MASTER)
        path.write_text("globalThis.YOISAKI_MASTER=alert(1);", encoding="utf-8")
        with self.assertRaises(ValueError):
            DL.read_master(self.directory)

    def test_bundle_rejects_traversal(self):
        for name in ("../private", "/root", "x/y", "x?key=secret"):
            with self.assertRaises(ValueError):
                DL.bundle(name)

    def test_complete_download_and_checksum(self):
        entry = self.downloader().transfer(ASSET)
        self.assertEqual((self.directory / "test.webp").read_bytes(), IMAGE)
        self.assertEqual(entry["sha256"], hashlib.sha256(IMAGE).hexdigest())
        self.assertFalse((self.directory / "test.webp.part").exists())

    def test_http_range_resumes_with_if_range(self):
        downloader = self.downloader()
        self.partial(downloader)
        downloader.transfer(ASSET)
        self.assertEqual(self.server.requests[0][1:], ("bytes=100-", '"fixture-v1"'))
        self.assertEqual((self.directory / "test.webp").read_bytes(), IMAGE)

    def test_no_validator_restarts_safely(self):
        downloader = self.downloader()
        self.partial(downloader, etag=None)
        downloader.transfer(ASSET)
        self.assertIsNone(self.server.requests[0][1])

    def test_ignored_range_truncates_instead_of_appending(self):
        downloader = self.downloader("ignore")
        self.partial(downloader, data=b"old representation" * 10)
        downloader.transfer(ASSET)
        self.assertEqual((self.directory / "test.webp").read_bytes(), IMAGE)

    def test_wrong_content_range_is_rejected(self):
        downloader = self.downloader("bad-range")
        part = self.partial(downloader)
        with self.assertRaises(RuntimeError):
            downloader.transfer(ASSET)
        self.assertFalse(part.exists())
        self.assertFalse((self.directory / "test.webp").exists())

    def test_truncated_connection_preserves_then_resumes(self):
        downloader = self.downloader("truncate")
        with self.assertRaises(RuntimeError):
            downloader.transfer(ASSET)
        self.assertEqual((self.directory / "test.webp.part").stat().st_size, 100)
        downloader.transfer(ASSET)
        self.assertEqual((self.directory / "test.webp").read_bytes(), IMAGE)
        self.assertEqual(self.server.requests[-1][1], "bytes=100-")

    def test_html_error_preserves_previous_completed_file(self):
        target = self.directory / "test.webp"
        target.write_bytes(IMAGE)
        with self.assertRaises(RuntimeError):
            self.downloader("html").transfer(ASSET, force=True)
        self.assertEqual(target.read_bytes(), IMAGE)

    def test_404_is_reported_without_repeated_requests(self):
        with self.assertRaises(RuntimeError):
            self.downloader("missing", retries=3).transfer(ASSET)
        self.assertEqual(len(self.server.requests), 1)

    def test_416_discards_stale_partial_and_retries(self):
        downloader = self.downloader("range416", retries=1)
        self.partial(downloader, data=IMAGE + b"stale", total=len(IMAGE) + 100)
        downloader.transfer(ASSET)
        self.assertEqual(self.server.requests[-1][1], None)
        self.assertEqual((self.directory / "test.webp").read_bytes(), IMAGE)

    def test_transient_server_error_retries(self):
        downloader = self.downloader("retry", retries=1)
        downloader.transfer(ASSET)
        self.assertEqual(len(self.server.requests), 2)

    def test_full_partial_promotes_without_network(self):
        downloader = self.downloader()
        self.partial(downloader, IMAGE)
        downloader.transfer(ASSET)
        self.assertEqual(self.server.requests, [])
        self.assertEqual((self.directory / "test.webp").read_bytes(), IMAGE)

    def test_verify_catches_same_size_corruption(self):
        target = self.directory / "test.webp"
        target.write_bytes(IMAGE)
        record = DL.existing_entry(target, ASSET)
        damaged = bytearray(IMAGE)
        damaged[-1] ^= 1
        target.write_bytes(damaged)
        self.assertIsNone(DL.existing_entry(target, ASSET, record, verify=True))

    def test_stop_preserves_partial(self):
        downloader = self.downloader()
        part = self.partial(downloader)
        downloader.stop.set()
        with self.assertRaises(InterruptedError):
            downloader.transfer(ASSET)
        self.assertEqual(part.read_bytes(), IMAGE[:100])
        self.assertEqual(self.server.requests, [])

    def test_cli_skip_and_check_never_request_completed_files(self):
        (self.directory / "data").mkdir()
        (self.directory / "data/master.js").write_text("globalThis.YOISAKI_MASTER=" + json.dumps(MASTER) + ";", encoding="utf-8")
        args = ["--project-root", str(self.directory), "--types", "thumbnails", "--card-ids", "1", "--source", self.downloader().source]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(DL.main(args), 0)
            with mock.patch.object(DL.urllib.request, "urlopen", side_effect=AssertionError("must remain offline")):
                self.assertEqual(DL.main(args + ["--verify"]), 0)
                self.assertEqual(DL.main(args + ["--check", "--verify"]), 0)
        self.assertEqual(len(self.server.requests), 2)
        manifest = json.loads((self.directory / "assets/offline/download-manifest.json").read_text())
        self.assertEqual(len(manifest["files"]), 2)
        self.assertEqual(manifest["failures"], [])

    def test_dry_run_does_not_network_or_write(self):
        (self.directory / "data").mkdir()
        (self.directory / "data/master.js").write_text("globalThis.YOISAKI_MASTER=" + json.dumps(MASTER), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), mock.patch.object(DL.urllib.request, "urlopen", side_effect=AssertionError("must remain offline")):
            self.assertEqual(DL.main(["--project-root", str(self.directory), "--dry-run"]), 0)
        self.assertFalse((self.directory / "assets").exists())

    def test_standalone_script_detects_project_root(self):
        (self.directory / "data").mkdir()
        (self.directory / "data/master.js").write_text("globalThis.YOISAKI_MASTER=" + json.dumps(MASTER), encoding="utf-8")
        standalone = self.directory / "download_assets.py"
        standalone.write_bytes((ROOT / "scripts/download_assets.py").read_bytes())
        result = subprocess.run([sys.executable, str(standalone), "--dry-run"], cwd=str(ROOT),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.directory / "assets").exists())


if __name__ == "__main__":
    unittest.main()
