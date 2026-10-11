# (c) Quantum Hub — proprietary hub build. All rights reserved.
"""
Restamp the cache-busting version across index.html, standalone.html and
every ?v= import under js/ (so GitHub Pages and browsers refetch edited
files instead of serving a cached copy).

    py bump_version.py            # use today's date, auto-increment suffix
    py bump_version.py 2026.10.1-1  # set an explicit version
    py bump_version.py --show      # just print the current version
"""

import io
import pathlib
import re
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent
HTML = ROOT / "index.html"
APP = ROOT / "js" / "app.js"

# Matches the stamp across any year in both places it appears.
STAMP = re.compile(r"\d{4}\.\d{2}\.\d{2}-\d+")
# Import query strings in source modules (?v=YYYY.MM.DD-N).
QUERY_STAMP = re.compile(r"(\?v=)\d{4}\.\d{2}\.\d{2}-\d+")

# Full-stamp files (they carry version displays, not just ?v= imports),
# as paths relative to ROOT.
FULL_STAMP_FILES = ("index.html", "standalone.html", "js/app.js")


def read_stamp() -> str | None:
    html = HTML.read_text(encoding="utf-8")
    m = STAMP.search(html)
    return m.group(0) if m else None


def auto_version() -> str:
    today = date.today().strftime("%Y.%m.%d")
    current = read_stamp()
    if current and current.startswith(today):
        try:
            n = int(current.rsplit("-", 1)[1]) + 1
        except ValueError:
            n = 1
    else:
        n = 1
    return f"{today}-{n}"


def main() -> None:
    if "--show" in sys.argv:
        print(read_stamp() or "no stamp found")
        return

    new = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else auto_version()
    if not STAMP.fullmatch(new):
        print(f"Invalid version '{new}'. Expected YYYY.MM.DD-N, e.g. 2026.09.26-1")
        sys.exit(1)

    stamped = 0
    # Full stamps: index.html, standalone.html (when built), js/app.js
    for relpath in FULL_STAMP_FILES:
        path = ROOT / relpath
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        if not STAMP.search(text):
            print(f"WARNING: no version stamp found in {relpath}")
            continue
        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(STAMP.sub(new, text))
        print(f"stamped {relpath} -> {new}")
        stamped += 1

    # Cache-busting ?v= imports in every other source module, so GitHub Pages
    # (which caches by URL) refetches edited files. js/bundle.js is generated
    # and carries no stamps — skip it.
    for path in sorted((ROOT / "js").rglob("*.js")):
        if path == APP or path.name == "bundle.js":
            continue
        text = path.read_text(encoding="utf-8")
        if not QUERY_STAMP.search(text):
            continue
        with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(QUERY_STAMP.sub(r"\g<1>" + new, text))
        print(f"stamped {path.relative_to(ROOT)} ?v= -> {new}")
        stamped += 1

    if not stamped:
        print("WARNING: nothing stamped — is index.html intact?")


if __name__ == "__main__":
    main()
