#!/usr/bin/env python3
"""Copy the buildless website into dist; Python 3.8+, no dependencies."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)
for child in DIST.iterdir():
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()
for name in ("index.html", ".nojekyll"):
    shutil.copy2(ROOT / name, DIST / name)
for name in ("assets", "data"):
    shutil.copytree(ROOT / name, DIST / name, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("*.part", "*.part.json", "*.tmp", "download-manifest.json"))
print("Static website ready:", DIST)
