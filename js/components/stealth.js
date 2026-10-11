/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * QuantumStealth - classroom-stealth layer (adapted from UnblockedZone ideas,
 * reimplemented offline-safe: no analytics, no external fetches, no eval).
 *
 *  - Tab cloaking: presets + custom title/favicon, persisted, restored on boot.
 *  - Panic key: user-captured combo -> instant redirect to a safe URL.
 *  - Hidden-tab cover: neutral fullscreen cover while tab is hidden.
 *  - Performance mode: kills animations/particles for weak Chromebooks.
 *
 * Self-initializes on import. Exposes window.QuantumStealth for settings UI.
 */

const LS = {
    preset: 'qstealth.cloakPreset',
    title: 'qstealth.cloakTitle',
    favicon: 'qstealth.cloakFavicon',
    panicOn: 'qstealth.panicEnabled',
    panicKey: 'qstealth.panicKey',
    panicUrl: 'qstealth.panicUrl',
    coverOn: 'qstealth.coverEnabled',
    coverPreset: 'qstealth.coverPreset',
    perf: 'qstealth.perfMode',
};

function lsGet(k, fb = null) {
    try {
        const v = localStorage.getItem(k);
        return v === null ? fb : v;
    } catch (e) { return fb; }
}
function lsSet(k, v) {
    try {
        if (v === null || v === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
    } catch (e) {}
}

const CLOAK_PRESETS = {
    classroom: { title: 'Home - Classroom', letter: 'C', color: '#0d6529' },
    drive: { title: 'My Drive - Google Drive', letter: 'D', color: '#188038' },
    docs: { title: 'Untitled document - Google Docs', letter: 'D', color: '#1a73e8' },
    gmail: { title: 'Inbox - Gmail', letter: 'M', color: '#d93025' },
    youtube: { title: 'YouTube', letter: 'Y', color: '#ff0000' },
    google: { title: 'Google', letter: 'G', color: '#1a73e8' },
    newtab: { title: 'New Tab', letter: '+', color: '#5f6368' },
    khan: { title: 'Khan Academy | Free Online Courses', letter: 'K', color: '#1865f2' },
};

function svgFavicon(letter, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">`
        + `<rect width="16" height="16" rx="3" fill="${color}"/>`
        + `<text x="8" y="12" text-anchor="middle" font-size="11" font-family="Arial,sans-serif" font-weight="bold" fill="white">${letter}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function setFavicon(url) {
    try {
        document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = url;
        document.head.appendChild(link);
    } catch (e) {}
}

export function applyCloakPreset(name) {
    const p = CLOAK_PRESETS[name];
    if (!p) return false;
    document.title = p.title;
    setFavicon(svgFavicon(p.letter, p.color));
    lsSet(LS.preset, name);
    lsSet(LS.title, null);
    lsSet(LS.favicon, null);
    return true;
}

export function applyCustomCloak(title, faviconUrl) {
    let changed = false;
    if (title && title.trim()) {
        document.title = title.trim();
        lsSet(LS.title, title.trim());
        lsSet(LS.preset, null);
        changed = true;
    }
    if (faviconUrl && faviconUrl.trim()) {
        setFavicon(faviconUrl.trim());
        lsSet(LS.favicon, faviconUrl.trim());
        changed = true;
    }
    return changed;
}

export function resetCloak() {
    lsSet(LS.preset, null);
    lsSet(LS.title, null);
    lsSet(LS.favicon, null);
    document.title = 'Quantum Launcher | Game & Media Hub';
    setFavicon(svgFavicon('Q', '#39ff14'));
}

export function restoreCloak() {
    const customTitle = lsGet(LS.title, null);
    const customFav = lsGet(LS.favicon, null);
    const preset = lsGet(LS.preset, null);
    if (customTitle) document.title = customTitle;
    else if (preset && CLOAK_PRESETS[preset]) document.title = CLOAK_PRESETS[preset].title;
    if (customFav) setFavicon(customFav);
    else if (preset && CLOAK_PRESETS[preset]) {
        const p = CLOAK_PRESETS[preset];
        setFavicon(svgFavicon(p.letter, p.color));
    }
}

export function cloakState() {
    return {
        preset: lsGet(LS.preset, null),
        title: lsGet(LS.title, null) || '',
        favicon: lsGet(LS.favicon, null) || '',
        presets: Object.fromEntries(Object.entries(CLOAK_PRESETS).map(([k, v]) => [k, v.title])),
    };
}

/* --- Panic key --- */

function comboLabel(combo) {
    const map = { Backquote: '`', Escape: 'Esc', Control: 'Ctrl', Meta: 'Win', ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    return String(combo).split('+').map(p => map[p] || p).join(' + ');
}

let captureHandler = null;
export function isPanicEnabled() { return lsGet(LS.panicOn, '0') === '1'; }
export function setPanicEnabled(on) { lsSet(LS.panicOn, on ? '1' : '0'); }
export function getPanicKey() { return lsGet(LS.panicKey, 'Backquote'); }
export function getPanicUrl() { return lsGet(LS.panicUrl, 'https://www.google.com'); }
export function setPanicUrl(url) { if (url && url.trim()) lsSet(LS.panicUrl, url.trim()); }
export function panicLabel() { return comboLabel(getPanicKey()); }

export function capturePanicKey(onCaptured) {
    if (captureHandler) {
        window.removeEventListener('keydown', captureHandler, true);
        captureHandler = null;
    }
    captureHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
            window.removeEventListener('keydown', captureHandler, true);
            captureHandler = null;
            if (onCaptured) onCaptured(null);
            return;
        }
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        const parts = [];
        if (e.ctrlKey) parts.push('Control');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Meta');
        parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        const combo = parts.join('+');
        lsSet(LS.panicKey, combo);
        window.removeEventListener('keydown', captureHandler, true);
        captureHandler = null;
        if (onCaptured) onCaptured(combo);
    };
    window.addEventListener('keydown', captureHandler, true);
}

function panicMatches(e) {
    const spec = String(getPanicKey() || '').trim().toLowerCase();
    if (!spec) return false;
    const parts = spec.split('+').map(s => s.trim());
    const keyPart = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    if ((mods.includes('control')) !== e.ctrlKey) return false;
    if ((mods.includes('alt')) !== e.altKey) return false;
    if ((mods.includes('shift')) !== e.shiftKey) return false;
    if ((mods.includes('meta')) !== e.metaKey) return false;
    return String(e.key).toLowerCase() === keyPart;
}

/* --- Hidden-tab cover --- */

const COVER_PRESETS = {
    classroom: { title: 'Google Classroom', sub: 'Loading your classes…' },
    docs: { title: 'Google Docs', sub: 'Loading document…' },
    drive: { title: 'Google Drive', sub: 'Loading files…' },
    // Filter block-page decoys (sc13nc3-style): a teacher glancing over sees
    // the school filter itself, not a loading screen. Rendered from the
    // `block` markup below — zero external requests, works offline.
    goguardian: { block: 'goguardian' },
    securly: { block: 'securly' },
};

const LOCK_SVG = '<svg viewBox="0 0 24 24" width="54" height="70" aria-hidden="true"><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#595959" stroke-width="2.6" fill="none"/><rect x="5" y="10" width="14" height="10" rx="2" fill="#595959"/></svg>';

let coverEl = null;
function ensureCover() {
    if (coverEl) return coverEl;
    coverEl = document.createElement('div');
    coverEl.id = 'qstealth-cover';
    coverEl.innerHTML = '<div class="qstealth-cover-box"><div class="qstealth-cover-title"></div><div class="qstealth-cover-sub"></div></div>' +
        '<div class="qstealth-block" hidden>' +
        '<div class="qb-gg" hidden><div class="qb-gg-card"><div class="qb-gg-title">Page Blocked by School Admin</div>' +
        LOCK_SVG +
        '<h1 class="qb-gg-msg">This page has been blocked by your school.</h1>' +
        '<p class="qb-gg-foot">All attempts are logged.</p></div></div>' +
        '<div class="qb-sc" hidden><div class="qb-sc-inner"><div class="qb-sc-logo">securly</div>' +
        '<h1 class="qb-sc-head">Looks like this page isn\'t allowed</h1>' +
        '<p class="qb-sc-msg">This page has been blocked.</p>' +
        '<div class="qb-sc-details"><h2>Blocking details</h2>' +
        '<div class="qb-sc-row"><span>URL: </span><span class="qb-sc-url"></span></div>' +
        '<div class="qb-sc-row"><span>Reason: </span><span>Education Material</span></div>' +
        '<div class="qb-sc-row"><span>Policy: </span><span>Base/Default Policy</span></div>' +
        '<div class="qb-sc-row"><span>Date and time: </span><span class="qb-sc-date"></span></div>' +
        '<div class="qb-sc-row"><span>Filtering methods: </span><span>DNS</span></div>' +
        '</div></div></div>' +
        '</div>';
    document.body.appendChild(coverEl);
    return coverEl;
}
export function isCoverEnabled() { return lsGet(LS.coverOn, '0') === '1'; }
export function setCoverEnabled(on) { lsSet(LS.coverOn, on ? '1' : '0'); syncCover(); }
export function getCoverPreset() { return lsGet(LS.coverPreset, 'classroom'); }
export function setCoverPreset(name) {
    if (!COVER_PRESETS[name]) name = 'classroom';
    lsSet(LS.coverPreset, name);
    syncCover(true);
}
function syncCover(forceText = false) {
    const el = ensureCover();
    const name = getCoverPreset();
    const p = COVER_PRESETS[name] || COVER_PRESETS.classroom;
    const box = el.querySelector('.qstealth-cover-box');
    const block = el.querySelector('.qstealth-block');
    if (p.block) {
        box.hidden = true;
        block.hidden = false;
        block.querySelector('.qb-gg').hidden = p.block !== 'goguardian';
        const sc = block.querySelector('.qb-sc');
        sc.hidden = p.block !== 'securly';
        if (p.block === 'securly') {
            const u = sc.querySelector('.qb-sc-url');
            if (u) u.textContent = location.hostname || 'this site';
            const d = sc.querySelector('.qb-sc-date');
            if (d) {
                const now = new Date();
                const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                d.textContent = `${wd} ${mm}/${dd}/${String(now.getFullYear()).slice(-2)}`;
            }
        }
    } else {
        block.hidden = true;
        box.hidden = false;
        if (forceText || el.dataset.preset !== name) {
            el.querySelector('.qstealth-cover-title').textContent = p.title;
            el.querySelector('.qstealth-cover-sub').textContent = p.sub;
        }
    }
    el.dataset.preset = name;
    el.dataset.block = p.block || '';
    const show = isCoverEnabled() && document.hidden;
    el.classList.toggle('visible', show);
}

/* --- Performance mode --- */

export function isPerfMode() {
    try {
        if (window.__perfMode === true) return true;
        return lsGet(LS.perf, '0') === '1';
    } catch (e) { return false; }
}
export function setPerfMode(on) {
    on = !!on;
    window.__perfMode = on;
    lsSet(LS.perf, on ? '1' : '0');
    document.documentElement.classList.toggle('perf-mode', on);
    if (on && typeof window.__stopParticles === 'function') {
        try { window.__stopParticles(); } catch (e) {}
    }
}

function init() {
    restoreCloak();
    if (isPerfMode()) {
        window.__perfMode = true;
        document.documentElement.classList.add('perf-mode');
    }
    ensureCover();
    syncCover(true);
    document.addEventListener('visibilitychange', () => syncCover());
    window.addEventListener('keydown', (e) => {
        if (!isPanicEnabled() || captureHandler) return;
        if (!panicMatches(e)) return;
        e.preventDefault();
        try { window.__panicBypass = true; } catch (err) {}
        window.location.href = getPanicUrl();
    });
}

init();

window.QuantumStealth = {
    applyCloakPreset, applyCustomCloak, resetCloak, restoreCloak, cloakState,
    isPanicEnabled, setPanicEnabled, getPanicKey, getPanicUrl, setPanicUrl,
    panicLabel, capturePanicKey,
    isCoverEnabled, setCoverEnabled, getCoverPreset, setCoverPreset,
    isPerfMode, setPerfMode,
    presets: CLOAK_PRESETS, coverPresets: COVER_PRESETS,
};
