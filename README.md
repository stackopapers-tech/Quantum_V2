# Quantum Launcher — Game & Media Hub

A web launcher with mirror-based launching, an importable game library, media
catalog, dev tools, an AI assistant, and cross-device server accounts.
Vanilla ES modules, no build step.

---

## Run it

**Static only (single device):** `py serve.py` — <http://127.0.0.1:8000>

**With accounts (multi-device):** `py server.py` — same URL, plus `/api/*`.

```bash
py server.py                     # http://127.0.0.1:8000 (loopback only)
py server.py 8080                # custom port
py server.py --host 0.0.0.0 --port 8000   # LAN: other devices use http://YOUR-IP:8000
```

`server.py` serves the static files (with no-store cache headers like
`serve.py`) **and** the private account database. Accounts work from any
device that can reach the server. Binding `--host 0.0.0.0` without TLS is
LAN-only territory — put a TLS reverse proxy in front before exposing it
further (the server prints this warning itself).

---

## Accounts & email codes

Register and login **always** require entering the 6-digit email code —
registration stays unverified (and unusable) until the code is confirmed,
and every login demands a fresh code. No bypass in any mode.

Where the code is delivered depends on `.env`:

```bash
# Proton Mail (SSL, port 465)
HUB_SMTP_HOST=mail.proton.me
HUB_SMTP_PORT=465
HUB_SMTP_SSL=true
HUB_SMTP_USER=you@proton.me
HUB_SMTP_PASS=your-password
HUB_SMTP_FROM=you@proton.me

# Gmail (STARTTLS, port 587 — needs an App Password, not your login password)
HUB_SMTP_HOST=smtp.gmail.com
HUB_SMTP_PORT=587
HUB_SMTP_SSL=false
HUB_SMTP_USER=you@gmail.com
HUB_SMTP_PASS=your-16-char-app-password
HUB_SMTP_FROM=you@gmail.com
```

Without SMTP credentials the server runs in **dev-inbox mode**: codes print
to the server console and land in `dev_inbox/`. (Note: free Proton plans
need Proton Bridge for SMTP; Gmail App Passwords work on any plan with 2FA.)

Three encryption layers protect the database (`hub_server.db`):
1. **Passwords** — Argon2id over HMAC-SHA256(server pepper, password), unique
   salt per user (PBKDF2/210k fallback). The pepper lives in
   `server_keys.json`, never in the DB.
2. **Data at rest** — emails/preferences are AES-256-GCM ciphertext.
3. **Tokens/OTPs** — sessions stored as SHA-256 hashes; codes as HMAC with
   10-minute expiry, single-use, 5-attempt cap; rate limits + lockout.

Passwords are never stored. Password fields have show/hide 👁 toggles.

---

## Run it (static only)

**Use `serve.py` — not `python -m http.server`.** (For accounts, use
`server.py` above instead — it serves the same files plus `/api/*`.)

```bash
py serve.py          # http://localhost:8000
py serve.py 8080     # custom port
```

`serve.py` does two things the stock server does not:

1. **Sends no-store cache headers.** Browsers aggressively cache ES modules.
   With the stock server the browser kept running a *stale* `js/app.js`, so
   edits appeared to have no effect — this was the root cause of "the mirror
   URLs won't change" and "nothing opens".
2. **Binds IPv4 + IPv6.** Browsers resolve `localhost` to `::1` on many
   systems; an IPv4-only bind makes those requests fail (blank page / 502).

Open <http://localhost:8000> (or `http://127.0.0.1:8000` if your browser
proxies `localhost`).

---

## Cache busting

Every module is imported with a `?v=` stamp, and `index.html` sets
`window.HUB_VERSION` to the same value. **After editing anything under `js/`,
restamp so browsers refetch:**

```bash
py bump_version.py            # auto: today's date + incremented suffix
py bump_version.py 2026.10.1-1  # explicit
py bump_version.py --show      # print current
```

The stamp is a plain literal on purpose — ES import specifiers cannot contain
expressions. `bump_version.py` updates `index.html` and `js/app.js` together so
they never drift.

If something still looks stale, hard-reload: `Ctrl+Shift+R` (`Cmd+Shift+R` on
macOS).

---

## Mirrors

A "mirror" is a **launch destination plus a launch mode**. That is the whole
concept.

The hub opens the destination directly in a **separate tab**. It does **not**
proxy, cache, rewrite, fetch, or relay traffic on anyone's behalf, and it does
**not** bypass network, school, workplace, ISP, or browser restrictions. Each
URL belongs to its own site and is opened as an ordinary outbound link.

### Built-in mirrors (CDN-only)

| Mirror | URL |
| --- | --- |
| jsDelivr CDN | `https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js` |
| Quantil jsDelivr | `https://quantil.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js` |
| Gcore jsDelivr | `https://gcore.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js` |
| Fastly Origin jsDelivr | `https://originfastly.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js` |
| B-CDN jsDelivr | `https://jsdelivr.b-cdn.net/npm/jquery@3.7.1/dist/jquery.min.js` |
| Omnicrosoft jsDelivr | `https://jsd.omnicrosoft.cn/npm/jquery@3.7.1/dist/jquery.min.js` |
| JSDMirror | `https://cdn.jsdmirror.com/npm/jquery@3.7.1/dist/jquery.min.js` |
| Statically CDN | `https://cdn.statically.io/gh/jquery/jquery-dist/3.7.1/dist/jquery.min.js` |
| cdnjs Cloudflare | `https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js` |
| Custom Mirror | yours to edit |

Built-in mirrors are CDN/static-hosting sources only. Vercel, GitHub Pages,
and other game sites are prohibited as mirrors. The proxy-panel launch nodes
(YukiOS, Nebula, Mizu Math, UnblockZone) are separate user-requested launch
destinations, not mirrors.

### Launch modes

- **`about-blank`** — opens `about:blank` titled **Google Drive** (with a Drive
  favicon mask), then injects a full-viewport iframe for the destination. Runs
  **synchronously inside the click gesture** (`window.open('about:blank',
  '_blank')`, no feature string), because any `setTimeout` before it breaks
  user activation.
- **`new-tab`** — plain `window.open(url, '_blank')`.
- **`same-tab`** — navigates the current window. Games are always mapped to a
  separate tab instead, since games must never navigate the hub away.

If a popup is blocked, the hub never fails silently: it shows a **POPUP
BLOCKED** modal with a working link and a copy button. Allow popups for the
hub's origin if you want one-click launching.

### Managing mirrors

Settings → Routing Gateways: add, edit, remove, enable/disable, set the default,
reorder, and choose a launch mode per mirror. Everything persists to
`localStorage` under `hub_mirrors`.

Retired built-in IDs (`jsdelivr`, `cdnjs`, `mirror-test`, `netlify`, `vercel`,
`cloudflare-pages`) and leftover demo URLs (`example.com`, `httpbin.org`) are
purged automatically on load, so an old profile can't resurrect a dead entry.

---

## Content policy

- **No pirated, cracked, or ROM content**, and no unlicensed code vendored into
  the project.
- Open-source games are **linked, not hosted**, with their license and
  attribution recorded in [`GAMES-LICENSES.md`](GAMES-LICENSES.md).
- The Media catalogs (TV / Movies / Anime) are **title + tier indexes only**.
  Clicking a title offers a *Where to Watch* link to a legal guide plus a
  Wikipedia summary. Nothing is hosted, streamed, or downloaded by the hub.

---

## Accounts

First visit shows a **mandatory, non-dismissable auth gate** — you must log in
or sign up to enter the app.

- Passwords hashed with **PBKDF2-SHA256, 100k iterations, per-user salt** (Web
  Crypto). A non-secure fallback exists only so `file://` still works, and it
  warns when used.
- Sessions are mirrored into `hub_session` / `hub_user` cookies
  (`SameSite=Lax`, `Secure` on https) alongside `localStorage`.
- Accounts live **only in this browser**. This is demo-grade security — do not
  reuse a real password.

**Production auth needs a backend.** Real session security requires server-side
storage with `HttpOnly`/`Secure` cookies; anything in `localStorage` is readable
by any script on the page.

---

## Storage keys

| Key | Contents |
| --- | --- |
| `hub_settings` | theme, accent, launch behaviour, session prefs |
| `hub_mirrors` | launch destinations |
| `hub_games` | game library |
| `hub_collections` | user collections |
| `hub_achievements` | unlocked achievements |
| `hub_launch_history` / `hub_game_stats` | analytics |
| `hub_notes` | tools: notes |
| `hub_session` | session token (localStorage + cookie mirror) |
| IndexedDB `quantum_hub` / `users` | **private account database**: usernames, emails, PBKDF2 password hashes + salts, preferences. Origin-scoped, never synced. Passwords themselves are never stored anywhere. |
| `hub_audio_feedback` | sound preference |

Factory reset lives in Settings → Danger Sector.

---

## Project layout

```
index.html            app shell, 5 panels, dock, auth gate
serve.py              dev server (no-cache + dual-stack)  <- use this
bump_version.py       restamp the ?v= cache-busting version
css/style.css         themes, glassmorphism, cards, modals
js/app.js             GameHubApplication — everything else
js/data/defaults.js   settings, mirrors, games, media, proxy data
js/data/catalog.js    generated TV / Movie / Anime title indexes
js/components/        modal.js, toast.js
mirror-test.html      standalone local launch-test page
GAMES-LICENSES.md     license + attribution notes for linked games
```

## Keyboard

| Key | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `K` | command palette |
| `1`–`5` | switch panel |
| `g` `m` `p` `t` `s` | Games / Media / Proxy / Tools / Settings |
| `Esc` | close modal |
