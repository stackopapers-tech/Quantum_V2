# (c) Quantum Hub — proprietary hub build. All rights reserved.
"""
Build the JS bundle from the js/ module graph.

    py build_index.py            # writes js/bundle.js + standalone.html
    py build_index.py --check    # build in memory, run assertions, write nothing

index.html stays the CLEAN, readable website markup (the stylesheet link and
the small loader script) — that is what GitHub shows and what GitHub Pages
serves. The loader picks the runtime:

    https / http  -> js/app.js  (real ES modules, the editable sources)
    file://       -> js/bundle.js (this script's output — classic IIFE,
                     because file:// blocks module CORS)

standalone.html is an optional single-file copy (everything inlined) for
sharing or hosting as one file; it carries data-hub-build markers and is
rebuilt idempotently.

Workflow: edit js/ or css/ sources -> py bump_version.py -> py build_index.py
Never hand-edit js/bundle.js or standalone.html (both are generated).

Bundle model — shared scope, strict semantics:
  * Depth-first, post-order walk of the import graph from js/app.js, so the
    evaluation order matches native ESM (dependencies first, circular pairs
    resolve the same way ESM does).
  * import/export lines are stripped; every binding keeps its source name.
  * The WHOLE bundle runs inside one 'use strict' IIFE: same strictness and
    top-level `this === undefined` as real modules.
  * music-deck.js gets its own nested IIFE (it redeclares $ / esc, which
    collide with hub-plus.js in shared scope); it returns initMusicDeck.
  * `</script` escaping is only applied to the standalone inline copy.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
JS_DIR = os.path.join(ROOT, "js")
HTML_PATH = os.path.join(ROOT, "index.html")
CSS_PATH = os.path.join(ROOT, "css", "style.css")
ENTRY = os.path.join(JS_DIR, "app.js")
BUNDLE_PATH = os.path.join(JS_DIR, "bundle.js")
STANDALONE_PATH = os.path.join(ROOT, "standalone.html")

# Files whose top-level names must be isolated (declare $ / esc etc.).
IIFE_FILES = {os.path.join(JS_DIR, "components", "music-deck.js")}
IIFE_EXPORT = {"js/components/music-deck.js": "initMusicDeck"}

# Known-safe duplicate top-level names across files:
#   $, esc     -> music-deck.js is wrapped in its own IIFE
#   ap, vol    -> not declarations at all: they live inside popup HTML
#                template literals (lines ending in `</script>`)
ALLOWED_DUPES = {"$", "esc", "ap", "vol"}


# Optional minifiers for GENERATED output only — the js/ and css/
# sources stay readable for editing. Falls back to identity when
# the minifier is not installed.
def _minify_js(code):
    try:
        import rjsmin
        return rjsmin.jsmin(code)
    except Exception:
        return code


def _minify_css(code):
    try:
        import rcssmin
        return rcssmin.cssmin(code)
    except Exception:
        return code


IMPORT_FROM = re.compile(r'^\s*import\s+(.*?)\s+from\s+[\'"]([^\'"]+)[\'"]\s*;\s*$')
IMPORT_SIDE = re.compile(r'^\s*import\s+[\'"]([^\'"]+)[\'"]\s*;\s*$')
IMPORT_ANY = re.compile(r"^\s*import\b", re.M)
EXPORT_KW = re.compile(r"^(\s*)export\s+(const|let|var|function|class|async\s+function)\b")
EXPORT_DEFAULT = re.compile(r"^\s*export\s+default\s+")
EXPORT_LIST = re.compile(r"^\s*export\s*\{")
EXPORT_STAR = re.compile(r"^\s*export\s*\*")
EXPORT_ANY = re.compile(r"^\s*export\b", re.M)
DECL = re.compile(r"^(?:export\s+)?(?:async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)")

STYLE_MARK = '<style data-hub-build="css">'
SCRIPT_MARK = '<script data-hub-build="js">'
LOADER_RE = re.compile(r'<script data-hub-loader>.*?</script>', re.S)
CSS_LINK = '<link rel="stylesheet" href="css/style.css">'


def read(path):
    with io.open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/")


def import_specs(src, path):
    specs = []
    for n, line in enumerate(src.split("\n"), 1):
        if not IMPORT_ANY.match(line):
            continue
        m = IMPORT_FROM.match(line) or IMPORT_SIDE.match(line)
        if not m:
            raise SystemExit(
                "BUILD FAIL: multi-line or odd import at %s:%d\n  %s\n"
                "(The bundler strips single-line imports only — fold it into one line.)"
                % (rel(path), n, line.strip()))
        specs.append(m.group(m.lastindex))
    return specs


def resolve(path, spec):
    if not spec.startswith("."):
        raise SystemExit("BUILD FAIL: non-relative import %r in %s — it cannot be bundled."
                         % (spec, rel(path)))
    target = os.path.normpath(os.path.join(os.path.dirname(path), spec.split("?", 1)[0]))
    if not os.path.isfile(target):
        raise SystemExit("BUILD FAIL: import %r from %s not found." % (spec, rel(path)))
    return target


def collect(entry):
    """DFS post-order over the import graph (native ESM evaluation order)."""
    order, state = [], {}

    def visit(path):
        st = state.get(path)
        if st == "done":
            return
        if st == "busy":
            return  # circular pair (game-viewer <-> mirror-loader): runtime-only calls
        state[path] = "busy"
        src = read(path)
        for spec in import_specs(src, path):
            visit(resolve(path, spec))
        state[path] = "done"
        order.append(path)

    visit(entry)
    return order


def transform(src, path):
    out = []
    for n, line in enumerate(src.split("\n"), 1):
        if IMPORT_FROM.match(line) or IMPORT_SIDE.match(line):
            continue
        if EXPORT_LIST.match(line) or EXPORT_STAR.match(line):
            raise SystemExit("BUILD FAIL: unsupported export form at %s:%d: %s"
                             % (rel(path), n, line.strip()))
        if EXPORT_DEFAULT.match(line):
            rest = line[EXPORT_DEFAULT.match(line).end():]
            if rest.rstrip().endswith(";") and "{" not in rest:
                continue  # `export default X;` — drop the statement
            out.append(rest)  # multi-line `export default {` -> bare block expr
            continue
        m = EXPORT_KW.match(line)
        if m:
            # drop only the `export ` keyword, keep indent + declaration
            out.append(line[:m.start(1)] + m.group(1) + line[m.start(2):])
            continue
        if EXPORT_ANY.match(line):
            raise SystemExit("BUILD FAIL: unhandled export at %s:%d: %s"
                             % (rel(path), n, line.strip()))
        out.append(line)
    text = "\n".join(out)
    if IMPORT_ANY.search(text) or EXPORT_ANY.search(text):
        bad = [l for l in text.split("\n") if IMPORT_ANY.match(l) or EXPORT_ANY.match(l)]
        raise SystemExit("BUILD FAIL: leftover import/export in %s:\n  %s"
                         % (rel(path), "\n  ".join(bad[:5])))
    if path in IIFE_FILES:
        name = IIFE_EXPORT[rel(path)]
        if ("function " + name) not in text:
            raise SystemExit("BUILD FAIL: %s does not define %s for the IIFE wrap." % (rel(path), name))
        text = ("const %s = (function () {\n'use strict';\n" % name) + text + \
               ("\nreturn %s;\n})();\n" % name)
    return text


def check_dupes(paths):
    owners = {}
    for path in paths:
        for line in read(path).split("\n"):
            m = DECL.match(line)
            if m:
                owners.setdefault(m.group(1), []).append(path)
    bad = []
    for name, where in sorted(owners.items()):
        files = set(where)
        if len(files) > 1 and name not in ALLOWED_DUPES:
            bad.append("  %-24s %s" % (name, ", ".join(rel(p) for p in sorted(files))))
    if bad:
        raise SystemExit(
            "BUILD FAIL: top-level name collisions in shared scope:\n" + "\n".join(bad) +
            "\nFix by renaming, moving into a nested IIFE, or adding to ALLOWED_DUPES.")


def build_body():
    order = collect(ENTRY)
    check_dupes(order)
    parts = []
    for path in order:
        parts.append("\n/* ===== %s ===== */\n" % rel(path))
        parts.append(transform(read(path), path))
    body = "".join(parts)

    if IMPORT_ANY.search(body) or EXPORT_ANY.search(body):
        raise SystemExit("BUILD FAIL: leftover import/export keyword in the bundle")
    if "<!--" in body:
        raise SystemExit("BUILD FAIL: HTML comment open (<!--) inside the bundle")
    if re.search(r"import\.meta", body):
        raise SystemExit("BUILD FAIL: import.meta cannot be bundled")
    if re.search(r"^await\s", body, re.M):
        raise SystemExit("BUILD FAIL: top-level await cannot be bundled (classic IIFE)")
    return body, order


def wrap_strict(body):
    return "(function () {\n'use strict';\n" + body + "\n})();\n"


def inline_block(html, kind, content):
    """Refresh or install an inlined block inside standalone.html."""
    if kind == "css":
        block = STYLE_MARK + "\n" + content + "\n</style>"
        marker_re = re.compile(re.escape(STYLE_MARK) + r".*?</style>", re.S)
        legacy = CSS_LINK
    else:
        block = SCRIPT_MARK + "\n" + content + "\n</script>"
        marker_re = re.compile(re.escape(SCRIPT_MARK) + r".*?</script>", re.S)
        legacy = None
    if marker_re.search(html):
        return marker_re.sub(lambda m: block, html, count=1)
    if kind == "css" and legacy in html:
        return html.replace(legacy, block, 1)
    if kind == "js" and LOADER_RE.search(html):
        return LOADER_RE.sub(lambda m: block, html, count=1)
    raise SystemExit("BUILD FAIL: no marker and no legacy %s block found" % kind)


def check_index(html):
    """index.html must stay the clean source: external css + the loader."""
    problems = []
    if STYLE_MARK in html or SCRIPT_MARK in html:
        problems.append("index.html still contains inlined build blocks (data-hub-build) — restore the link/loader")
    if CSS_LINK not in html:
        problems.append("index.html is missing the external stylesheet link")
    if not LOADER_RE.search(html):
        problems.append("index.html is missing the bootstrap loader script")
    if "js/bundle.js?v=" not in html:
        problems.append("index.html loader does not reference js/bundle.js?v=")
    if "js/app.js?v=" not in html:
        problems.append("index.html loader does not reference js/app.js?v=")
    if problems:
        raise SystemExit("BUILD FAIL:\n  - " + "\n  - ".join(problems))


def main():
    argv = sys.argv[1:]
    check = "--check" in argv
    want_standalone = "--no-standalone" not in argv

    body, order = build_body()
    bundle = _minify_js(wrap_strict(body))

    # --- js/bundle.js: classic script for file:// (no HTML escaping needed) ---
    html_src = read(HTML_PATH)
    check_index(html_src)

    # --- standalone.html: everything inlined, idempotent via markers ---
    standalone = None
    if want_standalone:
        css = read(CSS_PATH)
        for bad in ("</style", "<!--"):
            if bad in css:
                raise SystemExit("BUILD FAIL: %r found in css/style.css" % bad)
        css = _minify_css(css)
        # `</script` must be escaped only in the inline copy
        inline_js = _minify_js(wrap_strict(re.sub(r"</script", r"<\\/script", body, flags=re.I)))
        if re.search(r"</script", inline_js, re.I):
            raise SystemExit("BUILD FAIL: unescaped </script survived inlined copy")
        src = html_src
        if os.path.isfile(STANDALONE_PATH):
            src = read(STANDALONE_PATH)  # refresh in place so edits to it persist
        src = inline_block(src, "css", css)
        src = inline_block(src, "js", inline_js)
        if src.count(STYLE_MARK) != 1 or src.count(SCRIPT_MARK) != 1:
            raise SystemExit("BUILD FAIL: standalone.html marker count wrong")
        standalone = src

    # --- report ---
    print("modules bundled: %d" % len(order))
    for p in order:
        print("  %-46s %8d B" % (rel(p), os.path.getsize(p)))
    print("bundle.js: %8d B%s" % (len(bundle.encode("utf-8")),
                                  "   standalone.html: %8d B" % len(standalone.encode("utf-8"))
                                  if standalone else ""))
    if check:
        print("--check: assertions passed, not written")
        return

    with io.open(BUNDLE_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(bundle)
    print("wrote %s" % rel(BUNDLE_PATH))
    if standalone:
        with io.open(STANDALONE_PATH, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(standalone)
        print("wrote %s" % rel(STANDALONE_PATH))


if __name__ == "__main__":
    main()
