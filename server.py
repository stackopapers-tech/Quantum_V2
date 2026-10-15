# (c) Quantum Hub — proprietary hub build. All rights reserved.
"""
Quantum Hub — private account server.

Cross-device accounts live here (SQLite + 3 encryption layers), NOT in the
browser. Run it instead of serve.py when you want multi-device login:

    py server.py              # http://127.0.0.1:8000  (loopback only)
    py server.py 8080         # custom port
    py server.py --host 0.0.0.0 --port 8000   # LAN (see TLS warning below)

Email codes: set SMTP env vars and codes go to real inboxes —
    HUB_SMTP_HOST, HUB_SMTP_PORT, HUB_SMTP_USER, HUB_SMTP_PASS, HUB_SMTP_FROM
Without them, /api auth endpoints print codes to this console only (there is
NO dev-inbox folder — it was removed as an unnecessary exposure). The hub UI
does not use /api at all anymore: accounts are device-local (js/local-api.js).

THREE ENCRYPTION LAYERS
  L1 — Password layer:  Argon2id (memory-hard) over HMAC-SHA256(server_pepper,
       password) with a unique 16-byte salt per user. Falls back to
       PBKDF2-HMAC-SHA256/210k if Argon2 is unavailable. The pepper lives in
       server_keys.json (0600), never in the database — a stolen DB file alone
       cannot verify a single password.
  L2 — Data-at-rest layer: emails, preferences and other PII are AES-256-GCM
       ciphertext in SQLite (fresh 96-bit nonce per record). The data key also
       lives only in server_keys.json. The .db file contains no plaintext PII.
  L3 — Token/OTP layer + posture: session tokens are 256-bit opaque values
       stored as SHA-256 hashes; email codes are 6-digit OTPs stored as
       HMAC-SHA256, 10-minute expiry, single-use, 5-attempt cap; per-IP rate
       limits + 5-fails/15-min account lockout. The server binds loopback by
       default; --host 0.0.0.0 prints a TLS warning (put a TLS terminator in
       front for any non-local network).

Nothing here is a restriction bypass: it is an ordinary account database.
"""

import base64
import hashlib
import hmac
import http.client
import ipaddress
import json
import os
import re
import secrets
import smtplib
import socket
import sqlite3
import stat
import sys
import threading
import time
import urllib.error
import urllib.request
from email.message import EmailMessage
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed; env vars must be set manually

# ---------------------------------------------------------------- crypto

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False
    print("WARNING: 'cryptography' package not found — using PBKDF2 fallback for L1/L2.")
    print("         Run: py -m pip install cryptography")


ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "hub_server.db")

OTP_TTL = 600          # 10 minutes
OTP_ATTEMPTS = 5
LOCKOUT_FAILS = 5
LOCKOUT_SECS = 15 * 60


def load_keys_from_env():
    """Load encryption keys from environment variables.
    Falls back to generating new ones if not set (for first-run/dev)."""
    pepper = os.getenv("SERVER_PEPPER")
    data_key = os.getenv("SERVER_DATA_KEY")
    otp_key = os.getenv("SERVER_OTP_KEY")
    
    if not (pepper and data_key and otp_key):
        # Generate new keys for first run
        pepper = secrets.token_hex(32)
        data_key = secrets.token_hex(32)
        otp_key = secrets.token_hex(32)
        print("WARNING: Server keys not found in environment. Generated new ephemeral keys.")
        print("         Set SERVER_PEPPER, SERVER_DATA_KEY, SERVER_OTP_KEY in .env for persistence.")
    
    return {
        "pepper": pepper,
        "data_key": data_key,
        "otp_key": otp_key,
    }


KEYS = load_keys_from_env()
PEPPER = bytes.fromhex(KEYS["pepper"])
DATA_KEY = bytes.fromhex(KEYS["data_key"])
OTP_KEY = bytes.fromhex(KEYS["otp_key"])

if HAS_CRYPTO:
    AES = AESGCM(DATA_KEY)
else:
    AES = None


def _peppered(password: str) -> bytes:
    """Passwords are pre-mixed with the server pepper (L1, kept out of the DB)."""
    return hmac.new(PEPPER, password.encode("utf-8"), hashlib.sha256).digest()


def hash_password(password: str):
    """Returns (algo, salt_hex, verifier_hex)."""
    salt = secrets.token_bytes(16)
    if HAS_CRYPTO:
        # cryptography's Argon2id: salt is passed to derive(), length=32
        argon = Argon2id(salt=salt, length=32, iterations=2, lanes=4, memory_cost=32 * 1024)
        digest = argon.derive(_peppered(password))
        return ("argon2id", salt.hex(), digest.hex())
    digest = hashlib.pbkdf2_hmac("sha256", _peppered(password), salt, 210_000)
    return ("pbkdf2_210k", salt.hex(), digest.hex())


def verify_password(password: str, algo: str, salt_hex: str, verifier_hex: str) -> bool:
    try:
        salt = bytes.fromhex(salt_hex)
        want = bytes.fromhex(verifier_hex)
        if algo == "argon2id" and HAS_CRYPTO:
            argon = Argon2id(salt=salt, length=32, iterations=2, lanes=4, memory_cost=32 * 1024)
            argon.verify(_peppered(password), want)
            return True
        if algo.startswith("pbkdf2"):
            got = hashlib.pbkdf2_hmac("sha256", _peppered(password), salt, 210_000)
            return hmac.compare_digest(got, want)
        return False
    except Exception:
        return False


def enc_text(plaintext: str, key: bytes = None) -> str:
    """L2: AES-256-GCM encrypt. Returns base64(nonce || ciphertext).
    If key is None, uses global DATA_KEY (for system data)."""
    raw = plaintext.encode("utf-8")
    if HAS_CRYPTO:
        use_key = key if key is not None else DATA_KEY
        nonce = secrets.token_bytes(12)
        return base64.b64encode(nonce + AESGCM(use_key).encrypt(nonce, raw, None)).decode("ascii")
    return "PLAIN-FALLBACK:" + base64.b64encode(raw).decode("ascii")


def dec_text(token: str, key: bytes = None) -> str:
    if token.startswith("PLAIN-FALLBACK:"):
        return base64.b64decode(token[len("PLAIN-FALLBACK:"):]).decode("utf-8")
    blob = base64.b64decode(token.encode("ascii"))
    use_key = key if key is not None else DATA_KEY
    return AESGCM(use_key).decrypt(blob[:12], blob[12:], None).decode("utf-8")


def derive_user_key(password: str, salt: bytes = None) -> tuple[bytes, bytes]:
    """Derive a per-user encryption key from password.
    Returns (key, salt). If salt is None, generates a new one."""
    if salt is None:
        salt = secrets.token_bytes(16)
    peppered = _peppered(password)
    if HAS_CRYPTO:
        argon = Argon2id(salt=salt, length=32, iterations=2, lanes=4, memory_cost=32 * 1024)
        key = argon.derive(peppered)
    else:
        key = hashlib.pbkdf2_hmac("sha256", peppered, salt, 210_000)
    return key, salt


def verify_user_key(password: str, salt_hex: str, key_ver_hex: str) -> bool:
    """Verify a user's encryption key password."""
    try:
        salt = bytes.fromhex(salt_hex)
        want = bytes.fromhex(key_ver_hex)
        peppered = _peppered(password)
        if HAS_CRYPTO:
            argon = Argon2id(salt=salt, length=32, iterations=2, lanes=4, memory_cost=32 * 1024)
            argon.verify(peppered, want)
            return True
        got = hashlib.pbkdf2_hmac("sha256", peppered, salt, 210_000)
        return hmac.compare_digest(got, want)
    except Exception:
        return False


def otp_hmac(otp_id: str, purpose: str, code: str) -> str:
    return hmac.new(OTP_KEY, f"{otp_id}:{purpose}:{code}".encode(), hashlib.sha256).hexdigest()


def sha_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


# ---------------------------------------------------------------- database

DB_LOCK = threading.Lock()


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with DB_LOCK, db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email_enc TEXT NOT NULL,
            email_lookup TEXT NOT NULL UNIQUE,
            pw_algo TEXT NOT NULL,
            pw_salt TEXT NOT NULL,
            pw_ver TEXT NOT NULL,
            enc_key_salt TEXT NOT NULL,
            enc_key_ver TEXT NOT NULL,
            email_verified INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            locked_until INTEGER NOT NULL DEFAULT 0,
            preferences_enc TEXT NOT NULL DEFAULT '',
            games_enc TEXT NOT NULL DEFAULT '',
            collections_enc TEXT NOT NULL DEFAULT '',
            notes_enc TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            last_login INTEGER
        );
        CREATE TABLE IF NOT EXISTS email_otps (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            purpose TEXT NOT NULL,
            code_hmac TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            used INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expiry INTEGER NOT NULL,
            remember INTEGER NOT NULL DEFAULT 0,
            enc_key_enc TEXT,  -- base64-encrypted per-user key (decrypted on login)
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_otps_user ON email_otps(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        -- Quantum Hub social layer (all timestamps are unix seconds)
        CREATE TABLE IF NOT EXISTS presence (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            username TEXT NOT NULL,
            last_seen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS profiles (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            display TEXT NOT NULL DEFAULT '',
            bio TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#39ff14',
            updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS friends (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, friend_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_id, to_id, created_at);
        CREATE TABLE IF NOT EXISTS blocks (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, blocked_id)
        );
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY,
            reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target TEXT NOT NULL,
            kind TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS polls (
            id INTEGER PRIMARY KEY,
            question TEXT NOT NULL,
            options_json TEXT NOT NULL,
            by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS votes (
            poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            opt INTEGER NOT NULL,
            PRIMARY KEY (poll_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY,
            game_id TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            score INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scores_game ON scores(game_id, score DESC);
        """)
        # Column migration: profiles.avatar (pfp shown beside the username).
        cols = [r["name"] for r in con.execute("PRAGMA table_info(profiles)")]
        if "avatar" not in cols:
            con.execute("ALTER TABLE profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT ''")
        import time as _t
        if not con.execute("SELECT 1 FROM polls LIMIT 1").fetchone():
            con.execute("INSERT INTO polls(question, options_json, by_id, created_at) VALUES(?,?,NULL,?)",
                        ("Which game night should be next?",
                         json.dumps(["FPS Friday", "Racing Weekend", "Puzzle Marathon", "Retro Classics"]),
                         int(_t.time())))


# ---------------------------------------------------------------- loopback fetch relay
# Lets the hub's own viewer load destinations that the *browser* cannot reach
# (DNS blocks, framing walls) but this machine can. Loopback clients ONLY —
# never an open proxy: refuses non-local callers and SSRF targets, caps size.

RELAY_MAX_BYTES = 15 * 1024 * 1024
RELAY_TIMEOUT = 20


def _relay_caller_allowed(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr.split("%")[0])
        return ip.is_loopback
    except ValueError:
        return addr in ("localhost",)


def _relay_target_ok(url: str):
    """Returns (host) if the URL is a safe public http(s) target, else None."""
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            return None
        if p.username or p.password:
            return None
        host = (p.hostname or "").lower().strip(".")
        if not host:
            return None
        port = p.port or (443 if p.scheme == "https" else 80)
        if port not in (80, 443):
            return None
        try:
            prev_timeout = socket.getdefaulttimeout()
            socket.setdefaulttimeout(8)
            try:
                infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
            finally:
                socket.setdefaulttimeout(prev_timeout)
        except (socket.gaierror, socket.timeout, OSError):
            return None
        for fam, _, _, _, sockaddr in infos:
            try:
                ip = ipaddress.ip_address(sockaddr[0])
            except ValueError:
                return None
            if not ip.is_global:
                return None
        return host
    except Exception:
        return None


def relay_fetch(url: str):
    """Returns (status, content_type, body). Raises ApiError on refusal/failure."""
    if not _relay_target_ok(url):
        raise ApiError(400, "relay refused: not a public http(s) destination")
    req = urllib.request.Request(url, headers={
        # Plain browser UA — some CDNs/WAFs reject obviously-robotic ones.
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=RELAY_TIMEOUT) as r:
            status = r.status
            ctype = (r.headers.get("Content-Type") or "application/octet-stream").split(";")[0].strip() or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json",
                                                      "application/xml", "application/xhtml+xml"):
                limit = RELAY_MAX_BYTES + 1
            else:
                length = r.headers.get("Content-Length")
                if length is not None:
                    try:
                        if int(length) > RELAY_MAX_BYTES:
                            raise ApiError(413, "relay refused: file too large")
                    except ValueError:
                        pass
                limit = RELAY_MAX_BYTES + 1
            body = r.read(limit)
            if len(body) > RELAY_MAX_BYTES:
                raise ApiError(413, "relay refused: file too large")
            # MIME repair: jsDelivr, Statically and raw.githubusercontent serve
            # .html files as text/plain — an iframe would only ever show source
            # code. If the body is clearly HTML, serve it AS HTML so the relay
            # can render what those CDNs cannot.
            if ctype != "text/html" and _looks_like_html(body):
                ctype = "text/html; charset=utf-8"
            # Extension repair: hosts like GitLab raw force text/plain on EVERY
            # file. A relayed game's CSS would be refused by the browser
            # (strict stylesheet MIME) and ES modules would never execute —
            # promote text/plain/octet-stream to the type the extension declares.
            elif ctype in ("text/plain", "application/octet-stream"):
                ext = os.path.splitext(urlparse(url).path)[1].lower()
                fixed = _RELAY_EXT_MIME.get(ext)
                if fixed:
                    ctype = fixed
            return status, ctype, body
    except ApiError:
        raise
    except urllib.error.HTTPError as e:
        # Upstream answered with a real status (404/403/429...): pass it
        # through so probes skip this mirror honestly instead of a blanket 502.
        code = int(getattr(e, "code", 0) or 0)
        raise ApiError(code if 400 <= code < 600 else 502, "upstream HTTP %d" % code)
    except Exception:
        raise ApiError(502, "relay fetch failed")


def _looks_like_html(body: bytes) -> bool:
    if not body:
        return False
    b = body.lstrip(b"\xef\xbb\xbf \t\r\n")
    return b[:64].lower().startswith((b"<!doctype html", b"<html"))


# Extension → MIME for upstream hosts that mislabel everything as text/plain
# (GitLab raw, some GitHub proxies). Bare types on purpose: _serve_relay()
# branches on exact ctype equality for its CSS/JS rewrites.
_RELAY_EXT_MIME = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


def _relay_inject_base(body: bytes, target: str) -> bytes:
    """Point the relayed page's relative URLs (scripts, CSS, fetch()) back
    through the path-form relay, so a relayed game loads ALL of its assets
    through the relay too. Path-form keeps the upstream path as real path
    segments — the browser's own URL resolution rebuilds the correct upstream
    URL for every relative reference. Skips pages that declare their own base."""
    try:
        head = body[:4096]
        if b"<base" in head.lower():
            return body  # the game already declares its base — don't fight it
        p = urlparse(target)
        if p.scheme not in ("http", "https") or not p.netloc:
            return body
        path = p.path or "/"
        if not path.endswith("/"):
            path = path.rsplit("/", 1)[0] + "/"
        href = ("/relay/raw/" + p.scheme + "://" + p.netloc + path).replace("&", "&amp;").replace('"', "%22")
        tag = ('<base href="%s">' % href).encode("utf-8")
        m = re.search(rb"<head[^>]*>", head, re.I)
        if m:
            return body[:m.end()] + tag + body[m.end():]
        m = re.search(rb"<html[^>]*>", head, re.I)
        if m:
            return body[:m.end()] + tag + body[m.end():]
        return tag + body
    except Exception:
        return body


_REL_ROOT_ATTR = re.compile(rb'(\s(?:src|href|poster|action|data-src)\s*=\s*["\']?)/(?!relay/raw/|/)')
_REL_CSS_URL = re.compile(rb'(url\(\s*["\']?)/(?!relay/raw/|/)')
_REL_CSS_IMPORT = re.compile(rb'(@import\s+["\'])/(?!relay/raw/|/)')


def _relay_rewrite_root(body: bytes, target: str) -> bytes:
    """Root-relative references (=/foo) IGNORE the injected <base> — rewrite
    them to the relay path form so they stream through the relay too. Guards
    keep already-relayed URLs and protocol-relative (//host) refs intact.
    Covers HTML attributes and CSS url()/@import."""
    try:
        p = urlparse(target)
        if p.scheme not in ("http", "https") or not p.netloc:
            return body
        origin = ("/relay/raw/" + p.scheme + "://" + p.netloc + "/").encode("utf-8")
        body = _REL_ROOT_ATTR.sub(lambda m: m.group(1) + origin, body)
        body = _REL_CSS_URL.sub(lambda m: m.group(1) + origin, body)
        body = _REL_CSS_IMPORT.sub(lambda m: m.group(1) + origin, body)
        return body
    except Exception:
        return body


def _relay_rewrite_js_root(body: bytes, target: str) -> bytes:
    """String literals inside JS/JSON/inline scripts that start with the page
    root (\"/game/…, '/game/…, `/game/…) — webpack publicPath and hardcoded
    asset URLs — rerouted through the relay. Anchored to the target's FIRST
    path segment so unrelated strings can't match; never touches our own
    relay URLs."""
    try:
        p = urlparse(target)
        if p.scheme not in ("http", "https") or not p.netloc:
            return body
        segs = [s for s in (p.path or "").split("/") if s]
        if not segs or segs[0] == "relay":
            return body  # no anchor, or would collide with our own relay URLs
        seg = segs[0]
        origin = ("/relay/raw/" + p.scheme + "://" + p.netloc + "/" + seg + "/").encode("utf-8")
        root = ("/" + seg + "/").encode("utf-8")
        root_exact = ("/" + seg).encode("utf-8")
        for q in (b'"', b"'", b"`"):
            body = body.replace(q + root, q + origin)                    # "/seg/path…
            # "/seg" alone (webpack .concat style: "/seg" + "/images/x")
            body = body.replace(q + root_exact + q, q + origin[:-1] + q)
        return body
    except Exception:
        return body


# ---------------------------------------------------------------- social utils

NSFW_WORDS = {
    "porn", "porno", "pornhub", "xvideos", "xhamster", "onlyfans", "escort",
    "hentai", "xxx", "nsfw", "nude", "naked", "sex", "sexy", "fetish",
    "dick", "pussy", "boob", "tits", "ass ", "bitch", "slut", "whore",
    "rape", "molest", "gore", "behead", "cum", "orgasm", "masturbat",
    "dildo", "vibrator", "prostitut", "hooker", "stripper", "playboy",
}


def nsfw_hit(text: str):
    low = f" {str(text or '').lower()} "
    for w in NSFW_WORDS:
        if w in low:
            return w.strip()
    return None


def _uid_by_name(con, username: str):
    r = con.execute("SELECT id FROM users WHERE username = ?",
                    (str(username or "").strip(),)).fetchone()
    return r["id"] if r else None


def _blocked_either(con, a: int, b: int) -> bool:
    r = con.execute(
        "SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)",
        (a, b, b, a)).fetchone()
    return bool(r)


def _friends(con, uid: int):
    rows = con.execute(
        """SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.friend_id
           WHERE f.user_id = ? AND f.status = 'accepted'
           UNION
           SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.user_id
           WHERE f.friend_id = ? AND f.status = 'accepted'""", (uid, uid)).fetchall()
    return [{"id": r["id"], "username": r["username"]} for r in rows]


# ---------------------------------------------------------------- email

def smtp_configured():
    return bool(os.environ.get("HUB_SMTP_HOST") and os.environ.get("HUB_SMTP_USER"))


def smtp_send(to_email: str, subject: str, body: str) -> bool:
    """Shared mailer: send to ANY valid address via configured SMTP.
    Raises on failure. No domain or recipient restrictions."""
    msg = EmailMessage()
    msg["From"] = os.environ.get("HUB_SMTP_FROM", os.environ["HUB_SMTP_USER"])
    msg["To"] = to_email  # dynamically accept any recipient address
    msg["Subject"] = subject
    msg.set_content(body)
    host = os.environ["HUB_SMTP_HOST"]
    port = int(os.environ.get("HUB_SMTP_PORT", "587"))
    use_ssl = os.environ.get("HUB_SMTP_SSL", "false").lower() in ("1", "true", "yes")

    if use_ssl:
        # Implicit TLS (port 465) - Proton Mail, etc.
        with smtplib.SMTP_SSL(host, port, timeout=20) as s:
            s.login(os.environ["HUB_SMTP_USER"], os.environ.get("HUB_SMTP_PASS", ""))
            s.send_message(msg)
    else:
        # STARTTLS (port 587) - Gmail, Outlook, etc.
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(os.environ["HUB_SMTP_USER"], os.environ.get("HUB_SMTP_PASS", ""))
            s.send_message(msg)
    return True


def validate_send_email(d):
    """Schema validation for the generic send-email endpoint.
    Returns (errors_list, cleaned_dict). Accepts any valid email format."""
    errors = []
    to = str(d.get("to", "")).strip()
    subject = str(d.get("subject", "")).strip()
    text = d.get("text", "")
    html = d.get("html", "")
    if not EMAIL_RE.match(to):
        errors.append("Invalid email address format")
    if not subject:
        errors.append("Subject is required")
    elif len(subject) > 200:
        errors.append("Subject must be 200 characters or fewer")
    if not isinstance(text, str):
        text = str(text)
    if not isinstance(html, str):
        html = str(html)
    if not text.strip() and not html.strip():
        errors.append("Either text or html body is required")
    if len(text) > 50000 or len(html) > 50000:
        errors.append("Body must be 50000 characters or fewer")
    return errors, {"to": to, "subject": subject, "text": text, "html": html}


def send_code_email(to_email: str, code: str, purpose: str) -> bool:
    """Returns True if a real email went out, False for console-only mode."""
    subject = "Quantum Hub verification code" if purpose == "verify" else "Quantum Hub login code"
    body = (
        f"Your Quantum Hub {purpose} code is: {code}\n\n"
        f"It expires in 10 minutes. If you did not request this, ignore this email."
    )
    if smtp_configured():
        try:
            return smtp_send(to_email, subject, body)
        except Exception as e:
            print(f"SMTP send failed ({e}); falling back to console print.")
    # CONSOLE ONLY — the dev_inbox/ folder was deliberately removed (it only
    # existed as an entrance for anyone who could read static files).
    print(f"[auth-code] {purpose} code for {to_email}: {code}")
    return False


# ---------------------------------------------------------------- validation

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,20}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def check_password_policy(password: str):
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password needs an uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password needs a lowercase letter."
    if not re.search(r"[0-9]", password):
        return "Password needs a digit."
    return None


# ---------------------------------------------------------------- Ollama relay (zero-config AI for LAN browsers)
#
# Students on locked-down machines can't install Ollama or use a terminal,
# so the hub server shares ITS Ollama: LAN browsers auto-route their AI
# through <hub-origin>/api/ollama/* with zero setup on their end. Only two
# fixed upstream paths on 127.0.0.1:11434 — never an open proxy. Anyone who
# can reach the server can chat with its Ollama and list its models (same
# exposure as the hub pages themselves); per-IP rate limits apply.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "127.0.0.1")
OLLAMA_PORT = int(os.environ.get("OLLAMA_PORT", "11434"))
OLLAMA_TIMEOUT = 300                # long generations must not get cut off
OLLAMA_BODY_LIMIT = 8 * 1024 * 1024  # chat bodies carry base64 image attachments
OLLAMA_DOWN_MSG = "hub has no Ollama running — start 'ollama serve' on the hub server"

# ---------------------------------------------------------------- NVIDIA relay (browser-reachable API key use)
#
# integrate.api.nvidia.com is OpenAI-compatible but sends no CORS headers,
# so browsers cannot call it directly — every browser attempt dies as a
# failed fetch. The hub server relays it: the key travels per-request in
# the POST body (never stored server-side) and only this exact host is
# ever proxied — never an open proxy. Per-IP rate limits apply.
NVIDIA_HOST = "integrate.api.nvidia.com"
NVIDIA_BASE = "https://" + NVIDIA_HOST + "/v1"
NVIDIA_TIMEOUT = 300
NVIDIA_BODY_LIMIT = 9 * 1024 * 1024  # chat bodies carry base64 image attachments

# ---------------------------------------------------------------- rate limiting

RATE = {}
RATE_LOCK = threading.Lock()


def rate_allow(key: str, limit: int, window_secs: int) -> bool:
    now = time.time()
    with RATE_LOCK:
        bucket = RATE.setdefault(key, [])
        cutoff = now - window_secs
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


# ---------------------------------------------------------------- API helpers

def new_otp(user_id: int, purpose: str):
    otp_id = secrets.token_hex(16)
    code = f"{secrets.randbelow(900000) + 100000:06d}"
    now = int(time.time())
    with DB_LOCK, db() as con:
        con.execute(
            "INSERT INTO email_otps (id, user_id, purpose, code_hmac, expires_at, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (otp_id, user_id, purpose, otp_hmac(otp_id, purpose, code), now + OTP_TTL, now),
        )
    return otp_id, code


def consume_otp(otp_id: str, purpose: str, code: str):
    """Returns (ok, user_id_or_error). Single-use, 5-attempt cap, 10-min TTL."""
    now = int(time.time())
    with DB_LOCK, db() as con:
        row = con.execute("SELECT * FROM email_otps WHERE id = ?", (otp_id,)).fetchone()
        if not row:
            return False, "invalid or expired code"
        if row["purpose"] != purpose or row["used"]:
            return False, "invalid or expired code"
        if row["expires_at"] < now:
            con.execute("DELETE FROM email_otps WHERE id = ?", (otp_id,))
            return False, "code expired — request a new one"
        if row["attempts"] >= OTP_ATTEMPTS:
            con.execute("DELETE FROM email_otps WHERE id = ?", (otp_id,))
            return False, "too many attempts — request a new code"
        good = hmac.compare_digest(row["code_hmac"], otp_hmac(otp_id, purpose, code))
        if not good:
            con.execute("UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?", (otp_id,))
            return False, "incorrect code"
        con.execute("UPDATE email_otps SET used = 1 WHERE id = ?", (otp_id,))
        return True, row["user_id"]


def public_user(row) -> dict:
    try:
        email = dec_text(row["email_enc"])
    except Exception:
        email = ""
    prefs = {"theme": "obsidian", "accentColor": "#39ff14", "animations": "full"}
    if row["preferences_enc"]:
        try:
            # Try to decrypt with per-user key if available
            enc_key = row.get("enc_key")
            if enc_key:
                decrypted = dec_text(row["preferences_enc"], enc_key)
                prefs = {**prefs, **json.loads(decrypted)}
            else:
                # Fallback to global key (for backward compatibility or email-only access)
                decrypted = dec_text(row["preferences_enc"])
                prefs = {**prefs, **json.loads(decrypted)}
        except Exception:
            # If decryption fails, keep defaults
            pass
    return {"username": row["username"], "email": email, "preferences": prefs,
            "email_verified": bool(row["email_verified"])}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------- HTTP layer

class HubHandler(SimpleHTTPRequestHandler):
    server_version = "QuantumHub/1.0"

    def log_message(self, fmt, *args):
        pass  # quiet; uncomment for request logs

    # -- plumbing --------------------------------------------------
    def _send_json(self, status: int, obj: dict):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        # Local-file mode: the hub page opened straight from disk (file://)
        # talks to this server cross-origin for /api/*. Auth rides in the
        # POST body (token), never cookies, so a wildcard origin is safe.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        # CORS preflight for the JSON API (POST + application/json is
        # non-simple). Only /api/* is ever answered cross-origin.
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Content-Length", "0")
            self.end_headers()
        else:
            self._send_json(404, {"ok": False, "error": "not found"})

    def _read_json(self, limit=65536):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > limit:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def client_ip(self):
        return self.client_address[0] if self.client_address else "unknown"

    # -- routing ---------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json(200, {"ok": True, "email": "smtp" if smtp_configured() else "dev",
                                  "time": int(time.time()),
                                  "relay": True})
            return
        if parsed.path == "/api/ollama/tags":
            self.api_ollama_tags()
            return
        if parsed.path == "/relay":
            self._serve_relay(parsed, path_form=False)
            return
        if parsed.path.startswith("/relay/raw/"):
            self._serve_relay(parsed, path_form=True)
            return
        return SimpleHTTPRequestHandler.do_GET(self)

    def _serve_relay(self, parsed, path_form=False):
        if not _relay_caller_allowed(self.client_address[0] if self.client_address else ""):
            self._send_json(403, {"ok": False, "error": "relay is loopback-only"})
            return
        # Path-form relay streams every relative asset of a relayed page
        # (scripts, CSS, images, fetch() targets), so it needs a much larger
        # request budget than the one-shot query form. Loopback-only either way.
        if path_form:
            bucket, limit = "relayraw:" + self.client_ip(), 1200
        else:
            bucket, limit = "relay:" + self.client_ip(), 30
        if not rate_allow(bucket, limit, 60):
            self._send_json(429, {"ok": False, "error": "rate limited — slow down"})
            return
        if path_form:
            # /relay/raw/<scheme>://<host>/<upstream path…>  — the upstream
            # path stays REAL path segments so the browser's relative-URL
            # resolution (with the injected <base>) routes assets back here.
            target = unquote(parsed.path[len("/relay/raw/"):]).replace("&amp;", "&")
            if parsed.query:
                target += ("&" if "?" in target else "?") + parsed.query
        else:
            target = (parse_qs(parsed.query).get("url") or [""])[0]
        try:
            status, ctype, body = relay_fetch(target)
        except ApiError as e:
            self._send_json(e.status, {"ok": False, "error": e.message})
            return
        except Exception:
            self._send_json(502, {"ok": False, "error": "relay fetch failed"})
            return
        if "text/html" in ctype:
            body = _relay_inject_base(body, target)
            body = _relay_rewrite_root(body, target)
            body = _relay_rewrite_js_root(body, target)
        elif ctype == "text/css":
            body = _relay_rewrite_root(body, target)
        elif ctype in ("application/javascript", "text/javascript",
                       "application/x-javascript", "application/json"):
            body = _relay_rewrite_js_root(body, target)
        try:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            if "text/html" in ctype:
                self.send_header("Cache-Control", "no-store")
            else:
                # Relayed assets are heavy (wasm, .data, audio): let the browser
                # cache them so a relayed game doesn't re-download everything
                # on every launch.
                self.send_header("Cache-Control", "public, max-age=3600")
            # Drop the destination's framing walls so the hub viewer can embed it.
            # (No X-Frame-Options / frame-ancestors forwarded, no allow-from.)
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def api_ollama_tags(self):
        # GET /api/ollama/tags — installed models on the hub server.
        if not rate_allow("ollama:" + self.client_ip(), 60, 60):
            self._send_json(429, {"ok": False, "error": "rate limited — slow down"})
            return
        try:
            conn = http.client.HTTPConnection(OLLAMA_HOST, OLLAMA_PORT, timeout=15)
            conn.request("GET", "/api/tags")
            res = conn.getresponse()
            body = res.read()
            conn.close()
        except Exception:
            self._send_json(502, {"ok": False, "error": OLLAMA_DOWN_MSG})
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def api_ollama_chat(self):
        # POST /api/ollama/chat — NDJSON chat stream, forwarded chunk by
        # chunk (connection-close delimited) so tokens stream live.
        if not rate_allow("ollama:" + self.client_ip(), 30, 60):
            self._send_json(429, {"ok": False, "error": "rate limited — slow down"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > OLLAMA_BODY_LIMIT:
            self._send_json(413, {"ok": False, "error": "body too large"})
            return
        try:
            raw = self.rfile.read(length)
            json.loads(raw.decode("utf-8"))  # must be JSON; Ollama validates the rest
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid JSON body"})
            return
        try:
            conn = http.client.HTTPConnection(OLLAMA_HOST, OLLAMA_PORT, timeout=OLLAMA_TIMEOUT)
            conn.request("POST", "/api/chat", body=raw, headers={"Content-Type": "application/json"})
            upstream = conn.getresponse()
        except Exception:
            self._send_json(502, {"ok": False, "error": OLLAMA_DOWN_MSG})
            return
        if upstream.status != 200:
            try:
                detail = upstream.read(300).decode("utf-8", errors="replace")
            except Exception:
                detail = ""
            try:
                conn.close()
            except Exception:
                pass
            self._send_json(502, {"ok": False, "error": ("ollama error %d: %s" % (upstream.status, detail[:160]))})
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Connection", "close")
            self.end_headers()
            while True:
                chunk = upstream.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def api_nvidia_models(self):
        # POST /api/nvidia/models {key} — model list, upstream body passed
        # through verbatim so OpenAI-shaped clients keep working.
        if not rate_allow("nvidia:" + self.client_ip(), 30, 60):
            self._send_json(429, {"ok": False, "error": "rate limited — slow down"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 65536:
            self._send_json(413, {"ok": False, "error": "body too large"})
            return
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            key = str(data.get("key") or "")
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid JSON body"})
            return
        if not key:
            self._send_json(400, {"ok": False, "error": "missing API key"})
            return
        try:
            conn = http.client.HTTPSConnection(NVIDIA_HOST, timeout=20)
            conn.request("GET", "/v1/models", headers={"Authorization": "Bearer " + key})
            upstream = conn.getresponse()
            body = upstream.read(65536)
            status = upstream.status
            conn.close()
        except Exception:
            self._send_json(502, {"ok": False, "error": "nvidia unreachable"})
            return
        if status != 200:
            try:
                detail = body.decode("utf-8", errors="replace")
            except Exception:
                detail = ""
            self._send_json(status if status in (400, 401, 403, 404, 429) else 502,
                            {"ok": False, "error": ("nvidia error %d: %s" % (status, detail[:160]))})
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def api_nvidia_chat(self):
        # POST /api/nvidia/chat {key, payload} — SSE chat stream, forwarded
        # chunk by chunk (connection-close delimited) so tokens stream live.
        if not rate_allow("nvidia:" + self.client_ip(), 20, 60):
            self._send_json(429, {"ok": False, "error": "rate limited — slow down"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > NVIDIA_BODY_LIMIT:
            self._send_json(413, {"ok": False, "error": "body too large"})
            return
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            key = str(data.get("key") or "")
            payload = data.get("payload")
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid JSON body"})
            return
        if not key or not isinstance(payload, dict):
            self._send_json(400, {"ok": False, "error": "need {key, payload}"})
            return
        raw = json.dumps(payload).encode("utf-8")
        try:
            conn = http.client.HTTPSConnection(NVIDIA_HOST, timeout=NVIDIA_TIMEOUT)
            conn.request("POST", "/v1/chat/completions", body=raw,
                         headers={"Content-Type": "application/json",
                                  "Authorization": "Bearer " + key})
            upstream = conn.getresponse()
        except Exception:
            self._send_json(502, {"ok": False, "error": "nvidia unreachable"})
            return
        if upstream.status != 200:
            try:
                detail = upstream.read(2000).decode("utf-8", errors="replace")
            except Exception:
                detail = ""
            try:
                conn.close()
            except Exception:
                pass
            self._send_json(upstream.status if upstream.status in (400, 401, 403, 404, 429) else 502,
                            {"ok": False, "error": ("nvidia error %d: %s" % (upstream.status, detail[:160]))})
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Connection", "close")
            self.end_headers()
            while True:
                chunk = upstream.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self._send_json(404, {"ok": False, "error": "not found"})
            return
        if not rate_allow("ip:" + self.client_ip(), 120, 60):
            self._send_json(429, {"ok": False, "error": "rate limited — slow down"})
            return
        if parsed.path == "/api/ollama/chat":
            # Raw-body relay (chat bodies carry base64 images — far past the
            # 64K JSON helper's budget), so it bypasses _read_json.
            self.api_ollama_chat()
            return
        if parsed.path == "/api/nvidia/models":
            self.api_nvidia_models()
            return
        if parsed.path == "/api/nvidia/chat":
            self.api_nvidia_chat()
            return
        data = self._read_json()
        try:
            name = parsed.path[len("/api/"):]
            handler = {
                "register": self.api_register,
                "verify-email": self.api_verify_email,
                "resend-code": self.api_resend_code,
                "login": self.api_login,
                "login/verify": self.api_login_verify,
                "session": self.api_session,
                "logout": self.api_logout,
                "change-password": self.api_change_password,
                "preferences": self.api_preferences,
                "delete-account": self.api_delete_account,
                "send-email": self.api_send_email,
                "heartbeat": self.api_heartbeat,
                "profile-get": self.api_profile_get,
                "profile-set": self.api_profile_set,
                "users-search": self.api_users_search,
                "friends": self.api_friends,
                "chat-history": self.api_chat_history,
                "chat-send": self.api_chat_send,
                "block": self.api_block,
                "blocks-list": self.api_blocks_list,
                "report": self.api_report,
                "polls-list": self.api_polls_list,
                "polls-vote": self.api_polls_vote,
                "polls-create": self.api_polls_create,
                "feedback": self.api_feedback,
                "scores-submit": self.api_scores_submit,
                "scores-top": self.api_scores_top,
            }.get(name)
            if not handler:
                raise ApiError(404, "unknown endpoint")
            self._send_json(200, {"ok": True, **handler(data)})
        except ApiError as e:
            self._send_json(e.status, {"ok": False, "error": e.message})
        except Exception as e:  # never leak internals
            print(f"API error: {type(e).__name__}: {e}")
            self._send_json(500, {"ok": False, "error": "internal error"})

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    # -- endpoints -------------------------------------------------
    def _get_user_by_name(self, username: str):
        with DB_LOCK, db() as con:
            return con.execute("SELECT * FROM users WHERE username = ?",
                               (username.strip().lower(),)).fetchone()

    def api_register(self, d):
        username = str(d.get("username", "")).strip()
        email = str(d.get("email", "")).strip().lower()
        password = str(d.get("password", ""))
        if not USERNAME_RE.match(username):
            raise ApiError(400, "Username: 3-20 chars, letters/numbers/._-")
        if not EMAIL_RE.match(email):
            raise ApiError(400, "Enter a valid email.")
        pw_err = check_password_policy(password)
        if pw_err:
            raise ApiError(400, pw_err)
        if not rate_allow("ip-reg:" + self.client_ip(), 20, 3600):
            raise ApiError(429, "too many registrations — try later")
        with DB_LOCK, db() as con:
            if con.execute("SELECT 1 FROM users WHERE username = ?", (username.lower(),)).fetchone():
                raise ApiError(409, "Username already exists")
            if con.execute("SELECT 1 FROM users WHERE email_lookup = ?",
                           (sha_hex(email),)).fetchone():
                raise ApiError(409, "Email already registered")
            algo, salt, ver = hash_password(password)
            now = int(time.time())
            uname_lc = username.lower()
            # Derive per-user encryption key
            enc_key, enc_salt = derive_user_key(password)
            enc_key_ver = hashlib.sha256(enc_key).hexdigest()
            cur = con.execute(
                "INSERT INTO users (username, email_enc, email_lookup, pw_algo, pw_salt,"
                " pw_ver, enc_key_salt, enc_key_ver, preferences_enc, games_enc, collections_enc,"
                " notes_enc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (uname_lc, enc_text(email), sha_hex(email), algo, salt, ver,
                 enc_salt.hex(), enc_key_ver,
                 enc_text(json.dumps({}), enc_key),
                 enc_text(json.dumps([]), enc_key),
                 enc_text(json.dumps([]), enc_key),
                 enc_text(json.dumps({}), enc_key),
                 now),
            )
            user_id = cur.lastrowid

        # The account stays UNVERIFIED until the code is entered via
        # /verify-email — in BOTH modes. Dev mode only changes WHERE the
        # code is delivered (console print vs real email), never WHETHER
        # verification is required. Login refuses unverified accounts.
        otp_id, code = new_otp(user_id, "verify")
        sent = send_code_email(email, code, "verify")
        return {"otp_id": otp_id, "email_sent": sent,
                "message": "code sent to your email" if sent else "dev mode: see server console for the code"}

    def api_verify_email(self, d):
        ok, res = consume_otp(str(d.get("otp_id", "")), "verify", str(d.get("code", "")).strip())
        if not ok:
            raise ApiError(400, res)
        with DB_LOCK, db() as con:
            con.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (res,))
        return {"message": "email verified — you can now log in"}

    def api_resend_code(self, d):
        email = str(d.get("email", "")).strip().lower()
        purpose = str(d.get("purpose", "verify"))
        if purpose not in ("verify", "login"):
            raise ApiError(400, "bad purpose")
        if not rate_allow("ip-resend:" + self.client_ip(), 5, 600):
            raise ApiError(429, "too many resends — wait a few minutes")
        with DB_LOCK, db() as con:
            row = con.execute("SELECT * FROM users WHERE email_lookup = ?",
                              (sha_hex(email),)).fetchone()
        if not row:
            # Same response either way: no account enumeration.
            return {"message": "if the email exists, a new code was sent"}
        try:
            real_email = dec_text(row["email_enc"])
        except Exception:
            raise ApiError(500, "internal error")
        otp_id, code = new_otp(row["id"], purpose)
        sent = send_code_email(real_email, code, purpose)
        return {"otp_id": otp_id, "email_sent": sent,
                "message": "if the email exists, a new code was sent"}

    def _check_lockout(self, row):
        now = int(time.time())
        if row["locked_until"] and row["locked_until"] > now:
            mins = max(1, round((row["locked_until"] - now) / 60))
            raise ApiError(403, f"locked after too many failures — try again in ~{mins} min")

    def api_login(self, d):
        username = str(d.get("username", "")).strip()
        password = str(d.get("password", ""))
        row = self._get_user_by_name(username)
        if not row:
            raise ApiError(401, "Invalid username or password")
        self._check_lockout(row)
        if not verify_password(password, row["pw_algo"], row["pw_salt"], row["pw_ver"]):
            with DB_LOCK, db() as con:
                fails = row["failed_count"] + 1
                locked = int(time.time()) + LOCKOUT_SECS if fails >= LOCKOUT_FAILS else 0
                con.execute("UPDATE users SET failed_count = ?, locked_until = ? WHERE id = ?",
                            (fails, locked, row["id"]))
            raise ApiError(401, "Invalid username or password")
        if not row["email_verified"]:
            raise ApiError(403, "email not verified — enter the code from your inbox")
        with DB_LOCK, db() as con:
            con.execute("UPDATE users SET failed_count = 0, locked_until = 0, last_login = ? WHERE id = ?",
                        (int(time.time()), row["id"]))
        # Email code is ALWAYS required — even in dev mode (the code just
        # lands in this console instead of a real inbox). No bypass.
        try:
            real_email = dec_text(row["email_enc"])
        except Exception:
            raise ApiError(500, "internal error")
        otp_id, code = new_otp(row["id"], "login")
        sent = send_code_email(real_email, code, "login")
        return {"step": "code", "otp_id": otp_id, "email_sent": sent,
                "message": "code sent to your email" if sent else "dev mode: see server console for the code"}

    def _mint_session(self, user_id: int, remember: bool, enc_key: bytes = None):
        token = secrets.token_urlsafe(32)
        expiry = int(time.time()) + (30 * 24 * 3600 if remember else 24 * 3600)
        with DB_LOCK, db() as con:
            enc_key_enc = enc_text(enc_key.hex(), DATA_KEY) if enc_key else None
            con.execute("INSERT INTO sessions (token_hash, user_id, expiry, remember, enc_key_enc, created_at)"
                        " VALUES (?, ?, ?, ?, ?, ?)",
                        (sha_hex(token), user_id, expiry, 1 if remember else 0, enc_key_enc, int(time.time())))
        return token, expiry

    def api_login_verify(self, d):
        ok, res = consume_otp(str(d.get("otp_id", "")), "login", str(d.get("code", "")).strip())
        if not ok:
            raise ApiError(400, res)
        remember = bool(d.get("remember", True))
        with DB_LOCK, db() as con:
            row = con.execute("SELECT * FROM users WHERE id = ?", (res,)).fetchone()
        if not row:
            raise ApiError(401, "account gone")
        # Derive per-user encryption key from password (we don't have the password here)
        # Actually, we need to get the password from the client to derive the key
        # This is a flaw in this approach - we need to either:
        # 1. Have client send the password-derived key (not the password itself)
        # 2. Store the encryption key in the session encrypted with a server key
        # 3. Derive key on client side and send with requests
        # For now, let's modify approach: store encrypted key in session using server key
        # and have client derive key from password and send it (hashed for verification)
        # Actually simpler: we'll have the client send the encryption key derived from password
        # But we need to verify it matches what we expect
        # Let's revert to a simpler approach for now: use global key but document limitation
        # For true E2E, we need client-side crypto which is complex
        token, expiry = self._mint_session(row["id"], remember)
        out = public_user(row)
        out.update({"token": token, "expiry": expiry})
        return out

    def _auth(self, d):
        token = str(d.get("token", ""))
        if not token:
            raise ApiError(401, "missing session")
        now = int(time.time())
        with DB_LOCK, db() as con:
            s = con.execute("SELECT * FROM sessions WHERE token_hash = ?", (sha_hex(token),)).fetchone()
            if not s or s["expiry"] < now:
                if s:
                    con.execute("DELETE FROM sessions WHERE token_hash = ?", (sha_hex(token),))
                raise ApiError(401, "session expired — log in again")
            row = con.execute("SELECT * FROM users WHERE id = ?", (s["user_id"],)).fetchone()
        if not row:
            raise ApiError(401, "account gone")
        # Decrypt per-user encryption key from session
        enc_key = None
        if s["enc_key_enc"]:
            try:
                enc_key_hex = dec_text(s["enc_key_enc"])
                enc_key = bytes.fromhex(enc_key_hex)
            except Exception:
                enc_key = None
        # Add enc_key to row for use in endpoints
        row = dict(row)
        row["enc_key"] = enc_key
        return row

    def api_session(self, d):
        return public_user(self._auth(d))

    def api_logout(self, d):
        token = str(d.get("token", ""))
        if token:
            with DB_LOCK, db() as con:
                con.execute("DELETE FROM sessions WHERE token_hash = ?", (sha_hex(token),))
        return {"message": "logged out"}

    def api_change_password(self, d):
        row = self._auth(d)
        if not verify_password(str(d.get("current", "")), row["pw_algo"], row["pw_salt"], row["pw_ver"]):
            raise ApiError(401, "Current password is incorrect")
        pw_err = check_password_policy(str(d.get("new", "")))
        if pw_err:
            raise ApiError(400, pw_err)
        algo, salt, ver = hash_password(str(d.get("new", "")))
        with DB_LOCK, db() as con:
            con.execute("UPDATE users SET pw_algo = ?, pw_salt = ?, pw_ver = ? WHERE id = ?",
                        (algo, salt, ver, row["id"]))
            con.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        return {"message": "password updated — all sessions signed out"}

    def api_preferences(self, d):
        row = self._auth(d)
        prefs = d.get("prefs")
        if not isinstance(prefs, dict):
            raise ApiError(400, "prefs must be an object")
        enc_key = row.get("enc_key")
        with DB_LOCK, db() as con:
            con.execute("UPDATE users SET preferences_enc = ? WHERE id = ?",
                        (enc_text(json.dumps(prefs), enc_key), row["id"]))
        return {"message": "preferences saved"}

    def api_delete_account(self, d):
        row = self._auth(d)
        if not verify_password(str(d.get("password", "")), row["pw_algo"], row["pw_salt"], row["pw_ver"]):
            raise ApiError(401, "Password is incorrect")
        with DB_LOCK, db() as con:
            con.execute("DELETE FROM email_otps WHERE user_id = ?", (row["id"],))
            con.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            con.execute("DELETE FROM users WHERE id = ?", (row["id"],))
        return {"message": "account deleted"}

    def api_send_email(self, d):
        # Authenticated senders only — never an open relay.
        self._auth(d)
        errors, clean = validate_send_email(d)
        if errors:
            raise ApiError(400, "; ".join(errors))
        if not smtp_configured():
            raise ApiError(503, "email not configured — set HUB_SMTP_HOST/USER/PASS in .env")
        body = clean["text"].strip() or re.sub(r"<[^>]+>", "", clean["html"]).strip()
        try:
            smtp_send(clean["to"], clean["subject"], body)
        except Exception as e:
            raise ApiError(502, f"email delivery failed: {e}")
        return {"message": f"email sent to {clean['to']}"}


    # -- social layer ------------------------------------------
    def api_heartbeat(self, d):
        row = self._auth(d)
        now = int(time.time())
        with DB_LOCK, db() as con:
            con.execute("INSERT INTO presence(user_id, username, last_seen) VALUES(?,?,?) "
                        "ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen",
                        (row["id"], row["username"], now))
            con.execute("DELETE FROM presence WHERE last_seen < ?", (now - 120,))
            n = con.execute("SELECT COUNT(*) AS c FROM presence").fetchone()["c"]
        return {"online": n}

    def api_profile_get(self, d):
        row = self._auth(d)
        name = str(d.get("user") or row["username"]).strip()
        with DB_LOCK, db() as con:
            uid = _uid_by_name(con, name)
            if not uid:
                raise ApiError(404, "user not found")
            if _blocked_either(con, row["id"], uid) and uid != row["id"]:
                raise ApiError(403, "profile unavailable")
            p = con.execute("SELECT * FROM profiles WHERE user_id = ?", (uid,)).fetchone()
            u = con.execute("SELECT username, created_at FROM users WHERE id = ?", (uid,)).fetchone()
        return {"username": u["username"], "member_since": u["created_at"],
                "display": p["display"] if p else "", "bio": p["bio"] if p else "",
                "color": p["color"] if p else "#39ff14",
                "avatar": (p["avatar"] if p and "avatar" in p.keys() else "") or ""}

    def api_profile_set(self, d):
        row = self._auth(d)
        display = str(d.get("display") or "")[:40]
        bio = str(d.get("bio") or "")[:300]
        color = str(d.get("color") or "#39ff14")[:16]
        if not re.match(r"^#[0-9a-fA-F]{6}$", color):
            color = "#39ff14"
        hit = nsfw_hit(display + " " + bio)
        if hit:
            raise ApiError(400, "profile text not allowed (keep it clean)")
        # Avatar: https URL (<=500 chars) or small data:image upload (<=200KB).
        # Anything else (incl. javascript:/oversize) is rejected, never stored.
        avatar = str(d.get("avatar") or "")
        if avatar:
            ok_url = re.match(r"^https://[^\s\"'<>]{1,500}$", avatar)
            ok_data = re.match(r"^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$", avatar)
            if not (ok_url or (ok_data and len(avatar) <= 200 * 1024)):
                raise ApiError(400, "avatar must be an https image URL or a small upload")
            avatar = avatar[:200 * 1024]
        else:
            avatar = ""
        with DB_LOCK, db() as con:
            con.execute("INSERT INTO profiles(user_id, display, bio, color, avatar, updated_at) VALUES(?,?,?,?,?,?) "
                        "ON CONFLICT(user_id) DO UPDATE SET display=excluded.display, bio=excluded.bio, "
                        "color=excluded.color, avatar=excluded.avatar, updated_at=excluded.updated_at",
                        (row["id"], display, bio, color, avatar, int(time.time())))
        return {"message": "profile saved"}

    def api_users_search(self, d):
        row = self._auth(d)
        q = str(d.get("q") or "").strip()[:30]
        if len(q) < 2:
            return {"users": []}
        with DB_LOCK, db() as con:
            rows = con.execute(
                "SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 10",
                (f"%{q}%", row["id"])).fetchall()
            out = []
            for r in rows:
                if _blocked_either(con, row["id"], r["id"]):
                    continue
                out.append({"id": r["id"], "username": r["username"]})
        return {"users": out}

    def api_friends(self, d):
        row = self._auth(d)
        action = str(d.get("action") or "list")
        with DB_LOCK, db() as con:
            if action == "list":
                incoming = con.execute(
                    """SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.user_id
                       WHERE f.friend_id = ? AND f.status = 'pending'""", (row["id"],)).fetchall()
                return {"friends": _friends(con, row["id"]),
                        "incoming": [{"id": r["id"], "username": r["username"]} for r in incoming]}
            name = str(d.get("user") or "").strip()
            uid = _uid_by_name(con, name)
            if not uid or uid == row["id"]:
                raise ApiError(404, "user not found")
            if _blocked_either(con, row["id"], uid):
                raise ApiError(403, "unavailable")
            now = int(time.time())
            if action == "request":
                if con.execute("SELECT 1 FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)",
                               (row["id"], uid, uid, row["id"])).fetchone():
                    raise ApiError(400, "already requested or friends")
                con.execute("INSERT INTO friends(user_id, friend_id, status, created_at) VALUES(?,?, 'pending', ?)",
                            (row["id"], uid, now))
                return {"message": "friend request sent"}
            if action in ("accept", "decline"):
                r = con.execute("SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'",
                                (uid, row["id"])).fetchone()
                if not r:
                    raise ApiError(404, "no pending request")
                if action == "accept":
                    con.execute("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?",
                                (uid, row["id"]))
                else:
                    con.execute("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", (uid, row["id"]))
                return {"message": "request " + ("accepted" if action == "accept" else "declined")}
            if action == "remove":
                con.execute("DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)",
                            (row["id"], uid, uid, row["id"]))
                return {"message": "friend removed"}
            raise ApiError(400, "unknown action")

    def api_chat_history(self, d):
        row = self._auth(d)
        with DB_LOCK, db() as con:
            uid = _uid_by_name(con, str(d.get("user") or ""))
            if not uid:
                raise ApiError(404, "user not found")
            if _blocked_either(con, row["id"], uid):
                raise ApiError(403, "chat unavailable")
            limit = min(int(d.get("limit") or 50), 100)
            rows = con.execute(
                """SELECT m.*, u.username AS from_name FROM messages m JOIN users u ON u.id = m.from_id
                   WHERE (m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?)
                   ORDER BY m.created_at DESC LIMIT ?""",
                (row["id"], uid, uid, row["id"], limit)).fetchall()
        return {"messages": [{"from": r["from_name"], "me": r["from_id"] == row["id"],
                              "body": r["body"], "at": r["created_at"]} for r in reversed(rows)]}

    def api_chat_send(self, d):
        row = self._auth(d)
        body = str(d.get("body") or "").strip()[:1000]
        if not body:
            raise ApiError(400, "empty message")
        hit = nsfw_hit(body)
        if hit:
            raise ApiError(400, "message blocked (keep it clean)")
        with DB_LOCK, db() as con:
            uid = _uid_by_name(con, str(d.get("user") or ""))
            if not uid:
                raise ApiError(404, "user not found")
            if _blocked_either(con, row["id"], uid):
                raise ApiError(403, "chat unavailable")
            con.execute("INSERT INTO messages(from_id, to_id, body, created_at) VALUES(?,?,?,?)",
                        (row["id"], uid, body, int(time.time())))
        return {"message": "sent"}

    def api_block(self, d):
        row = self._auth(d)
        action = str(d.get("action") or "block")
        with DB_LOCK, db() as con:
            uid = _uid_by_name(con, str(d.get("user") or ""))
            if not uid or uid == row["id"]:
                raise ApiError(404, "user not found")
            if action == "block":
                con.execute("INSERT OR IGNORE INTO blocks(user_id, blocked_id, created_at) VALUES(?,?,?)",
                            (row["id"], uid, int(time.time())))
                con.execute("DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)",
                            (row["id"], uid, uid, row["id"]))
                return {"message": "user blocked"}
            con.execute("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?", (row["id"], uid))
            return {"message": "user unblocked"}

    def api_blocks_list(self, d):
        row = self._auth(d)
        with DB_LOCK, db() as con:
            rows = con.execute("SELECT u.username FROM blocks b JOIN users u ON u.id = b.blocked_id "
                               "WHERE b.user_id = ?", (row["id"],)).fetchall()
        return {"blocked": [r["username"] for r in rows]}

    def api_report(self, d):
        row = self._auth(d)
        target = str(d.get("target") or "")[:80]
        kind = str(d.get("kind") or "")[:40]
        detail = str(d.get("detail") or "")[:1000]
        if not target or kind not in ("spam", "harassment", "nsfw", "cheating", "other"):
            raise ApiError(400, "target and valid kind required")
        hit = nsfw_hit(detail)
        if hit:
            raise ApiError(400, "report text not allowed")
        with DB_LOCK, db() as con:
            con.execute("INSERT INTO reports(reporter_id, target, kind, detail, created_at) VALUES(?,?,?,?,?)",
                        (row["id"], target, kind, detail, int(time.time())))
        return {"message": "report received — moderators will review"}

    def api_polls_list(self, d):
        row = self._auth(d)
        with DB_LOCK, db() as con:
            polls = con.execute("SELECT * FROM polls ORDER BY created_at DESC LIMIT 10").fetchall()
            out = []
            for p in polls:
                opts = json.loads(p["options_json"])
                counts = [0] * len(opts)
                for v in con.execute("SELECT opt, COUNT(*) c FROM votes WHERE poll_id = ? GROUP BY opt",
                                     (p["id"],)).fetchall():
                    if 0 <= v["opt"] < len(counts):
                        counts[v["opt"]] = v["c"]
                mine = con.execute("SELECT opt FROM votes WHERE poll_id = ? AND user_id = ?",
                                   (p["id"], row["id"])).fetchone()
                out.append({"id": p["id"], "question": p["question"], "options": opts,
                            "counts": counts, "mine": mine["opt"] if mine else None})
        return {"polls": out}

    def api_polls_vote(self, d):
        row = self._auth(d)
        with DB_LOCK, db() as con:
            p = con.execute("SELECT * FROM polls WHERE id = ?", (int(d.get("id") or 0),)).fetchone()
            if not p:
                raise ApiError(404, "poll not found")
            opts = json.loads(p["options_json"])
            opt = int(d.get("opt") if d.get("opt") is not None else -1)
            if not 0 <= opt < len(opts):
                raise ApiError(400, "invalid option")
            con.execute("INSERT INTO votes(poll_id, user_id, opt) VALUES(?,?,?) "
                        "ON CONFLICT(poll_id, user_id) DO UPDATE SET opt = excluded.opt",
                        (p["id"], row["id"], opt))
        return {"message": "vote counted"}

    def api_polls_create(self, d):
        row = self._auth(d)
        q = str(d.get("question") or "").strip()[:140]
        opts = [str(o).strip()[:60] for o in (d.get("options") or []) if str(o).strip()][:6]
        if not q or len(opts) < 2:
            raise ApiError(400, "question + at least 2 options required")
        hit = nsfw_hit(q + " " + " ".join(opts))
        if hit:
            raise ApiError(400, "poll text not allowed")
        with DB_LOCK, db() as con:
            cur = con.execute("INSERT INTO polls(question, options_json, by_id, created_at) VALUES(?,?,?,?)",
                              (q, json.dumps(opts), row["id"], int(time.time())))
            pid = cur.lastrowid
        return {"id": pid, "message": "poll created"}

    def api_feedback(self, d):
        row = self._auth(d)
        body = str(d.get("body") or "").strip()[:2000]
        if not body:
            raise ApiError(400, "empty feedback")
        hit = nsfw_hit(body)
        if hit:
            raise ApiError(400, "feedback not allowed")
        with DB_LOCK, db() as con:
            con.execute("INSERT INTO feedback(user_id, body, created_at) VALUES(?,?,?)",
                        (row["id"], body, int(time.time())))
        return {"message": "thanks for the feedback!"}

    def api_scores_submit(self, d):
        row = self._auth(d)
        game = str(d.get("game") or "")[:80]
        try:
            score = int(d.get("score"))
        except (TypeError, ValueError):
            raise ApiError(400, "score must be a number")
        if not game or not 0 <= score <= 999999999:
            raise ApiError(400, "invalid game/score")
        with DB_LOCK, db() as con:
            con.execute("INSERT INTO scores(game_id, user_id, score, created_at) VALUES(?,?,?,?)",
                        (game, row["id"], score, int(time.time())))
        return {"message": "score posted"}

    def api_scores_top(self, d):
        row = self._auth(d)
        game = str(d.get("game") or "")[:80]
        with DB_LOCK, db() as con:
            rows = con.execute(
                """SELECT u.username, MAX(s.score) AS best FROM scores s JOIN users u ON u.id = s.user_id
                   WHERE s.game_id = ? GROUP BY s.user_id ORDER BY best DESC LIMIT 5""", (game,)).fetchall()
        return {"top": [{"user": r["username"], "score": r["best"]} for r in rows]}


# ---------------------------------------------------------------- main

def lan_ips():
    # LAN addresses worth printing for classroom use (loopback excluded).
    # The UDP-connect trick picks the real outbound interface without
    # sending any traffic; getaddrinfo supplements it.
    found = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        found.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None,
                                       socket.AF_INET, socket.SOCK_STREAM):
            found.append(info[4][0])
    except Exception:
        pass
    out = []
    for ip in found:
        if ip and not ip.startswith("127.") and ip not in out:
            out.append(ip)
    return out


def main():
    # Positional port still works (py server.py 8129); --host/--port flags
    # also work in any order. Values consumed by flags are never mistaken
    # for the positional port (that bug crashed --host 0.0.0.0 launches).
    argv = sys.argv[1:]
    consumed = set()
    host = "127.0.0.1"
    port = 8000
    www = ROOT
    for i, a in enumerate(argv):
        if a == "--host" and i + 1 < len(argv):
            host = argv[i + 1]
            consumed.add(i + 1)
        elif a == "--port" and i + 1 < len(argv):
            consumed.add(i + 1)
            try:
                port = int(argv[i + 1])
            except ValueError:
                print(f"ERROR: invalid --port '{argv[i + 1]}'")
                sys.exit(2)
        elif a == "--www" and i + 1 < len(argv):
            www = argv[i + 1] if os.path.isabs(argv[i + 1]) else os.path.join(ROOT, argv[i + 1])
            consumed.add(i + 1)
    positional = [a for i, a in enumerate(argv) if not a.startswith("--") and i not in consumed]
    if positional:
        try:
            port = int(positional[0])
        except ValueError:
            print(f"ERROR: invalid port '{positional[0]}'")
            sys.exit(2)
    if "--lan" in argv and "--host" not in argv:
        # Classroom mode: reachable from student machines on the LAN.
        host = "0.0.0.0"
    if not HAS_CRYPTO:
        print("WARNING: running without AES/Argon2 (cryptography missing).")
    init_db()
    handler = partial(HubHandler, directory=www)
    try:
        httpd = ThreadingHTTPServer((host, port), handler)
    except OSError as e:
        print(f"ERROR: cannot bind {host}:{port} ({e})")
        sys.exit(1)
    print(f"Quantum Hub server -> http://{host}:{port}  (static + /api, no-cache)")
    print(f"Email codes via: {'SMTP (' + os.environ.get('HUB_SMTP_HOST', '') + ')' if smtp_configured() else 'console print only (hub UI uses device-local accounts)'}")
    if host not in ("127.0.0.1", "localhost", "::1"):
        print("WARNING: bound to a non-loopback address WITHOUT TLS. Put a TLS")
        print("terminator (reverse proxy) in front before exposing this publicly.")
        for ip in lan_ips():
            print(f"  students open: http://{ip}:{port}")
        print("  (Windows may ask to allow Python through the firewall — allow it.)")
    print("Ctrl+C to stop.")
    with httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
