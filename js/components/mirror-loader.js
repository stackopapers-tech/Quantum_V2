/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * MirrorLoader - Multi-CDN fallback loader
 * 
 * Tries multiple jsDelivr/CDN mirrors sequentially until one succeeds,
 * then injects the HTML into a new window via document.write().
 * 
 * Usage:
 *   const loader = new MirrorLoader(mirrorsArray);
 *   await loader.launchInNewWindow();
 * 
 * @param {string[]} mirrors - Array of mirror URLs (tried in order)
 * @param {Object} options
 *   @param {string} options.target - '_blank' (default) or window name
 *   @param {Function} options.onProgress - Callback(i, total, url) during attempts
 *   @param {Function} options.onSuccess - Callback(win) when loaded
 *   @param {Function} options.onError - Callback(err) when all fail
 */
/**
 * Image-based reachability probe (no CORS needed for <img> load events).
 * Used when fetch is blocked by CORS but the host may still serve iframes.
 */
import { openGameViewer } from './game-viewer.js?v=2026.10.11-4';
import { isMediaUrl, mediaFrameUrl } from './about-blank-launcher.js?v=2026.10.11-4';
export function probeImage(url, timeoutMs = 8000) {
    return new Promise(resolve => {
        let done = false;
        const finish = ok => {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(ok);
        };
        const t = setTimeout(() => finish(false), timeoutMs);
        try {
            const img = new Image();
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = url;
        } catch (e) {
            finish(false);
        }
    });
}

function isNetworkErr(err) {
    if (!err) return true;
    if (err.name === 'TypeError' || err.name === 'AbortError') return true;
    return /abort|fetch|network|cors|failed to fetch|load failed/i.test(err.message || '');
}

/**
 * True when a response body is clearly an HTML document. Combined with a
 * text/plain Content-Type this means the host cannot render the page in an
 * iframe (jsDelivr, Statically and raw.githubusercontent serve .html that
 * way — the browser would only ever show source code).
 */
export function looksLikeHtmlDoc(text) {
    const s = String(text || '').replace(/^\uFEFF/, '').replace(/^\s+/, '').toLowerCase();
    return s.startsWith('<!doctype html') || s.startsWith('<html');
}

export class MirrorLoader {
    constructor(mirrors, options = {}) {
        this.mirrors = mirrors || [];
        this.target = options.target || '_blank';
        this.timeoutMs = options.timeoutMs || 10000;
        this.cacheKey = options.cacheKey || 'hub_working_cdn';
        this._label = options.label || 'Game';
        this.onProgress = options.onProgress || (() => {});
        this.onSuccess = options.onSuccess || (() => {});
        this.onError = options.onError || (() => {});
        this._aborted = false;
        this._win = null;
    }

    /**
     * Abort any in-progress loading
     */
    abort() {
        this._aborted = true;
    }

    /**
     * Launch the first working mirror in a new window
     * @returns {Promise<boolean>} true if any mirror loaded
     */
    async launch() {
        if (this.mirrors.length === 0) {
            throw new Error('No mirrors provided');
        }

        const ordered = this._orderByCache(this.mirrors);
        const failures = [];
        let firstUnknown = null;

        // '_self' = reference behavior (write into current document).
        // '_blank' (default) = stealth popup, opened synchronously to dodge blockers.
        const isSelf = this.target === '_self';
        let win = null;
        if (!isSelf) {
            try {
                win = window.open('about:blank', '_blank');
            } catch (e) { win = null; }
            if (!win) {
                // Popup hard-blocked: fall back to the in-hub viewer so the
                // launch is never a dead end. Caller mirrors still apply.
                try {
                    openGameViewer({ title: this._label, url: this.mirrors[0], mirrors: this.mirrors });
                    this.onSuccess(null, this.mirrors[0]);
                    return true;
                } catch (e) {}
                throw new Error('Popup blocked - cannot open window');
            }
            this._win = win;
            this._showLoading(win, 0, ordered.length, 'Initializing...');
        }

        for (let i = 0; i < ordered.length; i++) {
            if (this._aborted) break;

            const url = ordered[i];
            let host = url;
            try { host = new URL(url).hostname; } catch (e) {}
            this.onProgress(i + 1, ordered.length, url);
            if (win) this._showLoading(win, i + 1, ordered.length, `Trying ${host} (${i + 1}/${ordered.length})...`);

            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
                let resp;
                try {
                    resp = await fetch(url, {
                        method: 'GET',
                        mode: 'cors',
                        credentials: 'omit',
                        cache: 'no-cache',
                        signal: ctrl.signal
                    });
                } finally {
                    clearTimeout(t);
                }

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                const html = await resp.text();
                if (!html || html.length < 50) {
                    throw new Error('Empty response');
                }
                // text/plain HTML can't run in an iframe — treat as a failed
                // host so the loop keeps looking for one that renders.
                const ctype = (resp.headers.get('content-type') || '').toLowerCase();
                if (ctype.indexOf('text/plain') !== -1 && looksLikeHtmlDoc(html)) {
                    throw new Error('host serves html as plain text');
                }

                this._rememberHost(url);
                // Iframe-only: every game renders inside a sandboxed iframe.
                // Direct src (not fetched HTML) keeps relative asset paths working.
                const shell = this._getIframeHTML(url, this._label);
                if (isSelf) {
                    document.open();
                    document.write(shell);
                    document.close();
                    this.onSuccess(null, url);
                } else {
                    win.document.open();
                    win.document.write(shell);
                    win.document.close();
                    this._showSuccess(win, url);
                    this.onSuccess(win, url);
                }
                return true;

            } catch (err) {
                // Network/CORS failure (not an HTTP status): the fetch probe
                // cannot verify, but an iframe needs no CORS — remember as
                // last-resort candidate instead of discarding.
                if (isNetworkErr(err) && !firstUnknown) firstUnknown = url;
                else failures.push(`${host}: ${(err && err.message) || 'failed'}`);
            }
        }

        // No verified mirror, but a host that may still serve iframes.
        if (firstUnknown) {
            const shell = this._getIframeHTML(firstUnknown, this._label);
            if (isSelf) {
                document.open();
                document.write(shell);
                document.close();
                this.onSuccess(null, firstUnknown);
            } else if (win) {
                win.document.open();
                win.document.write(shell);
                win.document.close();
                this._showSuccess(win, firstUnknown);
                this.onSuccess(win, firstUnknown);
            }
            return true;
        }

        // All mirrors failed
        const msg = `All mirrors failed to load (${failures.length}/${ordered.length})`;
        if (win) this._showError(win, msg, failures);
        this.onError(new Error(msg));
        return false;
    }

    _orderByCache(mirrors) {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            if (!cached) return mirrors;
            const idx = mirrors.findIndex(m => {
                try { return new URL(m).hostname === cached; } catch (e) { return false; }
            });
            if (idx <= 0) return mirrors;
            return [mirrors[idx], ...mirrors.slice(0, idx), ...mirrors.slice(idx + 1)];
        } catch (e) {
            return mirrors;
        }
    }

    _rememberHost(url) {
        try {
            localStorage.setItem(this.cacheKey, new URL(url).hostname);
        } catch (e) {}
    }

    /**
     * Inject loading UI into the target window
     */
    _showLoading(win, current, total, message) {
        try {
            win.document.open();
            win.document.write(this._getLoadingHTML(current, total, message));
            win.document.close();
        } catch (e) {
            // Window might be closed or cross-origin
        }
    }

    _showSuccess(win, url) {
        try {
            // Optionally inject a small success indicator
            if (win.document.body) {
                const badge = win.document.createElement('div');
                badge.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;padding:8px 12px;background:#22c55e;color:#000;border-radius:6px;font:12px monospace;';
                badge.textContent = `Loaded: ${new URL(url).hostname}`;
                win.document.body.appendChild(badge);
                setTimeout(() => badge.remove(), 3000);
            }
        } catch (e) {}
    }

    _showError(win, message) {
        try {
            win.document.open();
            win.document.write(this._getErrorHTML(message));
            win.document.close();
        } catch (e) {}
    }

    _hubAccent() {
        // Popup documents can't see hub CSS vars: snapshot the active scheme accent.
        try {
            const raw = localStorage.getItem('hub_settings');
            if (raw) {
                const v = JSON.parse(raw).accentColor;
                if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) return v.trim();
            }
            const css = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            if (/^#[0-9a-fA-F]{6}$/.test(css)) return css;
        } catch (e) {}
        return '#39ff14';
    }

    _getLoadingHTML(current, total, message) {
        const percent = Math.round((current / total) * 100);
        const safe = String(message).replace(/</g, '&lt;');
        const acc = this._hubAccent();
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Quantum • Loading…</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px 'Segoe UI',sans-serif;background:#0b0d12;color:${acc};height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.loader{text-align:center}
.bar{width:300px;height:6px;background:#1a1a3a;border-radius:3px;overflow:hidden;margin:20px auto}
.fill{height:100%;background:${acc};width:${percent}%;transition:width 0.3s}
.spinner{border:3px solid #1a1a3a;border-top-color:${acc};border-radius:50%;width:40px;height:40px;margin:0 auto 20px;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.mirrors{font:11px monospace;color:#666;margin-top:10px}
.cancel{margin-top:16px;padding:8px 16px;background:transparent;color:#666;border:1px solid #333;border-radius:6px;font:12px monospace;cursor:pointer}
</style></head>
<body><div class="loader">
<div class="spinner"></div>
<div class="bar"><div class="fill"></div></div>
<p>${safe}</p>
<p class="mirrors">◈ QUANTUM HUB — Mirror ${current}/${total} (${percent}%)</p>
<button class="cancel" onclick="window.close()">Cancel</button>
</div></body></html>`;
    }

    _getIframeHTML(url, label = 'Game') {
        const safeUrl = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const safeLabel = String(label).replace(/</g, '&lt;');
        const acc = this._hubAccent();
        // Media files route through the local player page (loading + controls).
        let frameSrc = safeUrl;
        if (isMediaUrl(url)) {
            const p = mediaFrameUrl(url, label, acc);
            frameSrc = String(p).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        }
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Quantum • ${safeLabel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#000;overflow:hidden}
iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}
.topbar{position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;gap:10px;padding:6px 12px;background:rgba(0,0,0,.75);color:${acc};font:12px monospace}
.topbar a{color:${acc}}
.topbar button{margin-left:auto;background:transparent;color:#888;border:1px solid #333;border-radius:4px;font:11px monospace;padding:4px 10px;cursor:pointer}
.topbar .vol{width:70px;accent-color:${acc};margin-left:8px}
.wrap{position:fixed;inset:0;padding-top:28px;box-sizing:border-box}
.wm{position:fixed;right:10px;bottom:10px;z-index:10000;font:700 11px monospace;letter-spacing:2px;color:${acc};background:rgba(0,0,0,.55);border:1px solid ${acc};border-radius:6px;padding:4px 8px;pointer-events:none;user-select:none;opacity:.85}
</style></head>
<body>
<div class="topbar"><span>◈ QUANTUM</span><span>${safeLabel}</span><a href="${safeUrl}" target="_blank" rel="noopener">Open directly</a><input class="vol" type="range" min="0" max="100" value="80" title="Volume"><button onclick="window.close()">Close</button></div>
<div class="wrap"><iframe src="${frameSrc}" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allowfullscreen allow="fullscreen; gamepad; autoplay"></iframe></div>
<div class="wm">◈ QUANTUM HUB</div>
<script>(function(){var v=80;try{var s=JSON.parse(localStorage.getItem('hub_settings')||'{}');if(typeof s.volume==='number'&&s.volume>0)v=Math.round(s.volume*100)}catch(e){}
var vol=document.querySelector('.vol'),fr=document.querySelector('iframe');if(!vol||!fr)return;vol.value=v;
function ap(){var nv=vol.value/100;try{fr.contentWindow.postMessage({type:'qvol',v:nv},'*')}catch(e){}
try{var d=fr.contentDocument;if(d)d.querySelectorAll('video,audio').forEach(function(el){try{el.volume=nv}catch(e){}})}catch(e){}}
vol.addEventListener('input',ap);ap();setTimeout(ap,600);setTimeout(ap,1800);setTimeout(ap,4000)})();</script>
</body></html>`;
    }

    _getErrorHTML(message, failures = []) {
        const safe = String(message).replace(/</g, '&lt;');
        const acc = this._hubAccent();
        const list = failures.slice(0, 10).map(f => `<li>${String(f).replace(/</g, '&lt;')}</li>`).join('');
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Quantum • Load Failed</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px 'Segoe UI',sans-serif;background:#0b0d12;color:#ff4444;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px}
.error{max-width:500px}
ul{text-align:left;font:11px monospace;color:#666;max-height:120px;overflow:auto;margin:10px 0}
button{margin-top:20px;padding:12px 24px;background:${acc};color:#000;border:none;border-radius:6px;font:bold 14px monospace;cursor:pointer}
button:hover{filter:brightness(1.15)}
</style></head>
<body><div class="error">
<p style="color:${acc};font:bold 12px monospace;letter-spacing:2px;margin-bottom:10px">◈ QUANTUM HUB</p>
<h2 style="margin-bottom:10px">⚠ Failed to Load</h2>
<p style="color:#888;margin-bottom:10px">${safe}</p>
<ul>${list}</ul>
<p style="color:#666;font-size:12px">All CDN mirrors failed. The game may be unavailable or blocked.</p>
<button onclick="window.close()">Close Window</button>
</div></body></html>`;
    }
}

/**
 * Pre-defined mirror sets for common CDN patterns.
 * Githack-only: raw.githack.com serves GitHub files with proper MIME.
 */
export const UNBLOCKED_HOSTS = [
    'raw.githack.com'
];

// Hosts that speak native jsDelivr /gh/user/repo@version/path (or bare).
const JSDELIVR_HOSTS = new Set([
    'quantil.jsdelivr.net',
    'gcore.jsdelivr.net',
    'originfastly.jsdelivr.net',
    'fastly.jsdelivr.net',
    'testingcf.jsdelivr.net',
    'jsdelivr.b-cdn.net',
    'jsd.onmicrosoft.cn',
    'cdn.jsdmirror.com'
]);

/**
 * Split a jsDelivr gh URL into { user, repo, version, path }.
 * version is '' when the URL has no @version (bare = default branch).
 */
export function splitGhUrl(ghUrl) {
    const m = String(ghUrl).match(/^https:\/\/[^/]+\/gh\/([^/]+)\/([^/@]+)(?:@([^/]+))?\/(.*)$/);
    if (!m) return null;
    return { user: m[1], repo: m[2], version: m[3] || '', path: m[4] };
}

/**
 * Map a jsDelivr @version token to a plain branch/tag for hosts that
 * need branch form (statically, githack). 'latest'/'' -> 'main',
 * commit hashes and branch/tag names pass through untouched.
 */
export function branchOf(version) {
    if (!version || version === 'latest') return 'main';
    return version;
}

function buildForHost(host, parts) {
    const { user, repo, version, path } = parts;
    if (host === 'raw.githack.com') {
        return `https://raw.githack.com/${user}/${repo}/${branchOf(version)}/${path}`;
    }
    return null;
}

export function expandUnblockedMirrors(quantilUrl) {
    const parts = splitGhUrl(quantilUrl);
    if (!parts) return [quantilUrl];
    // Githack-only: single translated host, branch form.
    return [buildForHost('raw.githack.com', parts)].filter(Boolean);
}

/* ---------- GitHack-everywhere: URL → raw.githack.com rewrites ---------- */
// raw.githack.com serves GitHub files with proper MIME + CORS (iframe-safe).
// Confident rewrites only — the branch is known from the URL itself, so these
// are safe to use as the primary launch address. Non-GitHub URLs return []
// and must open unchanged (githack cannot host them).
export function githackCandidates(url) {
    const u = String(url || '').trim();
    const out = [];
    const push = (p) => {
        const h = 'https://raw.githack.com/' + p;
        if (out.indexOf(h) === -1) out.push(h);
    };
    if (!/^https?:\/\//i.test(u)) return out;

    // Already on githack (rawcdn is the same service's CDN host).
    if (/^https:\/\/raw\.githack\.com\//i.test(u)) return [u];
    if (/^https:\/\/rawcdn\.githack\.com\//i.test(u)) return [u.replace(/^https:\/\/rawcdn\.githack\.com/i, 'https://raw.githack.com')];

    let m = u.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.*)$/i);
    if (m) { push(`${m[1]}/${m[2]}/${m[3]}/${m[4]}`); return out; }

    m = u.match(/^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(?:blob|raw)\/([^/?#]+)\/(.*)$/i);
    if (m) { push(`${m[1]}/${m[2]}/${m[3]}/${m[4]}`); return out; }

    m = u.match(/^https?:\/\/cdn\.statically\.io\/gh\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.*)$/i);
    if (m) { push(`${m[1]}/${m[2]}/${m[3]}/${m[4]}`); return out; }

    const gh = splitGhUrl(u); // any jsDelivr-style /gh/user/repo@ver/path host
    if (gh) { push(`${gh.user}/${gh.repo}/${branchOf(gh.version)}/${gh.path}`); return out; }

    return out;
}

// *.github.io Pages URLs don't reveal their branch, so main + master are both
// offered. These are appended as extra mirror OPTIONS (never the primary),
// because a wrong guess 404s — the viewer's probe skips those quickly.
export function githackUrlGuesses(url) {
    const u = String(url || '').trim();
    const m = u.match(/^https?:\/\/([a-z0-9-]+)\.github\.io(?:\/(.*))?$/i);
    if (!m) return [];
    const user = m[1];
    let rest = (m[2] || '').replace(/[?#].*$/, '');
    if (rest && /\/$/.test(rest)) rest += 'index.html';
    if (!rest) rest = 'index.html';

    const variants = [];
    const segs = rest.split('/');
    if (segs.length > 1) variants.push([segs[0], segs.slice(1).join('/')]);
    variants.push([`${user}.github.io`, rest]);

    const out = [];
    for (const v of variants) {
        for (const br of ['main', 'master']) {
            const h = `https://raw.githack.com/${user}/${v[0]}/${br}/${v[1]}`;
            if (out.indexOf(h) === -1) out.push(h);
        }
    }
    return out;
}

/* ---------- Multi-CDN mirror chain: hosts that can actually RENDER a game.

   Verified live from this network (fetch + iframe):
     1. raw.githack.com    — 200, text/html, CORS=*  (leads the list)
     2. rawcdn.githack.com — same service on Cloudflare: 200, text/html, CORS=*
   Every other GitHub proxy (jsDelivr + its edges, Statically,
   raw.githubusercontent) answers .html files with `text/plain`, which an
   iframe can only ever display as source code — those hosts are NOT offered
   for game entries anymore. The server relay (/relay/raw/…) is appended by
   the launch pools as the browser-network-independent fallback (it fetches
   server-side, repairs the MIME and relays every relative asset).

   Confident rewrites only (branch/tag known from the URL itself); non-GitHub
   URLs return [] and must open unchanged. */

// Split ANY GitHub-family URL into { user, repo, version, path }.
function githubParts(url) {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return null;

    // raw.githack.com / rawcdn.githack.com / raw.githubusercontent.com
    let m = u.match(/^https?:\/\/(?:raw\.githack\.com|rawcdn\.githack\.com|raw\.githubusercontent\.com)\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.*)$/i);
    if (m) return { user: m[1], repo: m[2], version: m[3], path: m[4].replace(/[?#].*$/, '') };

    // github.com/<user>/<repo>/(blob|raw)/<branch>/<path>
    m = u.match(/^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(?:blob|raw)\/([^/?#]+)\/(.*)$/i);
    if (m) return { user: m[1], repo: m[2], version: m[3], path: m[4].replace(/[?#].*$/, '') };

    // cdn.statically.io/gh/<user>/<repo>/<branch>/<path>
    m = u.match(/^https?:\/\/cdn\.statically\.io\/gh\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.*)$/i);
    if (m) return { user: m[1], repo: m[2], version: m[3], path: m[4].replace(/[?#].*$/, '') };

    // any jsDelivr-style <host>/gh/<user>/<repo>[@version]/<path>
    const gh = splitGhUrl(u);
    if (gh) return { user: gh.user, repo: gh.repo, version: branchOf(gh.version), path: gh.path };

    return null;
}

/**
 * Hosted-site mirrors: sites that aren't GitHub-hosted but have a PUBLIC repo
 * twin, so they get real mirror candidates too (verified 2026-10-04):
 * - 55gms.com serves its whole site from github.com/55gms/55GMS under static/
 *   with a 1:1 path mapping (100/100 catalog paths hit) → real githack URLs.
 * - unblockedgames66.gitlab.io publishes EACH game as its own GitLab project
 *   (namespace/<slug>/main/index.html — 12/12 spot checks). GitLab raw serves
 *   text/plain, so those candidates go through the server relay, which
 *   repairs the MIME and streams every relative asset.
 * Builds from the URL's PATH only — no invented filenames: a wrong guess
 * 404s at probe time and the chain falls through like any other mirror. */
const HOSTED_SITE_MIRRORS = {
    // The relay of the LIVE page leads: root-relative assets (/assets/…,
    // /misc/…) resolve against 55gms.com through the relay with framing
    // headers stripped — it renders exactly like the site, every time.
    // Behind it sit real githack candidates: the play wrappers' inner game
    // (misc/play/X.html → static/misc/X/index.html, probe skips the guess
    // when a folder name doesn't line up, e.g. adcap → adventure-capitalist)
    // and the repo copy of the page itself — both direct githack URLs the
    // dropdown offers (and the probe takes whenever the relay/site is
    // unreachable). Wrapper pages with root-relative refs render unstyled
    // on direct githack, which is why they never lead.
    '55gms.com': (path) => {
        const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
        const out = [];
        const githack = (f) => [
            `https://raw.githack.com/55gms/55GMS/main/${f}`,
            `https://rawcdn.githack.com/55gms/55GMS/main/${f}`,
        ];
        let p = String(path || '').replace(/^\/+/, '');
        if (origin) out.push(`${origin}/relay/raw/https://55gms.com/${p}`);
        const m = p.match(/^(.*\/)?play\/([^/]+)\.html$/i);
        if (m) out.push(...githack(`static/${m[1] || ''}${m[2]}/index.html`));
        if (!p) p = 'index.html';
        out.push(...githack(p.endsWith('/') ? `static/${p}index.html` : `static/${p}`));
        return out;
    },
    'unblockedgames66.gitlab.io': (path) => {
        const slug = String(path || '').replace(/^\/+/, '').split('/')[0] || '';
        if (!slug || slug.indexOf('.') !== -1) return [];
        const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
        if (!origin) return [];
        return [`${origin}/relay/raw/https://gitlab.com/unblockedgames66/${slug}/-/raw/main/index.html`];
    },
};

function hostedSiteCandidates(url) {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return [];
    let host = '', path = '';
    try { const p = new URL(u); host = p.hostname.toLowerCase(); path = p.pathname; } catch (e) { return []; }
    if (host.startsWith('www.')) host = host.slice(4);
    const build = HOSTED_SITE_MIRRORS[host];
    if (!build) return [];
    return build(path).filter(Boolean);
}

/**
 * Full confident mirror set for a GitHub-family URL — the two githack hosts
 * (the only ones that serve html as text/html). Returns [] for anything that
 * isn't GitHub-hosted or in the hosted-site table above — those URLs open
 * unchanged.
 */
export function mirrorCandidates(url) {
    const hosted = hostedSiteCandidates(url);
    if (hosted.length) return hosted;
    const p = githubParts(url);
    if (!p) return [];
    const path = p.path || 'index.html';
    const v = p.version || 'main';
    const list = [
        `https://raw.githack.com/${p.user}/${p.repo}/${v}/${path}`,
        `https://rawcdn.githack.com/${p.user}/${p.repo}/${v}/${path}`,
    ];
    // No self-filter: the launch pools dedupe (so the original URL joins the
    // chain in place), and keeping both hosts here guarantees raw.githack.com
    // always leads the list — even when the original URL was already githack.
    return list;
}

/**
 * Branch-unknowable *.github.io URLs: main + master, each on the two githack
 * hosts (the only ones serving html as text/html). Grouped branch-first (all
 * main guesses before master) and appended as trailing OPTIONS only — a wrong
 * guess 404s fast and the viewer's probe skips it.
 */
export function mirrorUrlGuesses(url) {
    const u = String(url || '').trim();
    const m = u.match(/^https?:\/\/([a-z0-9-]+)\.github\.io(?:\/(.*))?$/i);
    if (!m) return [];
    const user = m[1];
    let rest = (m[2] || '').replace(/[?#].*$/, '');
    if (rest && /\/$/.test(rest)) rest += 'index.html';
    if (!rest) rest = 'index.html';

    const variants = [];
    const segs = rest.split('/');
    if (segs.length > 1) variants.push([segs[0], segs.slice(1).join('/')]);
    variants.push([`${user}.github.io`, rest]);

    const builders = [
        (repo, br, p) => `https://raw.githack.com/${user}/${repo}/${br}/${p}`,
        (repo, br, p) => `https://rawcdn.githack.com/${user}/${repo}/${br}/${p}`,
    ];
    const out = [];
    for (const br of ['main', 'master']) {
        for (const v of variants) {
            for (const mk of builders) {
                const h = mk(v[0], br, v[1]);
                if (out.indexOf(h) === -1) out.push(h);
            }
        }
    }
    return out;
}


export const MIRROR_SETS = {
    jsdelivr: (user, repo, path = 'index.html', version = 'main') => [
        `https://raw.githack.com/${user}/${repo}/${version}/${path}`
    ],

    // For GitHub-hosted game mirrors.
    github: (repo = 's0n-1m-cr1n3/sc13nc3', path = 'assets/index.html', version = 'main') => [
        `https://raw.githack.com/${repo}/${version}/${path}`
    ],
};

/**
 * Site bootstrap mirror (githack-only).
 */
export const UNBLOCKED_SITE_MIRRORS = [
    'https://raw.githack.com/s0n-1m-cr1n3/sc13nc3/main/assets/index.html'
];

/**
 * Probe mirrors and return the first reachable one without opening windows.
 * Used by the in-page viewer so the iframe src is set to a working host.
 * @param {string[]} mirrors
 * @param {Object} options - { timeoutMs, onProbe(i, total, url) }
 * @returns {Promise<{url: string, index: number} | null>}
 */
export async function probeFirstReachable(mirrors, options = {}) {
    const timeoutMs = options.timeoutMs || 10000;
    const onProbe = options.onProbe || (() => {});
    // Optional same-host image to verify hosts whose fetch is CORS-blocked.
    const imageUrl = options.imageUrl || null;
    let firstUnknown = null;
    const hostOf = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
    for (let i = 0; i < mirrors.length; i++) {
        onProbe(i, mirrors.length, mirrors[i]);
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), timeoutMs);
            let resp;
            try {
                resp = await fetch(mirrors[i], {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit',
                    cache: 'no-cache',
                    signal: ctrl.signal
                });
            } finally {
                clearTimeout(t);
            }
            if (!resp.ok) continue;
            const html = await resp.text();
            if (!html || html.length < 50) continue;
            // text/plain HTML cannot execute in an iframe — skip hosts that
            // serve .html as source code; keep looking for one that renders
            // (githack, rawcdn) or the relay fallback at the end.
            const ct = (resp.headers.get('content-type') || '').toLowerCase();
            if (ct.indexOf('text/plain') !== -1 && looksLikeHtmlDoc(html)) continue;
            return { url: mirrors[i], index: i, verified: true };
        } catch (e) {
            if (!isNetworkErr(e)) continue; // real HTTP-level failure
            if (imageUrl && hostOf(imageUrl) === hostOf(mirrors[i])) {
                const ok = await probeImage(imageUrl, timeoutMs);
                if (ok) return { url: mirrors[i], index: i, verified: true };
            }
            if (!firstUnknown) firstUnknown = { url: mirrors[i], index: i, verified: false };
        }
    }
    return firstUnknown;
}

/**
 * Convenience function: launch a game via mirror fallback
 * @param {string[]} mirrors - Mirror URLs
 * @param {Object} options - Same as MirrorLoader constructor
 * @returns {Promise<Window|null>} The opened window or null if failed
 */
export async function launchViaMirrors(mirrors, options = {}) {
    const loader = new MirrorLoader(mirrors, options);
    const success = await loader.launch();
    return success ? loader._win : null;
}

export default MirrorLoader;