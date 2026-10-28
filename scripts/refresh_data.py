#!/usr/bin/env python3
"""Refresh Yoisaki's bundled Chinese-server master data (Python 3.8+, stdlib only).

Examples:
  python3 scripts/refresh_data.py
  python3 scripts/refresh_data.py --ref f3082761851bc75bf67c5eafdec7576ae95ab3a2
  python3 scripts/refresh_data.py --cache /path/to/downloaded/master

The executable application uses data/master.js directly, so no account, API
credential or npm build is required. This script downloads public metadata only.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import urllib.error
import urllib.request

REPOSITORY = "Sekai-World/sekai-master-db-cn-diff"
TABLE_NAMES = [
    "cards", "cardRarities", "cardEpisodes", "masterLessons", "cardSkillCosts",
    "levels", "areaItems", "areaItemLevels", "characterRanks", "honors",
    "materials", "gameCharacters", "gameCharacterUnits", "unitProfiles",
    "skills", "skillPracticeTickets", "practiceTickets", "musics",
    "musicDifficulties", "musicVocals", "musicArtists", "musicTags",
    "cardSupplies", "cardSupplyGroups", "characterProfiles", "areas",
    "cardMysekaiCanvasBonuses", "mysekaiBlueprintMysekaiCanvasRelations",
    "mysekaiBlueprintMysekaiMaterialCosts", "mysekaiBlueprints",
    "mysekaiFixtures", "mysekaiMaterials", "mysekaiGateLevels",
    "mysekaiGateMaterialGroups", "mysekaiGates",
    "mysekaiFixtureGameCharacterGroupPerformanceBonuses",
    "mysekaiFixtureGameCharacterGroups", "mysekaiFixtureGameCharacterPerformanceBonusLimit",
    "shopItems", "releaseConditions", "compactResourceBoxDetails", "mysekaiBlueprintTerms",
]


def fetch_bytes(url):
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Yoisaki-metadata-updater/1.0"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except (OSError, urllib.error.URLError) as error:
            last = error
            if attempt < 2:
                time.sleep(0.4 * (attempt + 1))
    raise RuntimeError("Could not download %s: %s" % (url, last))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def decode_compact_rows(compact, predicate=None):
    """Decode the upstream column-oriented JSON and its per-column enum indices."""
    if isinstance(compact, list):
        return [row for row in compact if predicate is None or predicate(row)]
    enums = compact.get("__ENUM__", {})
    columns = [key for key in compact if key != "__ENUM__"]
    result = []
    if not columns:
        return result
    for index in range(len(compact[columns[0]])):
        row = {}
        for key in columns:
            value = compact[key][index]
            if key in enums and value is not None:
                value = enums[key][value]
            row[key] = value
        if predicate is None or predicate(row):
            result.append(row)
    return result


def normalized_cost(value):
    """Decode Nuverse [resourceId, resourceType, resourceLevel, quantity]."""
    raw = value.get("cost", value) if isinstance(value, dict) else value
    if isinstance(raw, list):
        return {"resourceId": raw[0], "resourceType": raw[1],
                "resourceLevel": raw[2], "quantity": raw[3]}
    return dict(raw)


def only_keys(row, names):
    return {key: row[key] for key in names if key in row}


def build_bundle(downloaded, meta):
    # All arithmetic inputs are preserved exactly, including float32-derived
    # percentage constants. Irrelevant rendering/reward metadata is discarded.
    tables = dict(downloaded)
    tables["characterRanks"] = [only_keys(row, ["id", "characterId", "characterRank",
        "power1BonusRate", "power2BonusRate", "power3BonusRate"])
        for row in tables["characterRanks"]]
    tables["honors"] = [row for row in tables["honors"]
        if any(level.get("bonus", 0) > 0 for level in row.get("levels", []))]
    tables["mysekaiFixtures"] = [only_keys(row, ["id", "name", "mysekaiFixtureType",
        "assetbundleName", "mysekaiFixtureGameCharacterGroupPerformanceBonusId", "isAssembled"])
        for row in tables["mysekaiFixtures"]]

    # resourceBox IDs are not globally unique across purposes. Filter the
    # resourceBoxPurpose before joining to shopItems; do not infer IDs arithmetically.
    details = decode_compact_rows(tables.pop("compactResourceBoxDetails"),
        lambda row: row.get("resourceBoxPurpose") == "shop_item"
        and row.get("resourceType") == "area_item")
    shops = {row["resourceBoxId"]: row for row in tables["shopItems"]}
    area_costs = []
    for detail in details:
        shop = shops.get(detail["resourceBoxId"])
        if shop is None:
            raise ValueError("Missing shop record for area-item resource box %s" % detail["resourceBoxId"])
        area_costs.append({
            "areaItemId": detail["resourceId"], "level": detail["resourceLevel"],
            "shopItemId": shop["id"], "resourceBoxId": detail["resourceBoxId"],
            "releaseConditionId": shop.get("releaseConditionId", 1),
            "startAt": shop.get("startAt", 0), "endAt": shop.get("endAt"),
            "costs": [normalized_cost(cost) for cost in shop.get("costs", [])],
        })
    tables["areaItemCosts"] = sorted(area_costs, key=lambda row: (row["areaItemId"], row["level"]))

    # Canvas recipes are selected per card, not per rarity. The six blueprints
    # correspond to frame variants. Preserve all recipe choices with exact costs.
    canvas_ids = {row["id"] for row in tables["mysekaiBlueprints"]
                  if row.get("mysekaiCraftType") == "mysekai_canvas"}
    canvas_costs = {}
    for row in tables["mysekaiBlueprintMysekaiMaterialCosts"]:
        if row["mysekaiBlueprintId"] in canvas_ids:
            canvas_costs.setdefault(row["mysekaiBlueprintId"], []).append({
                "resourceType": "mysekai_material", "resourceId": row["mysekaiMaterialId"],
                "quantity": row["quantity"],
            })
    fixtures = {row["id"]: row for row in tables["mysekaiFixtures"]}
    blueprints = {row["id"]: row for row in tables["mysekaiBlueprints"]}
    tables["canvasRecipes"] = [{"blueprintId": ident,
        "name": fixtures.get(blueprints[ident]["craftTargetId"], {}).get("name", "装饰画"),
        "costs": canvas_costs.get(ident, [])} for ident in sorted(canvas_ids)]

    # Preserve the costs and restrictions of additional special furniture.
    # Missing fields in this snapshot must not be manufactured by the client.
    return {"meta": meta, "tables": tables}


def verify(bundle):
    tables = bundle["tables"]
    assert len(tables["gameCharacters"]) == 26, "Unexpected CN character table"
    for card in tables["cards"]:
        values = card["cardParameters"]
        assert all(isinstance(values[key], list) and values[key] for key in ("param1", "param2", "param3"))
        assert len(values["param1"]) == len(values["param2"]) == len(values["param3"])
    area_levels = {(row["areaItemId"], row["level"]) for row in tables["areaItemLevels"]}
    area_costs = {(row["areaItemId"], row["level"]) for row in tables["areaItemCosts"]}
    assert area_levels == area_costs, "Area item level/cost coverage differs"
    for recipe in tables["canvasRecipes"]:
        assert recipe["costs"], "Missing canvas material recipe"
    assert len([r for r in tables["levels"] if r["levelType"] == "card"]) >= 60


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", default=REPOSITORY)
    parser.add_argument("--ref", default="main", help="Git ref or immutable commit SHA")
    parser.add_argument("--cache", type=Path, help="Reuse raw JSON files in this local directory")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    parser.add_argument("--commit-date", default="", help="Known upstream commit date, for offline reproduction")
    parser.add_argument("--version", default="", help="Known upstream master version")
    parser.add_argument("--as-of", default=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat())
    args = parser.parse_args()

    revision, commit_date, message = args.ref, args.commit_date, ""
    if len(revision) != 40 or not all(char in "0123456789abcdef" for char in revision.lower()):
        info = json.loads(fetch_bytes("https://api.github.com/repos/%s/commits/%s" % (args.repository, args.ref)))
        revision = info["sha"]
        commit_date = info["commit"]["committer"]["date"]
        message = info["commit"]["message"]
    master_version = args.version
    if not master_version and message.startswith("master version "):
        master_version = message.split()[2]
    base = "https://raw.githubusercontent.com/%s/%s/" % (args.repository, revision)
    temporary = tempfile.TemporaryDirectory(prefix="yoisaki-cn-master-") if args.cache is None else None
    cache = args.cache if args.cache is not None else Path(temporary.name)
    cache.mkdir(parents=True, exist_ok=True)
    cache_identity = cache / ".yoisaki-source.json"
    requested_source = {"repository": args.repository, "commit": revision}
    if cache_identity.exists() and read_json(cache_identity) != requested_source:
        raise ValueError("This cache belongs to another repository/commit; use an empty cache directory.")
    if not cache_identity.exists():
        cache_identity.write_text(json.dumps(requested_source), encoding="utf-8")
    manifest = {}

    def download(name):
        path = cache / (name + ".json")
        if not path.exists():
            data = fetch_bytes(base + name + ".json")
            path.write_bytes(data)
        else:
            data = path.read_bytes()
        decoded = json.loads(data)
        return name, decoded, {"path": name + ".json", "sha256": hashlib.sha256(data).hexdigest(),
                               "sizeBytes": len(data), "source": base + name + ".json"}

    downloaded = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(download, name) for name in TABLE_NAMES]
        for future in concurrent.futures.as_completed(futures):
            name, table, record = future.result()
            downloaded[name] = table
            manifest[name] = record
            print("Loaded %s" % name, flush=True)

    timestamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    cutoff = int(dt.datetime.combine(dt.date.fromisoformat(args.as_of), dt.time.max,
                                    tzinfo=dt.timezone(dt.timedelta(hours=8))).timestamp() * 1000)
    meta = {
        "schemaVersion": 1, "region": "cn", "language": "zh-CN", "snapshotDate": args.as_of,
        "retrievedAt": timestamp, "repository": args.repository, "commit": revision,
        "sourceUpdatedAt": commit_date, "masterVersion": master_version,
        "sourceUrl": "https://github.com/%s/tree/%s" % (args.repository, revision),
        "assetRoots": ["https://storage.exmeaning.com/sekai-cn-assets/"],
        "releaseCutoff": cutoff,
        "counts": {"cards": len(downloaded["cards"]),
                   "releasedCards": sum(card.get("releaseAt", 0) <= cutoff for card in downloaded["cards"]),
                   "musics": len(downloaded["musics"]),
                   "releasedMusics": sum(music.get("publishedAt", music.get("releasedAt", 0)) <= cutoff
                                         for music in downloaded["musics"]),
                   "musicDifficulties": len(downloaded["musicDifficulties"]), "characters": 26},
        "notice": "国服公开主数据快照；收集日期与上游更新时间分别列出。未来发布条目须按 releaseAt/publishedAt 过滤。",
    }
    bundle = build_bundle(downloaded, meta)
    verify(bundle)
    args.output.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    js = "/* Yoisaki CN master data; provenance: data/SOURCE_MANIFEST.json */\n" + \
         "globalThis.YOISAKI_MASTER=" + serialized + ";\n"
    # Atomic replacement prevents publishing half-written data after cancellation.
    target = args.output / "master.js"
    staged = args.output / "master.js.tmp"
    staged.write_text(js, encoding="utf-8")
    os.replace(str(staged), str(target))
    document = {"meta": meta, "files": {name: manifest[name] for name in sorted(manifest)},
                "bundleSha256": hashlib.sha256(js.encode("utf-8")).hexdigest(),
                "tableCounts": {name: len(value) if isinstance(value, list) else 1
                                for name, value in bundle["tables"].items()}}
    (args.output / "SOURCE_MANIFEST.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote %s (%s bytes)" % (target, len(js.encode("utf-8"))), flush=True)
    print(json.dumps(meta["counts"], ensure_ascii=False), flush=True)
    if temporary is not None:
        temporary.cleanup()


if __name__ == "__main__":
    main()
