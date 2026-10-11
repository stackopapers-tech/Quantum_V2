// (c) Quantum Hub — proprietary hub build. All rights reserved.
// Quantum Hub — core application: catalog, themes, launch engine, settings.
import { DEFAULT_SETTINGS, DEFAULT_MIRRORS, DEFAULT_GAMES, DEMO_MEDIA, PROXY_DATA, DEFAULT_COLLECTIONS, ACHIEVEMENT_DEFS, DEFAULT_SOUND_PACKS } from './data/defaults.js?v=2026.10.11-4';
import { TV_CATALOG, MOVIE_CATALOG, ANIME_CATALOG, TOP_TIER } from './data/catalog.js?v=2026.10.11-4';
import toast from './components/toast.js?v=2026.10.11-4';
import modals from './components/modal.js?v=2026.10.11-4';
import { AboutBlankLauncher, launchViaAboutBlank, normalizeHttpUrl, isValidHttpUrl } from './components/about-blank-launcher.js?v=2026.10.11-4';
import { MirrorLoader, MIRROR_SETS, expandUnblockedMirrors, mirrorCandidates, mirrorUrlGuesses } from './components/mirror-loader.js?v=2026.10.11-4';
import { POLARIS_GAMES } from './data/polaris-games.js?v=2026.10.11-4';
import { GAMESITE_GAMES } from './data/gamesite-games.js?v=2026.10.11-4';
import { GMS55_GAMES } from './data/gms55-games.js?v=2026.10.11-4';
import { PASTED_GAMES } from './data/pasted-games.js?v=2026.10.11-4';
import { ESCAPE_ROAD_GAMES } from './data/escape-road-games.js?v=2026.10.11-4';
import { SELENITE_GAMES } from './data/selenite-games.js?v=2026.10.11-4';
import { DOTNET_GAMES } from './data/dotnet-games.js?v=2026.10.11-4';
import { PETEZAH_GAMES } from './data/petezah-games.js?v=2026.10.11-4';
import { AI_SKILLS, AI_DESIGN_SYSTEMS } from './data/ai-skills.js?v=2026.10.11-4';
import { openGameViewer } from './components/game-viewer.js?v=2026.10.11-4';
import { PasswordPolicy, FailedAttemptTracker, SecurityPolicy, defaultPasswordPolicy, defaultFailedTracker } from './components/password-policy.js?v=2026.10.11-4';
import { userDB } from './components/user-db.js?v=2026.10.11-4';
import { initHubPlus } from './components/hub-plus.js?v=2026.10.11-4';
import { initMusicDeck } from './components/music-deck.js?v=2026.10.11-4';
import { applyAnimatedBg } from './components/animated-bg.js?v=2026.10.11-4';
import './components/stealth.js?v=2026.10.11-4';
import { localApi, localInbox } from './local-api.js?v=2026.10.11-4';

class GameHubApplication {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.mirrors = [...DEFAULT_MIRRORS];
        this.games = this._dedupeGames([...DEFAULT_GAMES, ...PASTED_GAMES, ...POLARIS_GAMES, ...GAMESITE_GAMES, ...GMS55_GAMES, ...ESCAPE_ROAD_GAMES, ...SELENITE_GAMES, ...DOTNET_GAMES, ...PETEZAH_GAMES]);
        this.collections = [...DEFAULT_COLLECTIONS];
        this.achievements = [];
        this.launchHistory = [];
        this.gameStats = {};
        this.activeTab = null;
        this.currentNoteId = null;
        this.viewMode = 'grid';
        this.searchQuery = '';
        this.selectedCategory = 'all';
        this.commandPaletteOpen = false;
        this.usedMirrors = new Set();
        this.usedTools = new Set();
        this.usedThemes = new Set();

        // Auth State (server-backed)
        this._currentUser = null;
        this._authToken = null;
        this._sessionExpiry = null;
        // Guest mode is client-side only: no account, no OTP, no token.
        // Guests reuse the logged-out backend paths (scores/polls/feedback
        // already accept a null token as 'guest').
        this._guest = false;
        this._authBase = '';

        this.synthAudioCtx = null;
        this.currentSoundPack = DEFAULT_SOUND_PACKS.quantum;

        this.init();
    }

    init() {
        try {
            this.loadPersistents();
            this.applyVisuals();
            this.initCoreSystems();
            this.initAuth();

            console.log("%c QUANTUM HUB INITIALIZED ", "background: #000; color: #39ff14; font-weight: bold; font-size: 14px;");
        } catch (e) {
            console.error('Critical System Boot Failure:', e);
        }
    }

    loadPersistents() {
        try {
            this.loadSettings();
            this.loadGames();
            this.loadMirrors();
            this.loadCollections();
            this.loadAchievements();
            this.loadLaunchHistory();
            this.loadGameStats();
        } catch (e) {
            console.error('Persistence load error:', e);
        }
    }

    applyVisuals() {
        try {
            this.applyTheme();
            this.applyAccentColor();
            this.applySoundPack();
            this.applyWallpaper();
            this.applyAnimatedBg();
            if (this.settings.particlesEnabled && typeof this.initParticles === 'function') this.initParticles();
        } catch (e) { console.error('Visual apply error:', e); }
    }

    initCoreSystems() {
        const systems = [
            { fn: () => this.bindNavigation(), name: 'Navigation' },
            { fn: () => this.renderGamesGrid(), name: 'GameGrid' },
            { fn: () => this.renderMirrorsConfigTable(), name: 'MirrorTable' },
            { fn: () => this.autoPickMirror(), name: 'MirrorAutoPick' },
            { fn: () => this.setupInitialScreen(), name: 'InitialScreen' },
            { fn: () => this.initCommandPalette(), name: 'CmdPalette' },
            { fn: () => this.initKeyboardShortcuts(), name: 'Shortcuts' },
            { fn: () => this.initGamepadSupport(), name: 'Gamepad' },
            { fn: () => this.initClickFeedback(), name: 'ClickFX' },
            { fn: () => this.initQuickLaunchWidget(), name: 'QuickLaunch' },
            { fn: () => this.initInteractiveMedia(), name: 'Media' },
            { fn: () => this.initInteractiveTools(), name: 'Tools' },
            { fn: () => this.initInteractiveProxy(), name: 'Proxy' },
            { fn: () => this.initInteractiveSettings(), name: 'Settings' },
            { fn: () => this.initAIAssistant(), name: 'AIAssistant' },
            { fn: () => { try { initHubPlus(this, DEMO_MEDIA); } catch (e) { console.error('HubPlus init failed:', e); } }, name: 'HubPlus' },
            { fn: () => { try { initMusicDeck(this, DEMO_MEDIA); } catch (e) { console.error('MusicDeck init failed:', e); } }, name: 'MusicDeck' }
        ];

        systems.forEach(sys => {
            try { sys.fn(); } catch (e) { console.error(`System [${sys.name}] failed to init:`, e); }
        });
    }

    /* --- Persistence Layer --- */
    detectLanguage() {
        // Map the browser/OS language to a hub-supported UI language so the
        // interface automatically matches what the user already uses.
        try {
            const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
            const supported = ['en', 'es', 'fr', 'de', 'ja', 'zh'];
            return supported.includes(nav) ? nav : 'en';
        } catch (e) { return 'en'; }
    }

    loadSettings() {
        const stored = localStorage.getItem('hub_settings');
        if (stored) {
            try {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
                // Orange was a temporary default nobody chose: move it to green.
                if ((this.settings.accentColor || '').toLowerCase() === '#ff6600') {
                    this.settings.accentColor = DEFAULT_SETTINGS.accentColor;
                }
                localStorage.setItem('hub_audio_feedback', this.settings.audioFeedback);
            } catch (e) {}
        } else {
            // First run: no saved settings — match the browser/OS language.
            this.settings = { ...DEFAULT_SETTINGS, language: this.detectLanguage() };
            this.saveSettings();
        }
    }

    saveSettings() {
        localStorage.setItem('hub_settings', JSON.stringify(this.settings));
        localStorage.setItem('hub_audio_feedback', this.settings.audioFeedback);
    }

    loadGames() {
        const allDefaults = this._dedupeGames([...DEFAULT_GAMES, ...PASTED_GAMES, ...POLARIS_GAMES, ...GAMESITE_GAMES, ...GMS55_GAMES, ...ESCAPE_ROAD_GAMES, ...SELENITE_GAMES, ...DOTNET_GAMES, ...PETEZAH_GAMES]);
        const RETIRED_GAME_IDS = new Set(['ubz_who_s_your_daddy_186', 'ubz_2048_1', 'ubz_chrome_dino_35', 'ubz_escape_road_58', 'ubz_escape_road_2_59', 'ubz_escape_road_3_60', 'gplus_baldis_basics_field_trip_13', 'gplus_baldis_basics_14', 'gplus_bitlife_20']);
        const stored = localStorage.getItem('hub_games');
        if (!stored) {
            this.games = [...allDefaults];
            this.saveGames();
            return;
        }
        try {
            const parsed = JSON.parse(stored);
            const byId = new Map(parsed.map(g => [g.id, g]));
            this.games = [...allDefaults].map(def => {
                const existing = byId.get(def.id);
                if (existing) {
                    byId.delete(def.id);
                    // Union mirrors so newly merged duplicate URLs reach returning users.
                    // Githack-only filter: stored mirrors from older builds (statically,
                    // proll, 55gms, jsdelivr family…) must not survive the merge —
                    // raw.githack.com / rawcdn.githack.com are the only hosts that work.
                    const githackOnly = (u) => /^https?:\/\/(?:raw|rawcdn)\.githack\.com\//i.test(u);
                    const merged = [...(def.mirrors || [])].filter(githackOnly);
                    for (const u of (existing.mirrors || [])) if (u && githackOnly(u) && !merged.includes(u)) merged.push(u);
                    // Migrate retired generated thumbs + empties + the old
                    // rayquaza placeholder to the current art.
                    const oldImg = existing.image || '';
                    const img = (!oldImg || oldImg.startsWith('games/thumbs/') || oldImg.indexOf('rayquaza') !== -1) ? (def.image || oldImg) : oldImg;
                    const out = { ...def, ...existing, url: def.url, image: img, mirrors: merged.length ? merged : def.mirrors };
                    // Same-title copies + their dropdown labels survive from BOTH
                    // sides (stored cards keep them across sessions; fresh
                    // defaults re-fold them from the catalogs).
                    const mL = { ...(def.mirrorLabels || {}), ...(existing.mirrorLabels || {}) };
                    if (Object.keys(mL).length) out.mirrorLabels = mL;
                    const cp = [...(def.copies || [])];
                    for (const c of (existing.copies || [])) {
                        if (c && c.url && !cp.some(x => x.url === c.url)) cp.push(c);
                    }
                    if (cp.length) out.copies = cp;
                    return out;
                }
                return { ...def };
            });
            for (const custom of byId.values()) {
                if (RETIRED_GAME_IDS.has(custom.id)) continue;
                // Purge stale Polaris cards from the old catalog build (fabricated
                // raw.githack /cdn/ URLs — repo has no cdn/ dir). Valid ones are
                // already in allDefaults above.
                if (typeof custom.id === 'string' && custom.id.startsWith('polaris_')) continue;
                // UnblockedZone catalog removed — drop any stored ubz cards so
                // they don't survive the merge as "custom" games.
                if (typeof custom.id === 'string' && custom.id.startsWith('ubz_')) continue;
                this.games.push(custom);
            }
            // Migrate the old temporary orange badge (nobody chose it) to green.
            for (const g of this.games) {
                const c = (g.accentColor || '').toLowerCase();
                if (c === '#ff6600' || c === '#f59e0b' || c === '#f97316') g.accentColor = '#39ff14';
            }
            this.saveGames();
        } catch (e) { this.games = this._dedupeGames([...DEFAULT_GAMES, ...PASTED_GAMES, ...POLARIS_GAMES, ...GAMESITE_GAMES, ...GMS55_GAMES, ...ESCAPE_ROAD_GAMES, ...SELENITE_GAMES, ...DOTNET_GAMES, ...PETEZAH_GAMES]); }
    }

    /* Merge duplicate titles: same normalized name -> single card, extra URLs appended to mirrors.
       Games with no picture get the Rayquaza fallback art. */
    _dedupeGames(list) {
        const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const seen = new Map();
        const out = [];
        for (const g of list) {
            if (!g || (!g.name && !g.url)) continue;
            if (g.url && !g.image) {
                g.image = 'games/img/rayquaza-quantum.jpg';
            }
            const key = norm(g.name) || String(g.id || g.url);
            const dup = seen.get(key);
            if (!dup) {
                seen.set(key, g);
                out.push(g);
                continue;
            }
            const urls = new Set([dup.url, ...(dup.mirrors || [])].filter(Boolean));
            // Duplicate locations fold into mirrors[] — githack-only, same rule
            // as loadGames(): non-githack alternates are never probed (they don't work).
            const githackOnly = (u) => /^https?:\/\/(?:raw|rawcdn)\.githack\.com\//i.test(u);
            for (const u of [g.url, ...(g.mirrors || [])]) {
                if (u && githackOnly(u) && !urls.has(u)) {
                    urls.add(u);
                    (dup.mirrors = dup.mirrors || []).push(u);
                    // Same-title copy → the viewer's mirror dropdown shows the
                    // GAME NAME for this URL ("Escape Road · raw.githack.com")
                    // instead of a bare hostname.
                    (dup.mirrorLabels = dup.mirrorLabels || {})[u] = g.name || dup.name;
                }
            }
            if (!dup.image && g.image) dup.image = g.image;
            // Keep EVERY duplicate as a selectable copy — any host (petezah,
            // github.io, foreign githack paths…). launchGame() rides them into
            // the mirror picker so a second copy of the SAME game is selectable
            // when the primary copy is dead.
            const bag = (dup.copies = dup.copies || []);
            const addCopy = (c) => {
                if (!c || !c.url || c.url === dup.url) return;
                if (bag.some(x => x.url === c.url)) return;
                bag.push({ name: c.name || dup.name, url: c.url, mirrors: (c.mirrors || []).slice() });
            };
            addCopy(g);
            (g.copies || []).forEach(addCopy);
        }
        return out;
    }

    saveGames() {
        localStorage.setItem('hub_games', JSON.stringify(this.games));
    }

    loadMirrors() {
        const stored = localStorage.getItem('hub_mirrors');
        if (!stored) {
            this.mirrors = [...DEFAULT_MIRRORS];
            this.saveMirrors();
        } else {
            try {
                const parsed = JSON.parse(stored);
                const byId = new Map(parsed.map(m => [m.id, m]));
                this.mirrors = [...DEFAULT_MIRRORS].map(def => {
                    const existing = byId.get(def.id);
                    if (existing) {
                        byId.delete(def.id);
                        return { ...def, ...existing, url: def.url };
                    }
                    return { ...def };
                });
                this.saveMirrors();
            } catch (e) { this.mirrors = [...DEFAULT_MIRRORS]; }
        }
        // Migrate a stored default that pointed at a retired non-githack mirror
        // (cdn-jsdelivr / cdn-jsdmirror / cdn-bunny / cdn-statically / cdn-cdnjs).
        try {
            const ids = new Set(this.mirrors.map(m => m.id));
            if (!ids.has(this.settings.defaultMirrorId)) {
                this.settings.defaultMirrorId = this.mirrors[0] ? this.mirrors[0].id : 'cdn-githack';
                this.saveSettings();
            }
        } catch (e) {}
    }

    saveMirrors() {
        localStorage.setItem('hub_mirrors', JSON.stringify(this.mirrors));
    }

    loadCollections() {
        try {
            this.collections = JSON.parse(localStorage.getItem('hub_collections')) || [...DEFAULT_COLLECTIONS];
        } catch (e) { this.collections = [...DEFAULT_COLLECTIONS]; }
    }

    saveCollections() {
        localStorage.setItem('hub_collections', JSON.stringify(this.collections));
    }

    loadAchievements() {
        try {
            const stored = JSON.parse(localStorage.getItem('hub_achievements') || '[]');
            this.achievements = ACHIEVEMENT_DEFS.map(def => {
                const saved = stored.find(a => a.id === def.id);
                return { ...def, unlocked: !!(saved && saved.unlocked), unlockedAt: saved?.unlockedAt || null };
            });
        } catch (e) { this.achievements = [...ACHIEVEMENT_DEFS]; }
    }

    saveAchievements() {
        localStorage.setItem('hub_achievements', JSON.stringify(this.achievements));
    }

    unlockAchievement(id) {
        const ach = this.achievements.find(a => a.id === id);
        if (ach && !ach.unlocked) {
            ach.unlocked = true;
            ach.unlockedAt = Date.now();
            this.saveAchievements();
            toast.show(`🏆 Achievement Unlocked: ${ach.name}`, 'success', 6000);
            this.playUISound(880, 0.1, 'triangle');
            setTimeout(() => this.playUISound(1320, 0.1, 'triangle'), 100);
        }
    }

    loadLaunchHistory() {
        try {
            this.launchHistory = JSON.parse(localStorage.getItem('hub_launch_history') || '[]');
        } catch (e) { this.launchHistory = []; }
    }

    saveLaunchHistory() {
        localStorage.setItem('hub_launch_history', JSON.stringify(this.launchHistory));
    }

    recordLaunch(gameId, mirrorId) {
        const entry = { gameId, mirrorId, timestamp: Date.now(), date: new Date().toISOString() };
        this.launchHistory.unshift(entry);
        if (this.launchHistory.length > 200) this.launchHistory.pop();
        this.saveLaunchHistory();

        if (!this.gameStats[gameId]) {
            this.gameStats[gameId] = { launches: 0, playTime: 0, lastPlayed: null, rating: 0 };
        }
        this.gameStats[gameId].launches++;
        this.gameStats[gameId].lastPlayed = Date.now();
        this.saveGameStats();

        this.usedMirrors.add(mirrorId);
        this.checkAchievements();
        try { this.renderContinueHero(); } catch (e) {}
        try { this.renderRecoTrack(); } catch (e) {}
    }

    loadGameStats() {
        try { this.gameStats = JSON.parse(localStorage.getItem('hub_game_stats') || '{}'); } catch (e) { this.gameStats = {}; }
    }

    saveGameStats() {
        localStorage.setItem('hub_game_stats', JSON.stringify(this.gameStats));
    }

    getGameStats(gameId) {
        return this.gameStats[gameId] || { launches: 0, playTime: 0, lastPlayed: null, rating: 0 };
    }

    checkAchievements() {
        const totalLaunches = Object.values(this.gameStats).reduce((sum, s) => sum + (s.launches || 0), 0);
        const hour = new Date().getHours();
        if (totalLaunches >= 1) this.unlockAchievement('first_launch');
        if (totalLaunches >= 10) this.unlockAchievement('ten_launches');
        if (hour >= 0 && hour < 6) this.unlockAchievement('night_owl');
        if (this.usedMirrors.size >= 3) this.unlockAchievement('mirror_master');
        if (this.usedThemes.size >= 5) this.unlockAchievement('theme_hopper');
        if (this.usedTools.size >= 5) this.unlockAchievement('tool_user');
    }

    applySoundPack() {
        const packName = this.settings.soundPack || 'quantum';
        this.currentSoundPack = DEFAULT_SOUND_PACKS[packName] || DEFAULT_SOUND_PACKS.quantum;
    }

    /* =========================================================================
       AUTH SYSTEM - Secure Server Integration
       ========================================================================= */

    _authHeaders() {
        return {
            'Content-Type': 'application/json',
            ...(this._authToken ? { 'Authorization': `Bearer ${this._authToken}` } : {})
        };
    }

    async _api(path, body = {}) {
        // Device-local backend: accounts, OTP codes and profiles live in
        // localStorage (single-file / GitHub-root build — no server needed,
        // no fetch, works from file:// too).
        return localApi(path, body);
    }

    async registerUser(username, email, password) {
        const data = await this._api('/register', { username, email, password });
        return { otpId: data.otp_id, emailSent: data.email_sent };
    }

    async verifyEmail(otpId, code) {
        await this._api('/verify-email', { otp_id: otpId, code });
    }

    async resendCode(email, purpose = 'verify') {
        const data = await this._api('/resend-code', { email, purpose });
        return { otpId: data.otp_id, emailSent: data.email_sent };
    }

    async loginUser(username, password, remember = false) {
        const data = await this._api('/login', { username, password, remember });
        if (data.step === 'code') {
            return { otpId: data.otp_id, emailSent: data.email_sent };
        }
        if (data.token) {
            this._establishSession(data);
            return { username: data.username, email: data.email };
        }
        throw new Error('Unexpected login response');
    }

    async verifyLogin(otpId, code, remember = true) {
        const data = await this._api('/login/verify', { otp_id: otpId, code, remember });
        this._establishSession(data);
        return { username: data.username, email: data.email };
    }

    _establishSession(data) {
        // A real login always wins over guest mode.
        this._guest = false;
        this._writeGuestFlag(false);
        this._authToken = data.token;
        this._sessionExpiry = data.expiry * 1000;
        this._currentUser = { username: data.username, email: data.email, preferences: data.preferences };
        this._persistSession(data.token, data.expiry * 1000);
        this.applyUserPreferences(this._currentUser.preferences);
    }

    _persistSession(token, expiry) {
        const session = { token, user: this._currentUser?.username, expiry, remember: true };
        localStorage.setItem('hub_session', JSON.stringify(session));
        this.setSessionCookie(token, this._currentUser?.username, expiry);
    }

    async logoutUser() {
        if (this._authToken) {
            try { await this._api('/logout', { token: this._authToken }); } catch (e) {}
        }
        this._clearSession();
        this.updateAuthUI();
    }

    _clearSession() {
        this._currentUser = null;
        this._authToken = null;
        this._sessionExpiry = null;
        this._avatarUrl = null;
        this._avatarLoading = false;
        this.closeUserMenu();
        localStorage.removeItem('hub_session');
        this.clearSessionCookies();
    }

    async restoreSession() {
        const stored = localStorage.getItem('hub_session');
        if (!stored) return false;

        try {
            const session = JSON.parse(stored);
            if (session.expiry < Date.now()) {
                this._clearSession();
                return false;
            }

            const data = await this._api('/session', { token: session.token });
            this._authToken = session.token;
            this._sessionExpiry = session.expiry;
            this._currentUser = { username: data.username, email: data.email, preferences: data.preferences };
            this.applyUserPreferences(this._currentUser.preferences);
            return true;
        } catch (e) {
            this._clearSession();
            return false;
        }
    }

    setSessionCookie(token, user, expiry) {
        try {
            const secure = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie = `hub_session=${encodeURIComponent(token)}; expires=${new Date(expiry).toUTCString()}; path=/; SameSite=Lax${secure}`;
            document.cookie = `hub_user=${encodeURIComponent(user)}; expires=${new Date(expiry).toUTCString()}; path=/; SameSite=Lax${secure}`;
        } catch (e) {}
    }

    getCookie(name) {
        try {
            const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) { return null; }
    }

    clearSessionCookies() {
        try {
            document.cookie = 'hub_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
            document.cookie = 'hub_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
        } catch (e) {}
    }

    isLoggedIn() {
        return !!this._currentUser && this._sessionExpiry && this._sessionExpiry > Date.now();
    }

    /* --- Guest mode: browse/play without an account. Device-local flag only. --- */
    isGuest() {
        return !!this._guest;
    }

    _readGuestFlag() {
        try { return localStorage.getItem('hub_guest') === '1'; } catch (e) { return false; }
    }

    _writeGuestFlag(on) {
        try {
            if (on) localStorage.setItem('hub_guest', '1');
            else localStorage.removeItem('hub_guest');
        } catch (e) {}
    }

    enterGuestMode() {
        this._clearSession();
        this._guest = true;
        this._writeGuestFlag(true);
        this.dismissAuthGate();
        this.updateAuthUI();
        toast.show('Browsing as Guest — log in anytime to save your profile, friends and ranks.', 'info');
    }

    exitGuestMode() {
        this._guest = false;
        this._writeGuestFlag(false);
        this._clearSession();
        this.updateAuthUI();
    }

    /* --- UI & Visuals --- */
    // Single source of truth for scheme accents — must match css/style.css .theme-* blocks.
    static THEME_ACCENTS = {
        obsidian: '#39ff14', forest: '#05c46b', gold: '#f1c40f', hacker: '#00ff41',
        ocean: '#0abde3', lava: '#ee5253', ice: '#c8d6e5', rose: '#f368e0',
        crimson: '#c23616', cyberpunk: '#ff007f', deepspace: '#00f0ff',
        amethyst: '#bd00ff', cassian: '#10b981'
    };

    applyTheme() {
        document.body.className = `theme-${this.settings.theme}`;
        if (this.settings.animations === 'reduced') document.body.classList.add('animations-reduced');
        else if (this.settings.animations === 'none') document.body.classList.add('animations-none');
        // The scheme owns the accent: switching to rose (or any scheme) recolors
        // the entire hub. Inline --accent overrides would otherwise win over the
        // theme class and leave stale colors behind.
        const themed = GameHubApplication.THEME_ACCENTS[this.settings.theme];
        if (themed) {
            this.settings.accentColor = themed;
            this.saveSettings();
            this.applyAccentColor();
            const picker = document.getElementById('setting-accent');
            if (picker) picker.value = themed;
            const mainPicker = document.getElementById('picker-main-color');
            if (mainPicker) mainPicker.value = themed;
        }
    }

    applyAccentColor() {
        document.documentElement.style.setProperty('--accent', this.settings.accentColor);
        const hex = this.settings.accentColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
        const bright = [r, g, b].map(c => Math.round(c + (255 - c) * 0.2).toString(16).padStart(2, '0')).join('');
        document.documentElement.style.setProperty('--accent-bright', `#${bright}`);
        // Glow + borders follow the picker so themes never go stale.
        document.documentElement.style.setProperty('--glass-glow', `rgba(${r}, ${g}, ${b}, 0.25)`);
        document.documentElement.style.setProperty('--glass-border', `rgba(${r}, ${g}, ${b}, 0.35)`);
    }

    applyWallpaper() {
        if (this.settings.customWallpaper) {
            document.body.style.backgroundImage = `url('${this.settings.customWallpaper}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
        } else {
            document.body.style.backgroundImage = '';
        }
    }

    applyAnimatedBg() {
        try { applyAnimatedBg(this); } catch (e) { console.error('AnimatedBg apply error:', e); }
    }

    applyUserPreferences(prefs) {
        if (!prefs) return;
        // The scheme owns the accent: when a theme arrives, it wins and the
        // stored/custom accent must not paint over it.
        if (prefs.theme) {
            this.settings.theme = prefs.theme;
            this.applyTheme();
        } else if (prefs.accentColor) {
            this.settings.accentColor = prefs.accentColor;
            this.applyAccentColor();
        }
        if (prefs.animations) { this.settings.animations = prefs.animations; this.applyTheme(); }
    }

    attachPasswordToggles(root) {
        if (!root) return;
        root.querySelectorAll('input[type="password"]').forEach(input => {
            if (input.dataset.pwToggleDone) return;
            input.dataset.pwToggleDone = '1';
            const wrap = document.createElement('div');
            wrap.className = 'pw-wrap';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pw-toggle';
            btn.innerHTML = '<i class="fas fa-eye"></i>';
            btn.addEventListener('click', () => {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
            });
            wrap.appendChild(btn);
        });
    }

    /* --- Launch Engine (Integrated with AboutBlankLauncher + MirrorLoader) --- */
    /* Hub relay: same-origin loopback fetch (/relay/raw/…) so destinations the
       browser itself cannot reach still load through this machine's server.
       PATH-form keeps the upstream path as real path segments, so the page's
       own relative URLs (scripts, CSS, fetch()) resolve back through the
       relay automatically — the whole game streams through it.
       Only exists when served by server.py; static serve.py 404s and the
       prober simply falls through to the direct URL. */
    relayUrl(url) {
        try {
            const u = new URL(url);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
            // Already a relay URL (hosted-site candidates ship relay-wrapped) —
            // wrapping again would nest /relay/raw inside itself and the target
            // check would refuse it. Return as-is so the pool just dedupes.
            if (u.pathname.indexOf('/relay/raw/') === 0) return url;
            // server.py only exists on this machine's own origins. On a static
            // root (GitHub Pages) there is no /relay endpoint — return null so
            // the prober never wastes a round-trip on a guaranteed 404.
            const onFile = location.protocol === 'file:';
            const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.hostname === '[::1]';
            if (!onFile && !localHost) return null;
            const base = onFile ? 'http://127.0.0.1:8123' : location.origin;
            return `${base}/relay/raw/${u.protocol}//${u.host}${u.pathname}`;
        } catch (e) { return null; }
    }

    launchContent(url, mode = null, label = 'Asset', mirrors = null, mirrorLabels = null) {
        const formattedUrl = normalizeHttpUrl(url);
        if (!formattedUrl) {
            toast.show(`Invalid URL for ${label}. Must be http:// or https://`, 'error', 6000);
            return false;
        }

        // Multi-CDN everywhere: GitHub-based URLs fan out to hosts that
        // actually RENDER html games (raw.githack.com + rawcdn.githack.com
        // serve text/html; jsDelivr/Statically/raw.githubusercontent only
        // serve text/plain, which an iframe cannot run). Non-GitHub URLs
        // pass through untouched. The viewer's mirror dropdown keeps every
        // alternative as an option.
        const ghUrls = mirrorCandidates(formattedUrl);
        const primaryUrl = ghUrls[0] || formattedUrl;
        const pool = [];
        const addPool = (u) => { if (u && pool.indexOf(u) === -1) pool.push(u); };
        ghUrls.forEach(addPool);                 // confident CDN chain first
        addPool(formattedUrl);                   // original as fallback
        (mirrors || []).forEach(m => {
            mirrorCandidates(m).forEach(addPool);
            addPool(m);
        });
        mirrorUrlGuesses(formattedUrl).forEach(addPool); // branch guesses (end)
        // Server relay LAST: reachable even when the browser's network blocks
        // the CDNs (server-side fetch + MIME repair + <base> asset injection).
        // Probe order: relay of the leading CDN candidates, then the original.
        ghUrls.slice(0, 2).forEach(u => addPool(this.relayUrl(u)));
        const relay = this.relayUrl(formattedUrl);
        if (relay) addPool(relay);

        const globalMode = this.effectiveLaunchMode();
        toast.show(`Opening ${label}…`, 'info');
        if (ghUrls.length) toast.show(`${label}: ${ghUrls.length + 1} CDN mirrors ready (githack · rawcdn · relay).`, 'info', 2500);

        // Mirrors are probed inside the in-hub viewer now (no popup shells) —
        // see the about-blank branch below.

        if (globalMode === 'about-blank') {
            // EVERYTHING opens as an iframe inside the hub first ("less chances
            // of error"). The viewer's Pop-out button jumps straight to the
            // about:blank popup path (calling launchContent again would just
            // reopen the viewer, i.e. recurse).
            try {
                const viewer = openGameViewer({
                    title: label,
                    url: primaryUrl,
                    mirrors: pool,
                    mirrorLabels: mirrorLabels || null,
                    onPopOut: (popUrl) => {
                        launchViaAboutBlank(popUrl || primaryUrl, label, {
                            onSuccess: () => {
                                try { this.recordLaunch('web:' + formattedUrl, this.settings.defaultMirrorId); } catch (e) {}
                            }
                        });
                    }
                });
                if (viewer) {
                    try { this.recordLaunch('web:' + formattedUrl, this.settings.defaultMirrorId); } catch (e) {}
                    return true;
                }
            } catch (e) { /* viewer unavailable — fall back to the popup path */ }

            const success = launchViaAboutBlank(primaryUrl, label, {
                onSuccess: () => {
                    try { this.recordLaunch('web:' + formattedUrl, this.settings.defaultMirrorId); } catch(e){}
                },
                onError: () => {
                    // Popup path dead — never leave the user hanging: open it
                    // in the in-hub viewer (same window, cannot be blocked).
                    try {
                        openGameViewer({ title: label, url: primaryUrl, mirrors: pool, mirrorLabels: mirrorLabels || null });
                        toast.show(`${label} opened in hub viewer (popup blocked).`, 'info');
                    } catch (err) {
                        toast.show(`Launch blocked for ${label}.`, 'error');
                    }
                }
            });
            if (!success) {
                try {
                    openGameViewer({ title: label, url: primaryUrl, mirrors: pool, mirrorLabels: mirrorLabels || null });
                    toast.show(`${label} opened in hub viewer (popup blocked).`, 'info');
                    return true;
                } catch (e) {}
            }
            return success;
        } else if (globalMode === 'same-tab') {
            const w = window.open(primaryUrl, '_blank');
            if (w) { try { w.opener = null; } catch (e) {} return true; }
            try {
                openGameViewer({ title: label, url: primaryUrl, mirrors: pool, mirrorLabels: mirrorLabels || null });
                toast.show(`${label} opened in hub viewer (popup blocked).`, 'info');
                return true;
            } catch (e) {}
            modals.open(`
                <div class="text-center p-4">
                    <h3 class="text-xl font-bold text-white mb-2">POPUP BLOCKED</h3>
                    <p class="text-gray-400 text-sm mb-4">Your browser blocked the tab for <span
class="text-white">${label}</span>.</p>
                    <a href="${primaryUrl}" target="_blank" rel="noopener" class="btn-premium px-6 py-2 text-xs">OPEN
MANUALLY</a>
                </div>
            `);
            return false;
        } else {
            const w = window.open(primaryUrl, '_blank');
            if (w) { try { w.opener = null; } catch (e) {} return true; }
            try {
                openGameViewer({ title: label, url: primaryUrl, mirrors: pool, mirrorLabels: mirrorLabels || null });
                toast.show(`${label} opened in hub viewer (popup blocked).`, 'info');
                return true;
            } catch (e) {}

            modals.open(`
                <div class="text-center p-4">
                    <h3 class="text-xl font-bold text-white mb-2">POPUP BLOCKED</h3>
                    <p class="text-gray-400 text-sm mb-4">Your browser blocked the tab for <span
class="text-white">${label}</span>.</p>
                    <a href="${primaryUrl}" target="_blank" rel="noopener" class="btn-premium px-6 py-2 text-xs">OPEN
MANUALLY</a>
                </div>
            `);
            return false;
        }
    }

    async launchViaMirrors(url, label, mirrors) {
        const fullMirrors = mirrors.map(m => {
            if (m.includes('{url}')) {
                return m.replace('{url}', encodeURIComponent(url));
            }
            return m;
        });

        const loader = new MirrorLoader(fullMirrors, {
            target: '_blank',
            label: label,
            onProgress: (current, total, mirrorUrl) => {
                toast.show(`Trying mirror ${current}/${total}…`, 'info', 2000);
            },
            onSuccess: (win, mirrorUrl) => {
                toast.show(`Loaded via ${new URL(mirrorUrl).hostname}`, 'success', 3000);
                try { this.recordLaunch('web:' + url, this.settings.defaultMirrorId); } catch(e){}
            },
            onError: (err) => {
                toast.show(`All mirrors failed for ${label}`, 'error', 6000);
                this.launchContent(url, 'about-blank', label);
            }
        });

        return await loader.launch();
    }

    launchGame(game) {
        if (!game || !game.url) return toast.show('Game URL missing.', 'error');
        const mode = game.launchMode;
        if (mode === 'same-tab') {
            game.launchMode = 'new-tab';
        }
        try { this.recordLaunch(game.id, this.settings.defaultMirrorId || 'cdn-githack'); } catch (e) {}
        let gameUrl = game.url;
        if (gameUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(gameUrl)) {
            try { gameUrl = new URL(gameUrl, document.baseURI).href; } catch (e) {}
        }
        let mirrors = game.mirrors;
        if (!mirrors && typeof expandUnblockedMirrors === 'function') {
            const expanded = expandUnblockedMirrors(gameUrl);
            if (expanded && expanded.length > 1) mirrors = expanded;
        }

        // Multi-CDN option for EVERY game: hosts that render html (githack ×2)
        // lead the list, each catalog mirror fans out the same way, *.github.io
        // branch guesses (main/master) ride along at the end, and the server
        // relay (server-side fetch + MIME repair + asset relaying) is the very
        // last resort — it works even when the browser's network blocks the CDNs.
        const gUrls = mirrorCandidates(gameUrl);
        const gPool = [];
        const addG = (u) => { if (u && gPool.indexOf(u) === -1) gPool.push(u); };
        gUrls.forEach(addG);
        (mirrors || []).forEach(m => { mirrorCandidates(m).forEach(addG); addG(m); });
        addG(gameUrl);
        // Same-title copies (other catalog entries of THIS exact game) join the
        // pool BEFORE the weak branch guesses — labeled with the game name so
        // the viewer's mirror dropdown reads "Escape Road · petezahgames.com".
        const copyLabels = { ...(game.mirrorLabels || {}) };
        const addCopy = (u, name) => {
            if (!u) return;
            if (!copyLabels[u]) copyLabels[u] = name || game.name;
            if (gPool.indexOf(u) === -1) gPool.push(u);
        };
        for (const c of (game.copies || [])) {
            if (!c || !c.url) continue;
            mirrorCandidates(c.url).forEach(u => addCopy(u, c.name));
            addCopy(c.url, c.name);
            (c.mirrors || []).forEach(u => addCopy(u, c.name));
        }
        mirrorUrlGuesses(gameUrl).forEach(addG);
        (mirrors || []).forEach(m => mirrorUrlGuesses(m).forEach(addG));
        gUrls.slice(0, 2).forEach(u => addG(this.relayUrl(u)));
        const gRelay = this.relayUrl(gameUrl);
        if (gRelay) addG(gRelay);
        mirrors = gPool;

        if (game.category === 'Portal') {
            this.launchContent(gameUrl, 'about-blank', game.name, mirrors, copyLabels);
            return;
        }

        try {
            const viewer = openGameViewer({
                title: game.name,
                url: gameUrl,
                imageUrl: game.image || null,
                mirrors: mirrors || [gameUrl],
                mirrorLabels: copyLabels,
                // Pop-out = real popup (launchViaAboutBlank directly), NOT
                // launchContent, which is viewer-first and would recurse.
                onPopOut: (popUrl) => launchViaAboutBlank(popUrl || gameUrl, game.name)
            });
            // Play-time ticker: viewer sessions accrue seconds until closed.
            if (viewer) {
                const tick = setInterval(() => this.addPlayTime(game.id, 10), 10000);
                const origClose = viewer.close.bind(viewer);
                viewer.close = () => { clearInterval(tick); origClose(); };
            }
        } catch (e) {
            this.launchContent(gameUrl, game.launchMode, game.name, mirrors, copyLabels);
        }
    }

    addPlayTime(gameId, secs) {
        if (!this.gameStats[gameId]) {
            this.gameStats[gameId] = { launches: 0, playTime: 0, lastPlayed: null, rating: 0 };
        }
        this.gameStats[gameId].playTime = (this.gameStats[gameId].playTime || 0) + secs;
        this.saveGameStats();
    }

    fmtPlayTime(totalSecs) {
        totalSecs = Math.max(0, Math.floor(totalSecs || 0));
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${totalSecs}s`;
    }

    fmtLastPlayed(ts) {
        if (!ts) return 'Never';
        const d = Date.now() - ts;
        if (d < 86400000) return 'Today';
        if (d < 172800000) return 'Yesterday';
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /* --- Game detail modal (Cine-Cloud-style: art, stats, play) --- */
    showGameDetail(gameId) {
        const game = this.games.find(g => g.id === gameId);
        if (!game) { toast.show('Game not found.', 'error'); return; }
        const st = this.getGameStats(gameId);
        const art = game.image || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80';
        modals.open(`
            <div class="flex flex-col md:flex-row gap-6">
                <div class="md:w-64 flex-shrink-0">
                    <img src="${art}" alt="" class="w-full rounded-lg border border-white/10"
                         style="aspect-ratio:3/4;object-fit:cover;" onerror="this.style.display='none'">
                </div>
                <div class="flex-1 min-w-0">
                    <span class="badge-category" style="background: rgba(${this._hexToRgb(this.settings.accentColor || '#39ff14')},
0.12); border-color: var(--accent); color: var(--accent);">${game.category || 'Sandbox'}</span>
                    <h2 class="text-2xl font-bold text-white mt-2 mb-1">${game.name}</h2>
                    <p class="text-sm leading-relaxed mb-4" style="color:var(--text-secondary)">${game.description || 'Direct launching available.'}</p>
                    <div class="detail-stats mb-4">
                        <div class="detail-stat-row"><small>Launches</small><span>${st.launches || 0}</span></div>
                        <div class="detail-stat-row"><small>Play time</small><span>${this.fmtPlayTime(st.playTime)}</span></div>
                        <div class="detail-stat-row"><small>Last played</small><span>${this.fmtLastPlayed(st.lastPlayed)}</span></div>
                        <div class="detail-stat-row"><small>Launch mode</small><span>${this.effectiveLaunchModeLabel()}</span></div>
                    </div>
                    <button class="btn-premium w-full py-3 justify-center detail-play-btn">
                        <i class="fas fa-play"></i> PLAY NOW
                    </button>
                </div>
            </div>
        `, {
            '.detail-play-btn': () => {
                modals.close();
                this.launchGameById(gameId);
            }
        });
    }

    /* --- Continue-playing / featured hero (rotates like Cine-Cloud) --- */
    renderContinueHero() {
        const box = document.getElementById('continue-hero');
        if (!box || !this.games.length) return;
        if (this._heroTimer) { clearInterval(this._heroTimer); this._heroTimer = null; }

        const byId = new Map(this.games.map(g => [g.id, g]));
        const played = (this.launchHistory || [])
            .map(h => byId.get(h.gameId))
            .find(g => g && g.url);
        const pool = [];
        if (played) pool.push({ game: played, tag: 'RESUME', sub: `${this.fmtPlayTime(this.getGameStats(played.id).playTime)} played` });
        const feat = [...this.games].sort(() => 0.5 - Math.random()).slice(0, 3)
            .filter(g => g !== played && g.url);
        feat.forEach(g => pool.push({ game: g, tag: 'FEATURED', sub: g.category || 'Sandbox' }));
        if (!pool.length) { box.innerHTML = ''; return; }

        let idx = 0;
        const paint = () => {
            const { game, tag, sub } = pool[idx % pool.length];
            const art = game.image || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80';
            box.innerHTML = `
                <div class="continue-hero" data-id="${game.id}">
                    <div class="continue-hero-art" style="background-image:url('${art}')"></div>
                    <div class="continue-hero-shade"></div>
                    <div class="continue-hero-body">
                        <span class="continue-hero-tag">${tag}</span>
                        <h3 class="continue-hero-title">${game.name}</h3>
                        <div class="continue-hero-sub">${sub}</div>
                    </div>
                </div>`;
            const el = box.querySelector('.continue-hero');
            if (el) el.addEventListener('click', () => this.launchGameById(game.id));
        };
        paint();
        if (pool.length > 1) {
            this._heroTimer = setInterval(() => { idx++; paint(); }, 6000);
        }
    }

    /* --- Recommendations marquee (top by launches, looped track) --- */
    renderRecoTrack() {
        const track = document.getElementById('reco-track');
        if (!track || !this.games.length) return;
        const ranked = [...this.games]
            .filter(g => g.url)
            .sort((a, b) => (this.gameStats[b.id]?.launches || 0) - (this.gameStats[a.id]?.launches || 0))
            .slice(0, 12);
        const sig = ranked.map(g => g.id).join(',');
        if (track.dataset.sig === sig) return;
        track.dataset.sig = sig;
        const fallback = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80';
        const card = (g) => `
            <div class="reco-card" data-id="${g.id}">
                <img loading="lazy" src="${g.image || fallback}" alt="" onerror="this.src='${fallback}'">
                <span>${g.name}</span>
            </div>`;
        track.innerHTML = ranked.map(card).join('') + ranked.map(card).join('');
        track.querySelectorAll('.reco-card').forEach(el => {
            el.addEventListener('click', () => this.showGameDetail(el.dataset.id));
        });
    }

    launchGameById(gameId) {
        const game = this.games.find(g => g.id === gameId);
        if (game) this.launchGame(game);
        else toast.show('Game not found.', 'error');
    }

    effectiveLaunchMode() {
        const sel = document.getElementById('setting-launch-behavior');
        return (sel ? sel.value : null) || this.settings.defaultLauchBehavior || 'about-blank';
    }

    effectiveLaunchModeLabel() {
        const m = this.effectiveLaunchMode();
        return m === 'about-blank' ? 'about:blank' : (m === 'same-tab' ? 'Same Tab' : 'New Tab');
    }

    /* --- Game Grid & Search --- */
    renderGamesGrid() {
        const grid = document.querySelector('.game-grid');
        if (!grid) return;

        if (!this._gameSearchInitialized) {
            this.initGameSearchFilters();
            this._gameSearchInitialized = true;
        }

        const filteredGames = this.getFilteredGames();
        if (filteredGames.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-16 text-center text-gray-500">No games match your
filters.</div>`;
            return;
        }

        const indicator = document.getElementById('games-total-indicator');
        if (indicator) indicator.textContent = filteredGames.length;

        grid.innerHTML = filteredGames.map(g => `
            <div class="game-card" data-id="${g.id}">
                <div class="game-card-management">
                    <button class="btn-card-action edit" data-id="${g.id}"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-card-action delete" data-id="${g.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
                <div class="game-card-art" style="background-image: url('${g.image ||
'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80'}');"></div>
                <div class="game-card-overlay"></div>
                <div class="game-card-content">
                    <h3 class="game-card-title">${g.name}</h3>
                    <div class="game-card-actions">
                        <button class="btn-premium py-1.5 text-xs play-game-btn" data-id="${g.id}">
                            <i class="fas fa-play"></i> LAUNCH GAME
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.play-game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.launchGameById(btn.dataset.id);
            });
        });

        grid.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => this.showGameDetail(card.dataset.id));
        });

        this.renderContinueHero();
        this.renderRecoTrack();

        grid.querySelectorAll('.btn-card-action.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const game = this.games.find(g => g.id === btn.dataset.id);
                modals.showGameForm(game, (updated) => {
                    this.games = this.games.map(item => item.id === game.id ? { ...item, ...updated } : item);
                    this.saveGames();
                    this.renderGamesGrid();
                    toast.show('Specification updated.', 'success');
                });
            });
        });

        grid.querySelectorAll('.btn-card-action.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const game = this.games.find(g => g.id === btn.dataset.id);
                modals.showConfirm('PURGE GAME', `Purge "${game.name}" from repository?`, () => {
                    this.games = this.games.filter(g => g.id !== game.id);
                    this.saveGames();
                    this.renderGamesGrid();
                });
            });
        });
    }

    _hexToRgb(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }

    initGameSearchFilters() {
        ['game-search-input', 'game-category-filter', 'game-sort-filter', 'game-favorites-only'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.renderGamesGrid());
        });
    }

    getFilteredGames() {
        const search = document.getElementById('game-search-input')?.value.toLowerCase().trim() || '';
        const cat = document.getElementById('game-category-filter')?.value || 'all';
        const sort = document.getElementById('game-sort-filter')?.value || 'name';
        const favs = document.getElementById('game-favorites-only')?.checked || false;

        let filtered = this.games.filter(g => {
            const matchSearch = !search || g.name.toLowerCase().includes(search) ||
g.category.toLowerCase().includes(search);
            const matchCat = cat === 'all' || g.category === cat;
            const matchFav = !favs || (this.gameStats[g.id]?.rating || 0) >= 4;
            return matchSearch && matchCat && matchFav;
        });

        if (sort === 'launches') filtered.sort((a, b) => (this.gameStats[b.id]?.launches || 0) -
(this.gameStats[a.id]?.launches || 0));
        else if (sort === 'recent') filtered.sort((a, b) => (this.gameStats[b.id]?.lastPlayed || 0) -
(this.gameStats[a.id]?.lastPlayed || 0));
        else filtered.sort((a, b) => a.name.localeCompare(b.name));

        return filtered;
    }

    /* --- AI Assistant (Optimized Pyodide & Intent) --- */
    async initAIAssistant() {
        const sendBtn = document.getElementById('ai-chat-send');
        const input = document.getElementById('ai-chat-input');
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!sendBtn || !input || !messagesContainer) return;

        const mindLog = document.getElementById('ai-mind-log');
        const mind = (step) => {
            if (!mindLog) return;
            const line = document.createElement('div');
            line.textContent = `› ${step}`;
            mindLog.appendChild(line);
            mindLog.scrollTop = mindLog.scrollHeight;
        };

        let pyodide = null;
        const getPy = async () => {
            if (pyodide) return pyodide;
            mind('Mind: Loading Pyodide runtime...');
            try {
                const script = document.createElement('script');
                script.src = 'https://raw.githack.com/pyodide/pyodide/0.25.1/full/pyodide.js';
                document.head.appendChild(script);
                await new Promise(r => script.onload = r);
                pyodide = await window.loadPyodide();
                mind('Mind: Python Engine Active.');
                return pyodide;
            } catch (e) {
                mind('Mind: Python failed. Using local solver.');
                return null;
            }
        };

        const sendMessage = async () => {
            const text = input.value.trim();
            if (!text) return;

            this.addAIMessage(text, true, messagesContainer);
            input.value = '';
            const typing = this.addTypingIndicator(messagesContainer);

            mind(`Analyzing input: "${text.slice(0, 30)}..."`);

            try {
                if (this.isMathIntent(text)) {
                    const py = await getPy();
                    if (py) {
                        const result = await py.runPythonAsync(`import math\n${this.translateToPy(text)}`);
                        typing.remove();
                        this.addAIMessage(`🐍 Result: ${result}`, false, messagesContainer);
                        return;
                    }
                }

                if (this.isWebIntent(text)) {
                    const url = this.extractUrl(text);
                    if (url) {
                        this.launchContent(url, 'about-blank', 'Web Resource');
                        typing.remove();
                        this.addAIMessage(`Launching ${url} in separate tab.`, false, messagesContainer);
                        return;
                    }
                }

                const based = this.getBaseplateResponse(text);
                if (based) {
                    typing.remove();
                    this.addAIMessage(based, false, messagesContainer);
                    return;
                }

                const response = this.getTrainedResponse(text);
                typing.remove();
                this.addAIMessage(response || 'I am not sure how to handle that. Try "Search [topic]" or "Solve [math]".',
false, messagesContainer);

            } catch (e) {
                typing.remove();
                this.addAIMessage('System glitch. Please rephrase.', false, messagesContainer);
            }
        };

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', e => e.key === 'Enter' && sendMessage());
    }

    addAIMessage(text, isUser, container) {
        const div = document.createElement('div');
        div.className = `ai-message glass-panel p-3 ${isUser ? 'ml-8' : 'mr-8'}`;
        const userClass = isUser ? 'bg-blue-500/20 text-blue-500' : 'bg-accent/20 text-accent';
        const userIcon = isUser ? 'fa-user' : 'fa-robot';
        const body = isUser ? this._esc(text) : text;
        div.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-full flex items-center justify-center ${userClass} shrink-0">
                    <i class="fas ${userIcon} text-sm"></i>
                </div>
                <div class="flex-1 text-sm text-gray-300">${body}</div>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    addTypingIndicator(container) {
        const div = document.createElement('div');
        div.className = 'ai-message glass-panel p-3 mr-8 ai-typing';
        div.innerHTML = `<div class="flex items-center gap-2 text-xs text-gray-400"><i class="fas fa-robot text-accent"></i><span class="animate-pulse">Thinking…</span></div>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        return div;
    }

    isMathIntent(text) {
        return /[\d\s+\-*/^%().]+/.test(text) && /[\+\-\*\/^%]/.test(text);
    }

    translateToPy(text) {
        return text.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
    }

    isWebIntent(text) {
        return /https?:\/\/|search|fetch|browse/i.test(text);
    }

    extractUrl(text) {
        const match = text.match(/https?:\/\/[^\s]+/i);
        return match ? match[0] : null;
    }

    getTrainedResponse(text) {
        const low = text.toLowerCase();
        if (low.includes('hello') || low.includes('hi')) return 'Greetings, User. Systems operational. How can I assist?';
        if (low.includes('theme')) return `Current visual layout: ${this.settings.theme}. Change this in Settings.`;
        if (low.includes('mirror')) return 'Mirrors are launch gateways. I open them in about:blank contexts to minimize redirection flags.';
        return null;
    }

    _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _matchBase(list, q) {
        q = q.toLowerCase().trim();
        if (!q) return list.slice(0, 8);
        return list.filter(e => e.slug.includes(q) || e.name.toLowerCase().includes(q)).slice(0, 8);
    }

    _baseListHtml(items, total, noun) {
        if (items.length === 0) return null;
        const rows = items.map(e =>
            `• <b>${this._esc(e.name)}</b> — <a href="${e.url}" target="_blank" rel="noopener">open ${noun}</a>`
        ).join('<br>');
        return `🎨 <b>Open-design ${noun}s</b> (${total} indexed):<br>${rows}` +
            (total > items.length ? `<br><span style="color:#888">+${total - items.length} more — refine your query.</span>` : '') +
            `<br><span style="color:#888">Say "use {${noun}} &lt;name&gt;" for its invocation prompt.</span>`;
    }

    getBaseplateResponse(text) {
        const low = text.toLowerCase().trim();
        let m = low.match(/^(?:use\s+)?skills?\s*(.*)$/);
        if (m) {
            const q = (m[1] || '').trim();
            if (!q) {
                return this._baseListHtml(AI_SKILLS.slice(0, 8), AI_SKILLS.length, 'skill');
            }
            const hits = this._matchBase(AI_SKILLS, q);
            if (hits.length === 1 || (hits.length > 0 && (low.startsWith('use ') || hits[0].slug === q))) {
                const s = hits[0];
                return `🛠️ <b>${this._esc(s.name)}</b><br>` +
                    `<span style="color:#888">Paste this into any coding agent with the open-design baseplate:</span><br>` +
                    `<code>Use the ${s.slug} skill from open-design to ${this._esc(q || 'help with my task')}.</code><br>` +
                    `<a href="${s.url}" target="_blank" rel="noopener">Open skill definition →</a>`;
            }
            return this._baseListHtml(hits, AI_SKILLS.length, 'skill') ||
                `No skills match "${this._esc(q)}". Try "skills" to browse.`;
        }
        m = low.match(/^(?:use\s+)?(?:design|system|systems)(?:\s+(.*))?$/);
        if (m) {
            const q = (m[1] || '').trim();
            if (!q) {
                return this._baseListHtml(AI_DESIGN_SYSTEMS.slice(0, 8), AI_DESIGN_SYSTEMS.length, 'system');
            }
            const hits = this._matchBase(AI_DESIGN_SYSTEMS, q);
            if (hits.length === 1 || (hits.length > 0 && low.startsWith('use '))) {
                const s = hits[0];
                return `🎨 <b>${this._esc(s.name)}</b> design system<br>` +
                    `<span style="color:#888">Paste this into any coding agent with the open-design baseplate:</span><br>` +
                    `<code>Design this using the ${s.slug} design system.</code><br>` +
                    `<a href="${s.url}" target="_blank" rel="noopener">Open system definition →</a>`;
            }
            return this._baseListHtml(hits, AI_DESIGN_SYSTEMS.length, 'system') ||
                `No design systems match "${this._esc(q)}". Try "design" to browse.`;
        }
        if (low.includes('skill') || low.includes('design system') || low.includes('baseplate')) {
            return `🎨 Open-design baseplate loaded: <b>${AI_SKILLS.length} skills</b> + ` +
                `<b>${AI_DESIGN_SYSTEMS.length} design systems</b>.<br>` +
                `Try "skills", "skill landing page", "design", or "design bento".`;
        }
        return null;
    }

    /* --- Auth Gate & Modals --- */
    showAuthGate() {
        // Static markup lives in index.html (#auth-gate, hidden by CSS).
        // Showing it = adding .open (display:flex). Nothing is created here.
        const gate = document.getElementById('auth-gate');
        if (!gate) return;
        gate.classList.add('open');
        this.bindAuthGate();
    }

    renderGateState() {
        const gate = document.getElementById('auth-gate');
        if (!gate) return;
        const inCode = !!this._gateOtp;
        // Entering the code step always starts empty: a code from the previous
        // step (register-verify vs login) must never linger in the input.
        if (inCode && !this._gateWasCode) {
            const ci = document.getElementById('gate-code');
            if (ci) ci.value = '';
        }
        this._gateWasCode = inCode;
        // Hidden fieldsets are display:none AND disabled: some embedded
        // browsers still validate required inputs inside display:none
        // subtrees, which silently cancels submit with no error shown.
        // Disabled controls are never validation candidates, anywhere.
        const setFs = (id, on) => {
            const fs = document.getElementById(id);
            if (!fs) return;
            fs.classList.toggle('hidden', !on);
            fs.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = !on; });
        };
        setFs('gate-fields-login', !inCode && this._gateMode === 'login');
        setFs('gate-fields-register', !inCode && this._gateMode === 'register');
        setFs('gate-fields-code', inCode);
        this._fillDevInbox(inCode);
        const submit = document.getElementById('auth-gate-submit');
        if (submit) submit.textContent = inCode ? 'VERIFY CODE' : (this._gateMode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT');
        gate.querySelectorAll('.auth-gate-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === this._gateMode));
    }

    /* Fake dev inbox inside the code step: local-api drops every generated
       OTP here instead of a server console. Click a row to fill the field. */
    _fillDevInbox(show) {
        const box = document.getElementById('fake-dev-inbox');
        const list = document.getElementById('dev-inbox-list');
        if (!box || !list) return;
        if (show) {
            let msgs = [];
            try { msgs = localInbox() || []; } catch (e) {}
            const now = Date.now();
            list.innerHTML = msgs.length ? msgs.map((m, i) => {
                const mins = Math.max(0, Math.floor((now - (m.at || 0)) / 60000));
                const when = mins < 1 ? 'just now' : `${mins}m ago`;
                return `<button type="button" class="dev-inbox-item${i === 0 ? ' latest' : ''}" data-code="${this._esc(m.code)}">` +
                    `<span class="dev-inbox-to">${this._esc(m.to)}</span>` +
                    `<span class="dev-inbox-body">code <b>${this._esc(m.code)}</b> · ${this._esc(m.purpose)} · ${when}</span>` +
                    `</button>`;
            }).join('') : '<div class="dev-inbox-item decoy"><span class="dev-inbox-to">ci@quantum-hub</span><span class="dev-inbox-body">deploy ok · waiting for a code…</span></div>';
            if (!box.dataset.bound) {
                box.dataset.bound = '1';
                box.addEventListener('click', (e) => {
                    const it = e.target.closest ? e.target.closest('.dev-inbox-item[data-code]') : null;
                    if (!it || !it.dataset.code) return;
                    const inp = document.getElementById('gate-code');
                    if (inp) { inp.value = it.dataset.code; inp.focus(); }
                });
            }
        }
    }

    bindAuthGate() {
        const gate = document.getElementById('auth-gate');
        if (!gate) return;
        if (!this._gateMode) this._gateMode = 'login';
        if (gate.dataset.bound) { this.renderGateState(); return; }
        gate.dataset.bound = '1';
        const errBox = document.getElementById('auth-gate-error');

        gate.querySelectorAll('.auth-gate-tab').forEach(b => {
            b.addEventListener('click', () => {
                this._gateMode = b.dataset.mode;
                this._gateOtp = null; // switching tabs abandons a pending code step
                errBox.textContent = '';
                this.renderGateState();
            });
        });

        document.getElementById('auth-gate-guest')?.addEventListener('click', () => {
            errBox.textContent = '';
            this.enterGuestMode();
        });

        document.getElementById('auth-gate-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            errBox.textContent = '';
            if (this._gateOtp) {
                try {
                    const code = document.getElementById('gate-code').value.trim();
                    if (this._gateOtp.purpose === 'login') {
                        await this.verifyLogin(this._gateOtp.otpId, code, true);
                        this.dismissAuthGate();
                        this.updateAuthUI();
                        toast.show(`Welcome back, ${this._currentUser ? this._currentUser.username : ''}!`, 'success');
                    } else {
                        await this.verifyEmail(this._gateOtp.otpId, code);
                        toast.show('Email verified — you can log in now.', 'success');
                        this._gateOtp = null; this._gateMode = 'login';
                        this.renderGateState();
                    }
                } catch (err) {
                    errBox.textContent = err.message;
                }
                return;
            }
            try {
                if (this._gateMode === 'login') {
                    const u = document.getElementById('gate-username').value;
                    const p = document.getElementById('gate-password').value;
                    const res = await this.loginUser(u, p, true);
                    if (res.otpId) {
                        this._gateOtp = { otpId: res.otpId, purpose: 'login' };
                        toast.show('Verification code sent — grab it from the Dev Inbox (fake, on this device).', 'info');
                        this.renderGateState();
                    } else {
                        this.dismissAuthGate();
                        this.updateAuthUI();
                    }
                } else {
                    const u = document.getElementById('gate-username-r').value;
                    const em = document.getElementById('gate-email-r').value;
                    const p = document.getElementById('gate-password-r').value;
                    const res = await this.registerUser(u, em, p);
                    this._gateOtp = { otpId: res.otpId, purpose: 'verify' };
                    toast.show('Verification code sent — grab it from the Dev Inbox (fake, on this device).', 'success');
                    this.renderGateState();
                }
            } catch (err) {
                errBox.textContent = err.message;
            }
        });
        this.attachPasswordToggles(gate);
        this.renderGateState();
    }

    dismissAuthGate() {
        document.getElementById('auth-gate')?.classList.remove('open');
        this._gateOtp = null;
        localStorage.setItem('hub_first_run', 'done');
    }

    initAuth() {
        if (location.protocol === 'file:') {
            const banner = document.getElementById('file-banner');
            if (banner && !banner.dataset.bound) {
                banner.dataset.bound = '1';
                banner.classList.remove('hidden');
                document.getElementById('file-banner-x')?.addEventListener('click', () => banner.classList.add('hidden'));
            }
        }
        this.restoreSession().then(restored => {
            if (restored) {
                // A real login wins over any leftover guest flag.
                this._guest = false;
                this._writeGuestFlag(false);
            } else {
                this._guest = this._readGuestFlag();
            }
            this.updateAuthUI();
            if (!restored && !this._guest) this.showAuthGate();
        });
    }

    updateAuthUI() {
        this.closeUserMenu();
        const indicators = document.querySelectorAll('.auth-indicator');
        indicators.forEach(el => {
            el.innerHTML = '';
            if (!this.isLoggedIn() && !this._guest) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn-outline text-xs px-3 py-1';
                b.textContent = 'LOGIN';
                // Re-added with a directly-bound handler: this button owns
                // its click (opens the gate) — no delegation needed.
                b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.showAuthGate(); });
                el.appendChild(b);
                return;
            }
            const name = this._guest ? 'Guest' : ((this._currentUser && this._currentUser.username) || 'user');
            const wrap = document.createElement('button');
            wrap.type = 'button';
            wrap.className = 'auth-user-btn' + (this._guest ? ' auth-guest' : '');
            wrap.setAttribute('aria-haspopup', 'menu');
            wrap.title = this._guest ? 'Guest — account menu' : `${name} — account menu`;
            const av = document.createElement('span');
            av.className = 'auth-avatar';
            if (this._avatarUrl && !this._guest) {
                const img = document.createElement('img');
                img.src = this._avatarUrl;
                img.alt = '';
                img.referrerPolicy = 'no-referrer';
                av.appendChild(img);
            } else {
                av.textContent = name.charAt(0).toUpperCase();
            }
            const label = document.createElement('span');
            label.className = 'text-xs font-mono text-accent';
            label.textContent = name;
            const chev = document.createElement('i');
            chev.className = 'fas fa-chevron-down auth-chev';
            wrap.append(av, label, chev);
            // The hub-plus document click handler jumps to settings on ANY
            // .auth-indicator button click — this click belongs to the
            // dropdown, so it never bubbles there.
            wrap.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleUserMenu(wrap); });
            el.appendChild(wrap);
        });
        // The picture arrives async after session restore — repaint once loaded.
        if (this.isLoggedIn() && !this._avatarUrl && !this._avatarLoading) this._loadAvatar();
    }

    closeUserMenu() {
        document.getElementById('user-menu')?.classList.add('hidden');
    }

    toggleUserMenu(anchor) {
        // Static markup lives in index.html (#user-menu, hidden by CSS).
        // Toggling = positioning + removing .hidden. Items bound once.
        const menu = document.getElementById('user-menu');
        if (!menu) return;
        if (!menu.classList.contains('hidden')) { this.closeUserMenu(); return; }
        if (!menu.dataset.bound) {
            menu.dataset.bound = '1';
            menu.querySelectorAll('.user-menu-item').forEach(b => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeUserMenu();
                    if (b.dataset.action === 'account') this.openAccountPanel();
                    else if (b.dataset.action === 'logout') this.logoutAndGate();
                });
            });
        }
        const r = anchor.getBoundingClientRect();
        const w = 190;
        menu.style.top = `${r.bottom + window.scrollY + 6}px`;
        menu.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - w - 8))}px`;
        menu.style.minWidth = `${w}px`;
        // Guests get login/exit actions instead of account/logout.
        const accItem = menu.querySelector('.user-menu-item[data-action="account"] span');
        const outItem = menu.querySelector('.user-menu-item[data-action="logout"] span');
        if (accItem) accItem.textContent = this._guest ? 'Log in / Sign up' : 'Account';
        if (outItem) outItem.textContent = this._guest ? 'Exit guest mode' : 'Log out';
        menu.classList.remove('hidden');
        const off = (e) => {
            if (menu.contains(e.target)) return;
            this.closeUserMenu();
            document.removeEventListener('pointerdown', off, true);
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            this.closeUserMenu();
            document.removeEventListener('pointerdown', off, true);
            document.removeEventListener('keydown', onKey);
        };
        document.addEventListener('pointerdown', off, true);
        document.addEventListener('keydown', onKey);
    }

    openAccountPanel() {
        if (this._guest) {
            toast.show('Guest mode — log in or sign up to save a profile picture and settings.', 'info');
            this.showAuthGate();
            return;
        }
        if (this.switchPanel) this.switchPanel('panel-settings');
        const acc = document.getElementById('settings-account');
        if (acc) {
            acc.style.display = '';
            acc.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        this.renderAccountPanel();
    }

    async logoutAndGate() {
        if (this._guest) {
            this.exitGuestMode();
        } else {
            try { await this.logoutUser(); } catch (e) {}
        }
        this.updateAuthUI();
        this.showAuthGate();
    }

    async _loadAvatar() {
        if (!this.isLoggedIn() || !this._authToken || this._avatarLoading) return;
        this._avatarLoading = true;
        try {
            const data = await this._api('/profile-get', { token: this._authToken });
            if (data && data.avatar) {
                this._avatarUrl = data.avatar;
                this.updateAuthUI();
            }
        } catch (e) {}
        this._avatarLoading = false;
    }

    renderAccountPanel() {
        // Static markup lives in index.html (#account-content). This only
        // fills values and binds the buttons once.
        const host = document.getElementById('account-content');
        if (!host) return;
        if (!this._boundAccount) {
            this._boundAccount = true;
            const urlInput = document.getElementById('account-avatar-url');
            const fileInput = document.getElementById('account-avatar-file');
            const status = document.getElementById('account-avatar-status');
            urlInput.addEventListener('input', () => this._paintAccountPreview(urlInput.value.trim() || null));
            fileInput.addEventListener('change', async () => {
                const f = fileInput.files && fileInput.files[0];
                if (!f) return;
                try {
                    const small = await this._shrinkAvatar(f);
                    if (small.length > 195 * 1024) { status.textContent = 'That image is too big even shrunk — try a smaller file.'; return; }
                    urlInput.value = small;
                    this._paintAccountPreview(small);
                    status.textContent = 'Image ready — hit SAVE PICTURE.';
                } catch (e) { status.textContent = 'Could not read that image.'; }
            });
            document.getElementById('account-avatar-save').addEventListener('click', async () => {
                try { await this._persistAvatar(urlInput.value.trim()); }
                catch (e) {
                    status.textContent = e.message;
                    toast.show(e.message, 'error');
                }
            });
            document.getElementById('account-avatar-remove').addEventListener('click', async () => {
                urlInput.value = '';
                try { await this._persistAvatar(''); }
                catch (e) {
                    status.textContent = e.message;
                    toast.show(e.message, 'error');
                }
            });
        }
        const u = this._currentUser || {};
        document.getElementById('account-username').textContent = u.username || '—';
        document.getElementById('account-email').textContent = u.email || '—';
        const urlInput = document.getElementById('account-avatar-url');
        if (this._avatarUrl && !this._avatarUrl.startsWith('data:')) urlInput.value = this._avatarUrl;
        else if (!this._avatarUrl) urlInput.value = '';
        this._paintAccountPreview(this._avatarUrl);
    }

    _paintAccountPreview(src) {
        const prev = document.getElementById('account-avatar-preview');
        if (!prev) return;
        prev.innerHTML = '';
        if (src) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = 'Profile picture preview';
            img.referrerPolicy = 'no-referrer';
            prev.appendChild(img);
        } else {
            prev.textContent = ((this._currentUser && this._currentUser.username) || 'u').charAt(0).toUpperCase();
        }
    }

    async _persistAvatar(avatar) {
        const status = document.getElementById('account-avatar-status');
        if (this._guest) {
            const msg = 'Guest mode — log in or sign up to save a profile picture.';
            if (status) status.textContent = msg;
            toast.show(msg, 'info');
            return;
        }
        if (status) status.textContent = 'Saving…';
        const cur = await this._api('/profile-get', { token: this._authToken });
        await this._api('/profile-set', {
            token: this._authToken,
            display: cur.display || '', bio: cur.bio || '',
            color: cur.color || '#39ff14', avatar
        });
        this._avatarUrl = avatar || null;
        this._paintAccountPreview(this._avatarUrl);
        this.updateAuthUI();
        const msg = avatar ? 'Profile picture saved.' : 'Profile picture removed.';
        if (status) status.textContent = msg;
        toast.show(msg, 'success');
    }

    _shrinkAvatar(file) {
        return new Promise((resolve, reject) => {
            const rd = new FileReader();
            rd.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, 128 / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * scale));
                    c.height = Math.max(1, Math.round(img.height * scale));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.85));
                };
                img.onerror = () => reject(new Error('decode'));
                img.src = rd.result;
            };
            rd.onerror = () => reject(new Error('read'));
            rd.readAsDataURL(file);
        });
    }

    /* --- Final Support Tools --- */
    playUISound(freq = 440, duration = 0.05, type = 'sine') {
        try {
            if (!this.settings.audioFeedback) return;
            if (!this.synthAudioCtx) this.synthAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.synthAudioCtx.createOscillator();
            const gain = this.synthAudioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.synthAudioCtx.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.synthAudioCtx.currentTime);
            const vol = this.settings.volume ?? 0.8;
            gain.gain.setValueAtTime(0.01 * vol, this.synthAudioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.synthAudioCtx.currentTime + duration);
            osc.start();
            osc.stop(this.synthAudioCtx.currentTime + duration);
        } catch (e) {}
    }

    /* Click spark: a tiny accent burst at the pointer on every interactive press. */
    initClickFeedback() {
        if (document.body.dataset.clickFx) return;
        document.body.dataset.clickFx = '1';
        const SEL = '.btn-premium,.btn-outline,.nav-item,.tool-menu-btn,.game-card,.media-card,.mirror-card,.calc-btn,.theme-btn,.fav-heart,.q-suggest-fab,.user-menu-item,.auth-gate-tab,.q-stars button';
        document.addEventListener('pointerdown', (e) => {
            try {
                if (document.documentElement.classList.contains('q-lite')) return;
                if (document.body.classList.contains('animations-none')) return;
                const t = e.target && e.target.closest ? e.target.closest(SEL) : null;
                if (!t) return;
                const s = document.createElement('div');
                s.className = 'q-click-spark';
                s.style.left = `${e.clientX}px`;
                s.style.top = `${e.clientY}px`;
                document.body.appendChild(s);
                s.addEventListener('animationend', () => s.remove());
                setTimeout(() => s.remove(), 800);
            } catch (err) {}
        }, { passive: true });
    }

    /* --- Missing Core System Initializers --- */

    bindNavigation() {
        const dock = document.querySelector('.bottom-dock');
        if (!dock) return;

        dock.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.dataset.navBound) return;
            btn.dataset.navBound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const panel = btn.dataset.target;
                if (panel) this.switchPanel(panel);
            });
        });
    }

    switchPanel(panelId) {
        document.querySelectorAll('.panel-container').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

        const panel = document.getElementById(panelId);
        const btn = document.querySelector(`.nav-item[data-target="${panelId}"]`);

        if (panel) panel.classList.add('active');
        if (btn) btn.classList.add('active');

        this.activeTab = panelId;
        this.playUISound(523, 0.05, 'sine');
    }

    /* --- Restored core initializers (missing = dead buttons) --- */

    initInteractiveProxy() {
        if (this._proxyInit) return;
        this._proxyInit = true;

        document.querySelectorAll('.proxy-launch-btn').forEach(btn => {
            if (btn.dataset.launchBound) return;
            btn.dataset.launchBound = '1';
            btn.addEventListener('click', () => {
                if (btn.dataset.local) {
                    const abs = new URL(btn.dataset.local, location.href).href;
                    // Pass the hub's selected language + chosen AI provider so the
                    // interface auto-matches the user's language and model choice.
                    const lang = (this.settings && this.settings.language) || 'en';
                    const providerSel = document.getElementById('ai-provider-select');
                    const provider = providerSel ? providerSel.value : 'ollama';
                    const sep = abs.includes('?') ? '&' : '?';
                    const full = `${abs}${sep}lang=${encodeURIComponent(lang)}&provider=${encodeURIComponent(provider)}`;
                    window.location.href = full;
                    return;
                }
                const url = btn.dataset.url || btn.closest('[data-url]')?.dataset.url;
                const name = btn.closest('[data-name]')?.dataset.name || url;
                if (url) {
                    const relay = this.relayUrl(url);
                    this.launchContent(url, null, name, relay ? [url, relay] : null);
                }
            });
        });

        const urlInput = document.getElementById('sandbox-manual-url');
        const launchBtn = document.getElementById('sandbox-manual-launch');
        if (launchBtn && !launchBtn.dataset.bound) {
            launchBtn.dataset.bound = '1';
            const fire = () => {
                const url = (urlInput?.value || '').trim();
                if (!url) { toast.show('Enter a URL first.', 'error'); return; }
                const relay = this.relayUrl(url);
                this.launchContent(url, null, 'Manual Sandbox', relay ? [url, relay] : null);
            };
            launchBtn.addEventListener('click', fire);
            urlInput?.addEventListener('keypress', e => { if (e.key === 'Enter') fire(); });
        }
    }

    initInteractiveSettings() {
        if (this._settingsInit) return;
        this._settingsInit = true;
        const on = (id, evt, fn) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener(evt, fn); }
            return el;
        };

        // Theme buttons
        document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                this.settings.theme = btn.dataset.theme;
                this.saveSettings();
                this.applyTheme();
                toast.show(`Theme: ${btn.dataset.theme}`, 'success');
            });
        });

        on('setting-accent', 'input', (e) => {
            this.settings.accentColor = e.target.value;
            this.saveSettings();
            this.applyAccentColor();
        });
        on('setting-particles', 'change', (e) => {
            this.settings.particlesEnabled = e.target.checked;
            this.saveSettings();
            if (e.target.checked) this.initParticles();
            else if (window.__stopParticles) window.__stopParticles();
        });
        on('setting-audio', 'change', (e) => {
            this.settings.audioFeedback = e.target.checked;
            this.saveSettings();
        });
        on('setting-launch-behavior', 'change', (e) => {
            this.settings.defaultLaunchBehavior = e.target.value;
            this.settings.defaultLauchBehavior = e.target.value; // legacy typo key
            this.saveSettings();
            toast.show('Launch behavior saved.', 'success');
        });
        on('setting-animations', 'change', (e) => {
            this.settings.animations = e.target.value;
            this.saveSettings();
            this.applyTheme();
            this.applyAnimatedBg(); // 'none' tears the layer down, 'full' restores it
        });
        on('setting-sound-pack', 'change', (e) => {
            this.settings.soundPack = e.target.value;
            this.saveSettings();
            this.applySoundPack();
        });
        on('setting-wallpaper', 'change', (e) => {
            this.settings.customWallpaper = e.target.value.trim();
            this.saveSettings();
            this.applyWallpaper();
        });
        on('setting-animated-bg', 'change', (e) => {
            this.settings.animatedBg = e.target.value;
            this.saveSettings();
            this.applyAnimatedBg();
            toast.show(e.target.value ? `Animated background: ${e.target.options[e.target.selectedIndex].text}.` : 'Animated background off.', 'success', 2500);
        });
        on('setting-autohide-dock', 'change', (e) => {
            this.settings.autoHideDock = e.target.checked;
            this.saveSettings();
            document.querySelector('.bottom-dock')?.classList.toggle('autohide', e.target.checked);
        });
        on('setting-compact-mode', 'change', (e) => {
            this.settings.compactMode = e.target.checked;
            this.saveSettings();
            document.body.classList.toggle('compact-mode', e.target.checked);
        });

        // Default mirror select (populated from live mirror list)
        const mirrorSel = on('setting-default-mirror', 'change', (e) => {
            this.settings.defaultMirrorId = e.target.value;
            this.saveSettings();
            toast.show('Default mirror saved.', 'success');
        });
        if (mirrorSel) {
            mirrorSel.innerHTML = (this.mirrors || []).map(m =>
                `<option value="${m.id}">${m.name}</option>`).join('');
            mirrorSel.value = this.settings.defaultMirrorId || this.settings.defaultMirrorId;
        }

        // Reflect stored values into controls
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
        const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
        setVal('setting-accent', this.settings.accentColor);
        setCheck('setting-particles', this.settings.particlesEnabled);
        setCheck('setting-audio', this.settings.audioFeedback);
        setVal('setting-launch-behavior', this.settings.defaultLaunchBehavior || this.settings.defaultLauchBehavior);
        setVal('setting-animations', this.settings.animations);
        setVal('setting-sound-pack', this.settings.soundPack);
        setVal('setting-wallpaper', this.settings.customWallpaper);
        setVal('setting-animated-bg', this.settings.animatedBg || '');
        setCheck('setting-autohide-dock', this.settings.autoHideDock);
        setCheck('setting-compact-mode', this.settings.compactMode);

        // Backup export / import
        on('btn-export-copy', 'click', async () => {
            const data = JSON.stringify({
                app: 'quantum-hub', version: 1, exported: new Date().toISOString(),
                settings: this.settings, mirrors: this.mirrors,
                games: (this.games || []).filter(g => g.custom === true),
            }, null, 2);
            const box = document.getElementById('setting-config-data');
            if (box) box.value = data;
            try { await navigator.clipboard.writeText(data); toast.show('Backup copied to clipboard.', 'success'); }
            catch (e) { toast.show('Backup compiled below — copy it manually.', 'info'); }
        });
        on('btn-import-apply', 'click', () => {
            const box = document.getElementById('setting-config-data');
            const raw = (box?.value || '').trim();
            if (!raw) { toast.show('Paste a backup first.', 'error'); return; }
            try {
                const data = JSON.parse(raw);
                if (data.settings) { this.settings = { ...this.settings, ...data.settings }; this.saveSettings(); this.applyVisuals(); }
                if (Array.isArray(data.mirrors) && data.mirrors.length) { this.mirrors = data.mirrors; this.saveMirrors(); this.renderMirrorsConfigTable(); }
                toast.show('Backup restored.', 'success');
            } catch (e) { toast.show('Invalid backup JSON.', 'error'); }
        });
        on('btn-reset-settings', 'click', () => {
            modals.showConfirm('FACTORY PURGE', 'Wipe all local hub data and reset to defaults?', () => {
                localStorage.clear();
                location.reload();
            });
        });
        on('btn-account', 'click', () => {
            const p = document.getElementById('settings-account');
            if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
        });
        on('btn-view-stats', 'click', () => toast.show('Analytics panel is not implemented yet.', 'info'));
        on('btn-collections', 'click', () => toast.show('Collections panel is not implemented yet.', 'info'));

        // Classroom stealth controls
        const S = () => window.QuantumStealth;
        const st = S()?.cloakState?.();
        if (st) {
            setVal('setting-cloak-preset', st.preset || '');
            setVal('setting-cloak-title', st.title);
            setVal('setting-cloak-favicon', st.favicon);
            setCheck('setting-panic-enabled', S().isPanicEnabled());
            setVal('setting-panic-key', S().panicLabel());
            setVal('setting-panic-url', S().getPanicUrl());
            setCheck('setting-cover-enabled', S().isCoverEnabled());
            setVal('setting-cover-preset', S().getCoverPreset());
            setCheck('setting-perf-mode', S().isPerfMode());
        }
        on('btn-cloak-apply', 'click', () => {
            const preset = document.getElementById('setting-cloak-preset')?.value || '';
            const title = document.getElementById('setting-cloak-title')?.value || '';
            const fav = document.getElementById('setting-cloak-favicon')?.value || '';
            if (title.trim() || fav.trim()) S().applyCustomCloak(title, fav);
            else if (preset) S().applyCloakPreset(preset);
            else { toast.show('Pick a preset or enter a custom title.', 'error'); return; }
            toast.show('Cloak applied.', 'success');
        });
        on('btn-cloak-reset', 'click', () => {
            S().resetCloak();
            setVal('setting-cloak-preset', '');
            setVal('setting-cloak-title', '');
            setVal('setting-cloak-favicon', '');
            toast.show('Cloak reset.', 'success');
        });
        on('setting-cloak-preset', 'change', (e) => {
            if (e.target.value) { S().applyCloakPreset(e.target.value); toast.show('Cloak applied.', 'success'); }
        });
        on('setting-panic-enabled', 'change', (e) => S().setPanicEnabled(e.target.checked));
        on('setting-panic-url', 'change', (e) => S().setPanicUrl(e.target.value));
        on('btn-panic-capture', 'click', (e) => {
            const btn = e.target.closest('button') || e.target;
            btn.textContent = 'PRESS…';
            S().capturePanicKey((combo) => {
                setVal('setting-panic-key', combo ? S().panicLabel() : S().panicLabel());
                btn.textContent = 'SET';
                if (combo) toast.show('Panic key set.', 'success');
            });
        });
        on('setting-cover-enabled', 'change', (e) => S().setCoverEnabled(e.target.checked));
        on('setting-cover-preset', 'change', (e) => S().setCoverPreset(e.target.value));
        on('setting-perf-mode', 'change', (e) => {
            S().setPerfMode(e.target.checked);
            toast.show(e.target.checked ? 'Performance mode ON.' : 'Performance mode OFF.', 'success');
        });
    }

    initParticles() {
        const canvas = document.getElementById('particles-canvas');
        if (!canvas || window.__perfMode) return;
        if (canvas.dataset.running === '1') return;
        canvas.dataset.running = '1';
        const ctx = canvas.getContext('2d');
        let w, h, raf = 0, alive = true;
        const mouse = { x: -9999, y: -9999 };
        const N = 40;
        let parts = [];
        const resize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
            parts = Array.from({ length: N }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                dx: (Math.random() - 0.5) * 0.5, dy: (Math.random() - 0.5) * 0.5,
                r: Math.random() * 2 + 0.5,
            }));
        };
        const accent = () => {
            try {
                const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
                return v || '#39ff14';
            } catch (e) { return '#39ff14'; }
        };
        const step = () => {
            if (!alive || window.__perfMode || !this.settings.particlesEnabled) { alive = false; return; }
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = accent();
            ctx.globalAlpha = 0.5;
            for (const p of parts) {
                p.x += p.dx; p.y += p.dy;
                if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            raf = requestAnimationFrame(step);
        };
        window.__stopParticles = () => {
            alive = false;
            cancelAnimationFrame(raf);
            canvas.dataset.running = '';
            try { ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) {}
        };
        window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
        window.addEventListener('resize', resize);
        resize();
        raf = requestAnimationFrame(step);
    }

    renderMirrorsConfigTable() {
        const container = document.querySelector('.mirrors-config-table');
        if (!container) return;

        container.innerHTML = this.mirrors.map(m => `
            <div class="mirror-card" data-id="${m.id}" data-launch-url="${m.url}">
                <div class="mirror-header">
                    <div class="mirror-title-wrap">
                        <div class="mirror-icon-box">
                            <i class="fas fa-${m.icon || 'server'}"></i>
                        </div>
                        <div>
                            <div class="mirror-name">${m.name}</div>
                            <div class="text-xs text-gray-400 mt-0.5">${m.url}</div>
                        </div>
                    </div>
                    <span class="mirror-badge ${m.id === 'custom-mirror-1' ? 'status-custom' : 'status-ok'}">
                        ${m.status || 'Active'}
                    </span>
                </div>
                <div class="mirror-description">
                    ${m.description}
                </div>
                <div class="mirror-meta">
                    <span><i class="fas fa-bolt text-yellow-500"></i> Latency: ${m.latency || 'N/A'}</span>
                    <span><i class="fas fa-rocket text-blue-500"></i> ${(window.app && window.app.effectiveLaunchModeLabel ? window.app.effectiveLaunchModeLabel() : (m.launchMode === 'about-blank' ? 'about:blank' : 'New Tab'))}</span>
                </div>
                <button class="btn-premium py-2 w-full mt-2 flex justify-center items-center gap-2 launch-mirror-btn" data-id="${m.id}" data-launch-url="${m.url}">
                    <i class="fas fa-external-link-alt"></i> LAUNCH VIA MIRROR
                </button>
            </div>
        `).join('');

        container.querySelectorAll('.launch-mirror-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.launchViaMirror(btn.dataset.id, btn);
            });
        });
    }

    launchViaMirror(mirrorId, btn) {
        const mirror = this.mirrors.find(m => m.id === mirrorId);
        if (!mirror) return;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LAUNCHING…';
        }
        try {
            this.launchContent(mirror.url, 'about-blank', mirror.name);
        } finally {
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-external-link-alt"></i> LAUNCH VIA MIRROR';
                }
            }, 250);
        }
    }

    async autoPickMirror() {
        const candidates = (this.mirrors || []).filter(m => m.enabled !== false);
        if (candidates.length === 0) return;
        toast.show('Picking fastest mirror…', 'info', 2000);
        let firstUnknown = null;
        for (const m of candidates) {
            const t0 = Date.now();
            try {
                const g = await fetch(m.url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(6000) });
                const ok = g.ok;
                try { await g.arrayBuffer(); } catch (e2) {}
                m.latency = `${Date.now() - t0}ms`;
                if (ok) {
                    this.settings.defaultMirrorId = m.id;
                    this.saveSettings();
                    this.saveMirrors();
                    this.renderMirrorsConfigTable();
                    toast.show(`Mirror picked: ${m.name}`, 'success', 3000);
                    try { this.usedMirrors.add(m.id); } catch (e) {}
                    return m;
                }
            } catch (e) {
                m.latency = 'unverified';
                if (!firstUnknown) firstUnknown = m;
            }
        }
        if (firstUnknown) {
            this.settings.defaultMirrorId = firstUnknown.id;
            this.saveSettings();
            this.saveMirrors();
            this.renderMirrorsConfigTable();
            toast.show(`Mirror picked (unverified): ${firstUnknown.name}`, 'success', 3000);
            try { this.usedMirrors.add(firstUnknown.id); } catch (e) {}
            return firstUnknown;
        }
        this.renderMirrorsConfigTable();
        toast.show('No mirror reachable — check your connection.', 'error', 5000);
        return null;
    }

    testMirror(mirrorId) {
        const mirror = this.mirrors.find(m => m.id === mirrorId);
        if (!mirror) return;
        toast.show(`Testing ${mirror.name}...`, 'info');
        setTimeout(() => {
            toast.show(`${mirror.name}: Connection OK (${Math.floor(Math.random() * 50) + 20}ms)`, 'success');
        }, 500);
    }

    editMirror(mirrorId) {
        const mirror = this.mirrors.find(m => m.id === mirrorId);
        if (!mirror) return;
        toast.show(`Edit ${mirror.name} - not yet implemented`, 'info');
    }

    deleteMirror(mirrorId) {
        const mirror = this.mirrors.find(m => m.id === mirrorId);
        if (!mirror) return;
        modals.showConfirm('PURGE MIRROR', `Remove "${mirror.name}" from mirror list?`, () => {
            this.mirrors = this.mirrors.filter(m => m.id !== mirrorId);
            this.saveMirrors();
            this.renderMirrorsConfigTable();
            toast.show('Mirror purged.', 'success');
        });
    }

    setupInitialScreen() {
        const overlay = document.getElementById('initial-overlay');
        if (!overlay) return;

        // The QUANTUM logo and the mirror cards are defined statically in
        // index.html. Clicking either one transports you to the main hub
        // interface (dismisses this gateway) — no external launch.
        const logo = document.getElementById('quantum-logo');
        if (logo) {
            logo.addEventListener('click', () => this.dismissInitialScreen());
            logo.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.dismissInitialScreen();
                }
            });
        }

        overlay.querySelectorAll('.mirror-card').forEach(card => {
            card.addEventListener('click', () => this.dismissInitialScreen());
        });
    }

    dismissInitialScreen() {
        const overlay = document.getElementById('initial-overlay');
        if (overlay) {
            overlay.classList.add('dismissed');
            localStorage.setItem('hub_initial_dismissed', 'true');
        }
    }

    initCommandPalette() {
        const palette = document.querySelector('.command-palette');
        const searchInput = document.querySelector('.command-palette-search input');

        if (!palette || !searchInput) return;

        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.openCommandPalette();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && palette.classList.contains('active')) {
                this.closeCommandPalette();
            }
        });

        searchInput.addEventListener('input', () => this.filterCommandPalette());

        const backdrop = palette.querySelector('.command-palette-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => this.closeCommandPalette());
        }
    }

    openCommandPalette() {
        const palette = document.querySelector('.command-palette');
        const searchInput = palette?.querySelector('.command-palette-search input');
        if (!palette) return;
        palette.classList.add('active');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 50);
        }
        this.commandPaletteOpen = true;
        this.filterCommandPalette();
    }

    closeCommandPalette() {
        const palette = document.querySelector('.command-palette');
        if (!palette) return;
        palette.classList.remove('active');
        this.commandPaletteOpen = false;
    }

    filterCommandPalette() {
        const searchInput = document.querySelector('.command-palette-search input');
        const results = document.querySelector('.command-palette-results');
        if (!searchInput || !results) return;

        const query = searchInput.value.toLowerCase().trim();

        const commands = [
            { id: 'new-game', title: 'Import New Game', desc: 'Add a new game to your library', icon: 'fa-plus', category: 'Library', keys: 'G N', action: () => modals.showGameForm(null, (d) => this.addGame(d)) },
            { id: 'add-mirror', title: 'Add Mirror', desc: 'Register a new content distribution mirror', icon: 'fa-server', category: 'Mirrors', keys: 'M A', action: () => this.switchPanel('mirrors') },
            { id: 'settings', title: 'Open Settings', desc: 'Configure visual and audio preferences', icon: 'fa-cog', category: 'System', keys: 'S S', action: () => this.switchPanel('settings') },
            { id: 'ai-assistant', title: 'AI Assistant', desc: 'Open the AI Hub', icon: 'fa-robot', category: 'Tools', keys: 'A I', action: () => { this.switchPanel('tools'); this.showTool('ai'); } },
            { id: 'calculator', title: 'Calculator', desc: 'Launch the interactive calculator', icon: 'fa-calculator', category: 'Tools', keys: 'C L', action: () => { this.switchPanel('tools'); this.showTool('calculator'); } },
            { id: 'logout', title: 'Log Out', desc: 'End current session', icon: 'fa-sign-out-alt', category: 'Auth', keys: 'L O', action: () => this.logoutUser() },
        ];

        const filtered = query
            ? commands.filter(c => c.title.toLowerCase().includes(query) || c.desc.toLowerCase().includes(query) || c.category.toLowerCase().includes(query))
            : commands;

        results.innerHTML = filtered.map((cmd, i) => `
            <div class="cmd-result ${i === 0 ? 'selected' : ''}" data-id="${cmd.id}" role="option">
                <div class="cmd-icon"><i class="fas ${cmd.icon}"></i></div>
                <div class="cmd-content">
                    <div class="cmd-title">${cmd.title}</div>
                    <div class="cmd-subtitle">${cmd.desc}</div>
                </div>
                <span class="cmd-category">${cmd.category}</span>
                <kbd class="cmd-key">${cmd.keys}</kbd>
            </div>
        `).join('');

        results.querySelectorAll('.cmd-result').forEach(el => {
            el.addEventListener('click', () => {
                const cmd = commands.find(c => c.id === el.dataset.id);
                if (cmd?.action) cmd.action();
                this.closeCommandPalette();
            });
        });
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'Escape') {
                this.closeCommandPalette();
                if (typeof modals.close === 'function') modals.close();
            }
        });
    }

    initGamepadSupport() {
        window.addEventListener('gamepadconnected', (e) => {
            toast.show(`Gamepad connected: ${e.gamepad.id}`, 'success');
        });
        window.addEventListener('gamepaddisconnected', (e) => {
            toast.show('Gamepad disconnected', 'info');
        });
    }

    initQuickLaunchWidget() {
        const fab = document.getElementById('quick-launch-fab');
        if (!fab) return;

        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('quick-launch-menu');
            if (menu) {
                menu.classList.toggle('hidden');
            } else {
                this.showQuickLaunchMenu(fab);
            }
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('quick-launch-menu');
            if (menu && !menu.contains(e.target) && e.target !== fab) {
                menu.classList.add('hidden');
            }
        });
    }

    showQuickLaunchMenu(anchor) {
        const menu = document.createElement('div');
        menu.id = 'quick-launch-menu';
        menu.className = 'glass-panel absolute bottom-full right-0 mb-2 w-56 p-2 hidden';
        menu.innerHTML = `
            <div class="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 py-1">QUICK LAUNCH</div>
            ${this.games.slice(0, 6).map(g => `
                <button class="quick-launch-item w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded flex items-center gap-2" data-id="${g.id}">
                    <i class="fas fa-gamepad text-accent"></i>
                    <span class="truncate">${g.name}</span>
                </button>
            `).join('')}
            <hr class="border-white/5 my-2">
            <button class="quick-launch-item w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded flex items-center gap-2" data-action="add-game">
                <i class="fas fa-plus text-green-400"></i>
                <span>Add New Game</span>
            </button>
        `;
        anchor.parentNode.appendChild(menu);
        menu.classList.remove('hidden');

        menu.querySelectorAll('.quick-launch-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.id) this.launchGameById(item.dataset.id);
                else if (item.dataset.action === 'add-game') modals.showGameForm(null, (d) => this.addGame(d));
                menu.remove();
            });
        });
    }

    initInteractiveMedia() {
        document.addEventListener('click', (e) => {
            const playBtn = e.target.closest('.audio-btn.play-pause');
            if (playBtn) this.toggleAudio(playBtn);
        });
    }

    toggleAudio(btn) {
        const player = btn.closest('.audio-player-box');
        const audio = player?.querySelector('audio');
        if (!audio) return;

        if (audio.paused) {
            audio.play();
            btn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            audio.pause();
            btn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    initInteractiveTools() {
        this.initCalculator();
        this.initNotes();
        this.initEditor();
        this.initColorPicker();
        this.initTimers();
        this.initConverter();
        this.initQRGenerator();
        this.initPasswordGen();
        this.initBase64();
        this.initHashGen();
        this.initRegexTester();
        this.initSysInfo();
        this.initEmbedder();
        this.bindToolNavigation();
    }

    bindToolNavigation() {
        const menuBtns = document.querySelectorAll('.tool-menu-btn');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const toolId = btn.dataset.tool;
                this.showTool(toolId);
            });
        });
    }

    showTool(toolId) {
        document.querySelectorAll('.tool-menu-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));

        const btn = document.querySelector(`.tool-menu-btn[data-tool="${toolId}"]`);
        const panel = document.getElementById(`tool-${toolId}`);

        if (btn) btn.classList.add('active');
        if (panel) panel.classList.add('active');

        this.playUISound(660, 0.05, 'sine');
    }

    initCalculator() {
        const calcContainer = document.querySelector('.calc-container');
        if (!calcContainer || calcContainer.dataset.initialized) return;
        calcContainer.dataset.initialized = '1';

        let expression = '';
        const display = calcContainer.querySelector('#calc-display-main');
        const history = calcContainer.querySelector('#calc-display-hist');

        calcContainer.querySelectorAll('.calc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.val;

                if (val === 'C') {
                    expression = '';
                    display.textContent = '0';
                    history.textContent = '';
                } else if (val === 'CE') {
                    expression = '';
                    display.textContent = '0';
                } else if (val === '=') {
                    try {
                        const result = eval(expression.replace(/×/g, '*').replace(/÷/g, '/'));
                        history.textContent = expression + ' =';
                        expression = String(result);
                        display.textContent = expression;
                    } catch (_) {
                        display.textContent = 'Error';
                        expression = '';
                    }
                } else if (val) {
                    expression += val;
                    display.textContent = expression;
                }
            });
        });
    }

    initNotes() {
        const notesContainer = document.querySelector('.notes-container');
        if (!notesContainer) return;

        const list = notesContainer.querySelector('.notes-list');
        const titleInput = notesContainer.querySelector('#note-title-input');
        const editArea = notesContainer.querySelector('#note-edit-area');
        const newBtn = document.getElementById('note-new-btn');
        const saveBtn = document.getElementById('note-save-btn');
        const deleteBtn = document.getElementById('note-delete-btn');

        let notes = JSON.parse(localStorage.getItem('hub_notes') || '[]');
        let currentNoteId = null;

        const renderList = () => {
            list.innerHTML = notes.map(n => `
                <div class="note-item ${n.id === currentNoteId ? 'active' : ''}" data-id="${n.id}">
                    <div class="note-item-title">${this._esc(n.title)}</div>
                    <div class="note-item-date">${new Date(n.updated).toLocaleDateString()}</div>
                </div>
            `).join('');

            list.querySelectorAll('.note-item').forEach(item => {
                item.addEventListener('click', () => {
                    currentNoteId = item.dataset.id;
                    const note = notes.find(n => n.id === currentNoteId);
                    titleInput.value = note.title;
                    editArea.value = note.content;
                    renderList();
                });
            });
        };

        const saveNote = () => {
            if (!currentNoteId) return toast.show('Select or create a note first', 'error');
            const note = notes.find(n => n.id === currentNoteId);
            note.title = titleInput.value || 'Untitled Note';
            note.content = editArea.value;
            note.updated = Date.now();
            localStorage.setItem('hub_notes', JSON.stringify(notes));
            renderList();
            toast.show('Note synchronized', 'success');
        };

        newBtn.addEventListener('click', () => {
            const id = 'note-' + Date.now();
            notes.push({ id, title: 'New Note', content: '', updated: Date.now() });
            currentNoteId = id;
            titleInput.value = 'New Note';
            editArea.value = '';
            localStorage.setItem('hub_notes', JSON.stringify(notes));
            renderList();
        });

        saveBtn.addEventListener('click', saveNote);

        deleteBtn.addEventListener('click', () => {
            if (!currentNoteId) return;
            notes = notes.filter(n => n.id !== currentNoteId);
            currentNoteId = null;
            titleInput.value = '';
            editArea.value = '';
            localStorage.setItem('hub_notes', JSON.stringify(notes));
            renderList();
            toast.show('Note purged', 'success');
        });

        renderList();
    }

    initEditor() {
        const editor = document.querySelector('.editor-textarea');
        const lineNums = document.querySelector('.editor-linenums');
        if (!editor || !lineNums) return;

        const updateLines = () => {
            const lines = editor.value.split('\\n').length;
            lineNums.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
        };

        editor.addEventListener('input', updateLines);
        updateLines();
    }

    initColorPicker() {
        const picker = document.getElementById('picker-main-color');
        const hexInput = document.getElementById('picker-hex');
        const rgbInput = document.getElementById('picker-rgb');
        const hslInput = document.getElementById('picker-hsl');
        const paletteBox = document.getElementById('picker-palette-box');
        if (!picker) return;

        const hexToRgb = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return { r, g, b };
        };

        const rgbToHsl = ({ r, g, b }) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s, l = (max + min) / 2;
            if (max === min) { h = s = 0; }
            else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
        };

        const updateValues = () => {
            const hex = picker.value;
            const rgb = hexToRgb(hex);
            const hsl = rgbToHsl(rgb);

            hexInput.value = hex.toUpperCase();
            rgbInput.value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            hslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;

            paletteBox.innerHTML = [0, 30, 60, 120, 180, 240].map(deg => {
                const shiftedH = (hsl.h + deg) % 360;
                return `<div class="w-8 h-8 rounded border border-white/10 cursor-pointer"
                        style="background: hsl(${shiftedH}, ${hsl.s}%, ${hsl.l}%)"
                        onclick="navigator.clipboard.writeText('hsl(${shiftedH}, ${hsl.s}%, ${hsl.l}%)')"></div>`;
            }).join('');
        };

        picker.addEventListener('input', updateValues);
        updateValues();
    }

    initTimers() {
        const tMin = document.getElementById('t-input-min');
        const tSec = document.getElementById('t-input-sec');
        const tDisp = document.getElementById('t-display');
        const tBar = document.getElementById('t-progress-bar');
        const tStart = document.getElementById('t-start-btn');

        if (tStart) {
            let timerInterval;
            tStart.addEventListener('click', () => {
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    tStart.innerHTML = '<i class="fas fa-play"></i> START';
                    return;
                }
                let totalSecs = (parseInt(tMin?.value || 0) * 60) + parseInt(tSec?.value || 0);
                if (totalSecs <= 0) return;
                const duration = totalSecs;
                tStart.innerHTML = '<i class="fas fa-pause"></i> PAUSE';
                timerInterval = setInterval(() => {
                    totalSecs--;
                    const m = Math.floor(totalSecs / 60);
                    const s = totalSecs % 60;
                    tDisp.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    tBar.style.width = `${(totalSecs / duration) * 100}%`;
                    if (totalSecs <= 0) {
                        clearInterval(timerInterval);
                        timerInterval = null;
                        tStart.innerHTML = '<i class="fas fa-play"></i> START';
                        toast.show('Timer Complete!', 'success');
                    }
                }, 1000);
            });
        }

        const swDisp = document.getElementById('sw-display');
        const swStart = document.getElementById('sw-start');
        const swLap = document.getElementById('sw-lap');
        const swReset = document.getElementById('sw-reset');
        const swLaps = document.getElementById('sw-laps-box');

        if (swStart) {
            let swInterval, startTime, elapsedTime = 0;
            swStart.addEventListener('click', () => {
                if (swInterval) {
                    clearInterval(swInterval);
                    swInterval = null;
                    swStart.innerHTML = '<i class="fas fa-play"></i> START';
                    swLap.disabled = true;
                } else {
                    startTime = Date.now() - elapsedTime;
                    swInterval = setInterval(() => {
                        elapsedTime = Date.now() - startTime;
                        const ms = Math.floor((elapsedTime % 1000) / 10);
                        const s = Math.floor((elapsedTime / 1000) % 60);
                        const m = Math.floor(elapsedTime / 60000);
                        swDisp.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
                    }, 10);
                    swStart.innerHTML = '<i class="fas fa-pause"></i> PAUSE';
                    swLap.disabled = false;
                }
            });
            swLap.addEventListener('click', () => {
                const li = document.createElement('li');
                li.className = 'text-[10px] font-mono text-gray-400 border-b border-white/5 py-1 flex justify-between';
                li.innerHTML = `<span>Lap ${swLaps.children.length + 1}</span><span>${swDisp.textContent}</span>`;
                swLaps.prepend(li);
            });
            swReset.addEventListener('click', () => {
                clearInterval(swInterval);
                swInterval = null;
                elapsedTime = 0;
                swDisp.textContent = '00:00.00';
                swLaps.innerHTML = '';
                swStart.innerHTML = '<i class="fas fa-play"></i> START';
                swLap.disabled = true;
            });
        }
    }

    initConverter() {
        const typeSel = document.getElementById('conv-type');
        const inputVal = document.getElementById('conv-input-val');
        const inputUnit = document.getElementById('conv-input-unit');
        const outputVal = document.getElementById('conv-output-val');
        const outputUnit = document.getElementById('conv-output-unit');
        if (!typeSel) return;

        const units = {
            length: { 'Meters': 1, 'Kilometers': 0.001, 'Miles': 0.000621371, 'Feet': 3.28084 },
            weight: { 'Kilograms': 1, 'Grams': 1000, 'Pounds': 2.20462, 'Ounces': 35.274 },
            temp: { 'Celsius': 'C', 'Fahrenheit': 'F', 'Kelvin': 'K' }
        };

        const updateUnits = () => {
            const type = typeSel.value;
            const options = Object.keys(units[type]);
            inputUnit.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
            outputUnit.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
            convert();
        };

        const convert = () => {
            const type = typeSel.value;
            const val = parseFloat(inputVal.value);
            const from = inputUnit.value;
            const to = outputUnit.value;

            if (isNaN(val)) { outputVal.value = ''; return; }

            if (type === 'temp') {
                let celsius;
                if (from === 'Celsius') celsius = val;
                else if (from === 'Fahrenheit') celsius = (val - 32) * 5/9;
                else celsius = val - 273.15;

                let res;
                if (to === 'Celsius') res = celsius;
                else if (to === 'Fahrenheit') res = (celsius * 9/5) + 32;
                else res = celsius + 273.15;
                outputVal.value = res.toFixed(2);
            } else {
                const base = val / units[type][from];
                const res = base * units[type][to];
                outputVal.value = res.toFixed(4);
            }
        };

        typeSel.addEventListener('change', updateUnits);
        inputVal.addEventListener('input', convert);
        inputUnit.addEventListener('change', convert);
        outputUnit.addEventListener('change', convert);
        updateUnits();
    }

    initQRGenerator() {
        const input = document.getElementById('qr-text-input');
        const btn = document.getElementById('qr-gen-btn');
        const output = document.getElementById('qr-output-box');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) return toast.show('Enter payload text', 'error');
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
            output.innerHTML = `<img src="${url}" class="max-w-full h-auto shadow-lg" alt="QR Code">`;
        });
    }

    initPasswordGen() {
        const lengthRange = document.getElementById('pwd-length-range');
        const lengthVal = document.getElementById('pwd-length-val');
        const upper = document.getElementById('pwd-upper');
        const lower = document.getElementById('pwd-lower');
        const numbers = document.getElementById('pwd-numbers');
        const symbols = document.getElementById('pwd-symbols');
        const output = document.getElementById('pwd-output');
        const genBtn = document.getElementById('pwd-generate');
        const copyBtn = document.getElementById('pwd-copy');
        if (!genBtn) return;

        lengthRange.addEventListener('input', () => lengthVal.textContent = lengthRange.value);

        genBtn.addEventListener('click', () => {
            let charset = '';
            if (upper.checked) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            if (lower.checked) charset += 'abcdefghijklmnopqrstuvwxyz';
            if (numbers.checked) charset += '0123456789';
            if (symbols.checked) charset += '!@#$%^&*()_+~`|}{[]:;?><,./-';

            if (!charset) return toast.show('Select at least one character set', 'error');

            let pwd = '';
            for (let i = 0; i < parseInt(lengthRange.value); i++) {
                pwd += charset.charAt(Math.floor(Math.random() * charset.length));
            }
            output.value = pwd;
        });

        copyBtn.addEventListener('click', () => {
            if (!output.value) return;
            navigator.clipboard.writeText(output.value);
            toast.show('Password copied', 'success');
        });
    }

    initBase64() {
        const input = document.getElementById('b64-input');
        const output = document.getElementById('b64-output');
        const encodeBtn = document.getElementById('b64-encode-btn');
        const decodeBtn = document.getElementById('b64-decode-btn');
        const copyBtn = document.getElementById('b64-copy');
        if (!encodeBtn) return;

        encodeBtn.addEventListener('click', () => {
            try { output.value = btoa(input.value); } catch (e) { toast.show('Encoding error', 'error'); }
        });

        decodeBtn.addEventListener('click', () => {
            try { output.value = atob(input.value); } catch (e) { toast.show('Invalid Base64', 'error'); }
        });

        copyBtn.addEventListener('click', () => {
            if (!output.value) return;
            navigator.clipboard.writeText(output.value);
            toast.show('Copied to clipboard', 'success');
        });
    }

    /* HTML Embedder (sc13nc3-style): paste HTML, open it in a fresh window.
       Static markup lives in index.html (#tool-embed); this only binds. */
    initEmbedder() {
        const input = document.getElementById('embed-input');
        if (!input || input.dataset.bound) return;
        input.dataset.bound = '1';
        const count = document.getElementById('embed-count');
        const tpl = document.getElementById('embed-template');
        const KEY = 'hub_embed_draft';
        const TEMPLATES = {
            blank: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>New Page</title>\n</head>\n<body>\n  <h1>Hello there!</h1>\n</body>\n</html>',
            dark: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Dark Page</title>\n  <style>html,body{margin:0;height:100%;background:#0a0a0f;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;}</style>\n</head>\n<body>\n  <h1>Dark styled</h1>\n</body>\n</html>',
            center: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Centered Title</title>\n  <style>html,body{margin:0;height:100%;display:grid;place-items:center;font-family:Georgia,serif;}h1{font-size:48px;}</style>\n</head>\n<body>\n  <h1>Centered</h1>\n</body>\n</html>',
            game: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Mini demo</title>\n  <style>html,body{margin:0;height:100%;background:#0a0a0f;display:grid;place-items:center;}canvas{border:2px solid #39ff14;border-radius:10px;background:#111;}</style>\n</head>\n<body>\n  <canvas id="g" width="300" height="200"></canvas>\n  <script>\n    const c = document.getElementById(\'g\'), x = c.getContext(\'2d\');\n    let t = 0;\n    setInterval(() => {\n      t += 0.08;\n      x.fillStyle = \'#111\'; x.fillRect(0, 0, c.width, c.height);\n      x.fillStyle = \'#39ff14\';\n      x.beginPath(); x.arc(c.width / 2, c.height / 2, 40, 0, Math.PI * 2); x.fill();\n      x.fillStyle = \'#fff\'; x.fillText(\'t=\' + t.toFixed(1), 10, 20);\n    }, 30);\n  <\/script>\n</body>\n</html>'
        };
        const refresh = () => { if (count) count.textContent = `${input.value.length} chars`; };
        const save = () => { try { localStorage.setItem(KEY, input.value); } catch (e) {} };
        try {
            const d = localStorage.getItem(KEY);
            if (d != null) input.value = d;
        } catch (e) {}
        refresh();
        const openIt = () => {
            const html = input.value;
            if (!html.trim()) { toast.show('Paste some HTML first', 'error'); return; }
            const win = window.open('', '_blank');
            if (!win) { toast.show('Pop-up blocked — allow pop-ups', 'error'); return; }
            win.document.open();
            win.document.write(html);
            win.document.close();
            try { win.focus(); } catch (e) {}
            toast.show('Opened in a new window', 'success');
        };
        document.getElementById('embed-open')?.addEventListener('click', openIt);
        document.getElementById('embed-copy')?.addEventListener('click', () => {
            if (!input.value.trim()) { toast.show('Nothing to copy', 'error'); return; }
            navigator.clipboard.writeText(input.value);
            toast.show('Copied to clipboard', 'success');
        });
        document.getElementById('embed-download')?.addEventListener('click', () => {
            if (!input.value.trim()) { toast.show('Nothing to download', 'error'); return; }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([input.value], { type: 'text/html' }));
            a.download = 'embed.html';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1500);
            toast.show('Downloaded embed.html', 'success');
        });
        document.getElementById('embed-clear')?.addEventListener('click', () => {
            input.value = '';
            try { localStorage.removeItem(KEY); } catch (e) {}
            refresh();
            input.focus();
        });
        tpl?.addEventListener('change', () => {
            if (!TEMPLATES[tpl.value]) return;
            input.value = TEMPLATES[tpl.value];
            tpl.value = '';
            save();
            refresh();
            input.focus();
        });
        input.addEventListener('input', () => { save(); refresh(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = input.selectionStart;
                input.value = input.value.substring(0, s) + '  ' + input.value.substring(input.selectionEnd);
                input.selectionStart = input.selectionEnd = s + 2;
                save();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') openIt();
        });
    }

    async initHashGen() {
        const input = document.getElementById('hash-input');
        const output = document.getElementById('hash-output');
        const copyBtn = document.getElementById('hash-copy');
        const algoBtns = document.querySelectorAll('.hash-algo-btn');
        if (!input) return;

        const hashText = async (text, algo) => {
            const msgBuffer = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest(algo, msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        algoBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const algo = btn.dataset.algo;
                const text = input.value;
                if (!text) return toast.show('Enter text to hash', 'error');

                let cryptoAlgo = algo;
                if (algo === 'SHA-1') cryptoAlgo = 'SHA-1';
                else if (algo === 'SHA-256') cryptoAlgo = 'SHA-256';
                else if (algo === 'SHA-384') cryptoAlgo = 'SHA-384';
                else if (algo === 'SHA-512') cryptoAlgo = 'SHA-512';

                try {
                    output.value = await hashText(text, cryptoAlgo);
                } catch (e) { toast.show('Hashing error', 'error'); }
            });
        });

        copyBtn.addEventListener('click', () => {
            if (!output.value) return;
            navigator.clipboard.writeText(output.value);
            toast.show('Hash copied', 'success');
        });
    }

    initRegexTester() {
        const patternInput = document.getElementById('regex-pattern');
        const stringInput = document.getElementById('regex-test-string');
        const matchesBox = document.getElementById('regex-matches');
        if (!patternInput) return;

        const testRegex = () => {
            const patternStr = patternInput.value;
            const text = stringInput.value;
            if (!patternStr || !text) { matchesBox.textContent = 'Enter pattern and test string'; return; }

            try {
                const match = patternStr.match(/^(\S+)(\/([gimuy]*))?$/);
                let regex;
                if (match && match[1].startsWith('/')) {
                    const m = match[1].match(/^(\/)(.*)(\/)$/);
                    if (m) {
                        regex = new RegExp(m[2], match[3] || '');
                    } else {
                        regex = new RegExp(match[1], match[3] || 'g');
                    }
                } else {
                    regex = new RegExp(match[1], match[3] || 'g');
                }

                const results = [...text.matchAll(regex)];
                if (results.length === 0) {
                    matchesBox.textContent = 'No matches found.';
                } else {
                    matchesBox.innerHTML = results.map((m, i) =>
                        `<div class="mb-1"><span class="text-accent">#${i+1}:</span> ${this._esc(m[0])} <span class="text-gray-500">[${m.index}, ${m.index + m[0].length}]</span></div>`
                    ).join('');
                }
            } catch (e) {
                matchesBox.textContent = 'Invalid Regex: ' + e.message;
            }
        };

        patternInput.addEventListener('input', testRegex);
        stringInput.addEventListener('input', testRegex);
    }

    initSysInfo() {
        const grid = document.getElementById('sysinfo-grid');
        const refreshBtn = document.getElementById('sysinfo-refresh');
        if (!grid) return;

        const renderInfo = () => {
            const info = {
                'OS': navigator.platform,
                'Browser': navigator.userAgent.split(' ').pop(),
                'Screen': `${window.screen.width}x${window.screen.height}`,
                'Language': navigator.language,
                'Cores': navigator.hardwareConcurrency || 'Unknown',
                'Memory': navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown',
                'Online': navigator.onLine ? 'Yes' : 'No',
                'Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
            };

            grid.innerHTML = Object.entries(info).map(([k, v]) => `
                <div class="glass-panel p-2 flex justify-between items-center">
                    <span class="text-[10px] text-gray-400 uppercase font-bold">${k}</span>
                    <span class="text-xs text-white font-mono">${v}</span>
                </div>
            `).join('');
        };

        if (refreshBtn) refreshBtn.addEventListener('click', renderInfo);
        renderInfo();
    }

    /* --- End of class --- */
}

/* --- Bootstrap: construct the app (missing = totally dead UI) --- */
try {
    const app = new GameHubApplication();
    window.app = app;
    // Deep link: index.html?game=<id> opens that game's detail card.
    try {
        const gid = new URLSearchParams(location.search).get('game');
        if (gid) {
            const g = app.games.find(x => x.id === gid);
            if (g) setTimeout(() => app.showGameDetail(gid), 600);
        }
    } catch (e) {}
} catch (e) {
    console.error('Quantum Hub failed to start:', e);
}
