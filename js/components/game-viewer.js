/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * GameViewer - In-page iframe game viewer (beats plain sidebar demos).
 *
 * Reference pattern (sidebar + <iframe allow="autoplay; fullscreen; gamepad">)
 * plus what the reference lacks:
 *   - CDN mirror probing + manual mirror switcher
 *   - Loading state with per-host progress
 *   - Fullscreen toggle, pop-out (stealth about:blank popup), close (Esc)
 *   - Blocked-frame fallback (X-Frame-Options/CSP cannot be bypassed,
 *     so viewer offers Pop-out / Open directly when the frame stays blank)
 *
 * JS-only overlay: no index.html changes required.
 */

import { probeFirstReachable } from './mirror-loader.js?v=2026.10.11-6';
import { isMediaUrl, mediaFrameUrl } from './about-blank-launcher.js?v=2026.10.11-6';

let activeViewer = null;

function hostOf(url) {
    try {
        const u = new URL(url);
        // Relay options show their UPSTREAM host so the dropdown stays
        // readable: "relay→raw.githack.com" instead of three identical
        // "127.0.0.1" entries.
        if (u.pathname.startsWith('/relay/raw/')) {
            const m = u.pathname.slice('/relay/raw/'.length).match(/^https?:\/\/([^/]+)/);
            return m ? `relay→${m[1]}` : 'relay';
        }
        if (u.pathname === '/relay') return 'relay';
        return u.hostname;
    } catch (e) { return url; }
}

export function closeGameViewer() {
    if (activeViewer) {
        activeViewer.close();
        activeViewer = null;
    }
}

/**
 * @param {Object} opts
 * @param {string} opts.title - Game name
 * @param {string} opts.url - Primary absolute URL
 * @param {string[]} [opts.mirrors] - Fallback mirror URLs (probed in order)
 * @param {Function} [opts.onPopOut] - Called when user clicks pop-out
 * @returns {{close: Function}}
 */
export function openGameViewer(opts) {
    closeGameViewer();

    const title = opts.title || 'Game';
    const primary = opts.url;
    let mirrors = (opts.mirrors && opts.mirrors.length > 0) ? opts.mirrors : [primary];
    const onPopOut = typeof opts.onPopOut === 'function' ? opts.onPopOut : null;
    const imageUrl = opts.imageUrl || null;

    const safeTitle = String(title).replace(/</g, '&lt;');

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', safeTitle);
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:1rem;font-family:system-ui,sans-serif;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#0b0d12;border:1px solid var(--accent);border-radius:12px;width:min(1100px,100%);height:min(720px,92vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);';

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111;border-bottom:1px solid #222;color:var(--accent);font:12px monospace;flex-shrink:0;';

    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nameEl.textContent = title;

    const brandEl = document.createElement('span');
    brandEl.style.cssText = 'font-weight:700;color:var(--accent);white-space:nowrap;letter-spacing:1px;';
    brandEl.textContent = '◈ QUANTUM';

    const mirrorSel = document.createElement('select');
    mirrorSel.setAttribute('aria-label', 'Mirror host');
    mirrorSel.style.cssText = 'margin-left:8px;background:#000;color:var(--accent);border:1px solid #333;border-radius:4px;font:11px monospace;padding:4px;max-width:260px;';
    // Same-title copies (other catalog entries of THIS game) carry a label —
    // the option reads "Escape Road · petezahgames.com" so duplicate copies of
    // the same game are recognizable and selectable in the mirror picker.
    const mirrorLabels = (opts.mirrorLabels && typeof opts.mirrorLabels === 'object') ? opts.mirrorLabels : {};
    const labelFor = (u) => mirrorLabels[u] || null;
    mirrors.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        const tag = labelFor(m);
        o.textContent = `${i === 0 ? '★ ' : ''}${tag ? `${tag} · ` : ''}${hostOf(m)}`;
        mirrorSel.appendChild(o);
    });

    const btn = (label, titleAttr) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = titleAttr || label;
        b.style.cssText = 'background:transparent;color:#888;border:1px solid #333;border-radius:4px;font:11px monospace;padding:5px 10px;cursor:pointer;white-space:nowrap;';
        return b;
    };

    // Icon-only toolbar buttons (tooltips carry the labels).
    const fsBtn = btn('⛶', 'Toggle fullscreen');
    const refreshBtn = btn('↻', 'Reload current mirror');
    const popBtn = btn('↗ Pop-out', 'Open in stealth about:blank popup');
    const openBtn = btn('Open directly', 'Open game URL in a new tab');
    const closeBtn = btn('✕', 'Close viewer (Esc)');
    [fsBtn, refreshBtn, closeBtn].forEach((b) => {
        b.style.font = '15px system-ui, sans-serif';
        b.style.padding = '3px 9px';
        b.style.minWidth = '30px';
        b.style.textAlign = 'center';
    });

    // Universal pause: every media viewer (streams, direct clips, trailers)
    // gets a ⏸/▶ toolbar button. Same-origin clips (the hub's media-player
    // page) pause for real; YouTube obeys postMessage commands (trailer
    // embeds carry enablejsapi=1); cross-origin streams can't be driven by
    // script (browser security), so the button drops the click-shield,
    // focuses the player and leaves the user one click from the player's
    // own pause. Games never match any mode below — no button for them.
    let pauseBtn = null, pauseMode = null, ytPlaying = true, streamPlaying = true, seenPlayerEvent = false;
    try {
        if (isMediaUrl(primary)) pauseMode = 'media';
        else if (/youtube\.com\/embed|youtube-nocookie\.com\/embed/.test(primary)) pauseMode = 'youtube';
        else if (opts.shield === true || (opts.tv && typeof opts.tv.rebuild === 'function')) pauseMode = 'stream';
    } catch (e) { pauseMode = null; }

    const syncPauseIcon = () => {
        if (!pauseBtn) return;
        if (pauseMode === 'media') {
            try {
                const v = frame.contentDocument?.getElementById('v');
                if (v) { pauseBtn.textContent = v.paused ? '▶' : '⏸'; return; }
            } catch (e) { /* opaque origin (file://) — keep last icon */ }
            return;
        }
        if (pauseMode === 'youtube') pauseBtn.textContent = ytPlaying ? '⏸' : '▶';
        // Stream mode: unknown until the first PLAYER_EVENT status report;
        // assume playing (these players autostart).
        else if (pauseMode === 'stream') pauseBtn.textContent = streamPlaying ? '⏸' : '▶';
    };
    const onPauseBtn = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (closed) return;
        if (pauseMode === 'media') {
            try {
                const v = frame.contentDocument?.getElementById('v');
                if (v) {
                    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
                    setTimeout(syncPauseIcon, 60);
                    return;
                }
            } catch (err) { /* opaque origin — fall through to focus */ }
            try { frame.focus(); frame.contentWindow?.focus(); } catch (err) {}
            setStatus('Use the player controls below the video to pause.');
            return;
        }
        if (pauseMode === 'youtube') {
            try {
                ytPlaying = !ytPlaying;
                frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: ytPlaying ? 'playVideo' : 'pauseVideo', args: '' }), '*');
            } catch (err) {}
            syncPauseIcon();
            return;
        }
        // Cross-origin streams: command-channel players (vidsrc-type) pause
        // for real via {player:true,action} relayed down the frame chain;
        // players without a channel ignore it — then fall through to the
        // click handoff (shield down, frame focused, one click from pause).
        // While the player is still loading its first frame, keep the
        // shield up (that's the ad-redirect window) and say so.
        let streamCmd = false;
        try {
            frame.contentWindow?.postMessage({ player: true, action: (seenPlayerEvent && !streamPlaying) ? 'play' : 'pause' }, '*');
            streamCmd = true;
            if (seenPlayerEvent) streamPlaying = !streamPlaying;
            syncPauseIcon();
        } catch (err) {}
        try {
            if (shield) {
                if (shieldOn && !playerReady && !frameLoaded) {
                    setStatus('Player still loading — pause unlocks when it’s ready.');
                    return;
                }
                shieldOn = false; shieldTold = false; shieldSync();
            }
        } catch (err) {}
        try { frame.focus(); frame.contentWindow?.focus(); } catch (err) {}
        if (!streamCmd) setStatus('Player controls are live — click the video to pause.');
        else setStatus(streamPlaying ? 'Player controls are live — click the video to pause.' : 'Paused — press ⏸ to resume.');
    };
    if (pauseMode) {
        pauseBtn = btn('⏸', 'Pause / resume');
        pauseBtn.style.font = '15px system-ui, sans-serif';
        pauseBtn.style.padding = '3px 9px';
        pauseBtn.style.minWidth = '30px';
        pauseBtn.style.textAlign = 'center';
        pauseBtn.addEventListener('click', onPauseBtn);
    }

    const spacer = document.createElement('span');
    spacer.style.cssText = 'flex:1;';

    bar.appendChild(brandEl);
    bar.appendChild(nameEl);
    bar.appendChild(mirrorSel);

    // TV titles: change season/episode from the viewer while watching.
    // opts.tv.rebuild(s, e) returns the mirrors for the new episode (the
    // probe ranking from openWatch is preserved inside the closure).
    if (opts.tv && typeof opts.tv.rebuild === 'function') {
        const mkNum = (labelTxt, val, min) => {
            const wrap = document.createElement('label');
            wrap.style.cssText = 'display:flex;align-items:center;gap:4px;color:#888;font:11px monospace;white-space:nowrap;';
            wrap.textContent = labelTxt + ' ';
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = String(min);
            inp.value = String(val);
            inp.style.cssText = 'width:3.2rem;background:#000;color:var(--accent);border:1px solid #333;border-radius:4px;font:11px monospace;padding:3px 4px;';
            wrap.appendChild(inp);
            return { wrap, inp };
        };
        const sCtl = mkNum('S', opts.tv.s || 1, 1);
        const eCtl = mkNum('E', opts.tv.e || 1, 1);
        const applyEp = () => {
            const s2 = Math.max(1, parseInt(sCtl.inp.value, 10) || 1);
            const e2 = Math.max(1, parseInt(eCtl.inp.value, 10) || 1);
            sCtl.inp.value = String(s2);
            eCtl.inp.value = String(e2);
            if (s2 === opts.tv.s && e2 === opts.tv.e && frame.style.display === 'block') return;
            opts.tv.s = s2;
            opts.tv.e = e2;
            try { mirrors = opts.tv.rebuild(s2, e2) || mirrors; } catch (err) { return; }
            const idx = parseInt(mirrorSel.value, 10) || 0;
            frame.style.display = 'none';
            loading.style.display = 'flex';
            hint.style.display = 'none';
            if (shield) { shield.style.pointerEvents = 'auto'; }
            setStatus(`Loading S${s2}E${e2}…`);
            showFrame(mirrors[Math.min(idx, mirrors.length - 1)], Math.min(idx, mirrors.length - 1));
        };
        [sCtl, eCtl].forEach((c) => {
            c.inp.addEventListener('change', applyEp);
            c.inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') applyEp(); ev.stopPropagation(); });
        });
        bar.appendChild(sCtl.wrap);
        bar.appendChild(eCtl.wrap);
        const epBtn = btn('▶', 'Load this episode');
        epBtn.addEventListener('click', (ev) => { ev.preventDefault(); applyEp(); });
        bar.appendChild(epBtn);
    }

    bar.appendChild(spacer);
    bar.appendChild(fsBtn);
    bar.appendChild(refreshBtn);
    if (pauseBtn) bar.appendChild(pauseBtn);
    if (onPopOut) bar.appendChild(popBtn);
    bar.appendChild(openBtn);
    bar.appendChild(closeBtn);

    const stage = document.createElement('div');
    stage.style.cssText = 'position:relative;flex:1;background:#000;min-height:0;';

    const loading = document.createElement('div');
    loading.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--accent);font:13px monospace;';
    loading.innerHTML = '<div class="gv-spinner"></div><div class="gv-status">Probing mirrors…</div>';
    const style = document.createElement('style');
    style.textContent = '.gv-spinner{border:3px solid #1a1a3a;border-top-color:var(--accent);border-radius:50%;width:40px;height:40px;animation:gvspin 1s linear infinite}@keyframes gvspin{to{transform:rotate(360deg)}}';

    const frame = document.createElement('iframe');
    frame.setAttribute('allow', 'autoplay; fullscreen; gamepad');
    frame.setAttribute('allowfullscreen', '');
    // Movie-stream embeds (VidSrc/multiembed) actively detect a sandbox
    // attribute (frameElement.hasAttribute('sandbox')) and redirect to an
    // error page — so WATCH opens pass sandbox:false to drop it entirely.
    // Everything else keeps the locked-down sandbox (no popups/escapes).
    if (opts.sandbox !== false) {
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    }
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;display:none;';

    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:8;display:none;gap:8px;align-items:center;justify-content:center;padding:6px;background:rgba(0,0,0,0.8);color:#888;font:11px monospace;';
    hint.innerHTML = '<span>Blank screen? This site blocks framing (X-Frame-Options/CSP).</span>';

    const hintPop = btn('Pop-out instead', 'Open in popup');
    hint.appendChild(hintPop);

    // Persistent visible watermark over the gameplay stage.
    const wm = document.createElement('div');
    wm.textContent = '◈ QUANTUM HUB';
    wm.setAttribute('aria-hidden', 'true');
    wm.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:9;font:700 11px monospace;letter-spacing:2px;color:var(--accent);background:rgba(0,0,0,.55);border:1px solid var(--accent);border-radius:6px;padding:4px 8px;pointer-events:none;user-select:none;opacity:.85;';

    // Click shield (WATCH): the stream player runs unsandboxed, so an ad
    // overlay inside it can hijack clicks into redirects/popups. This overlay
    // swallows clicks before they ever reach the frame — no gesture, no
    // redirect. The hub cannot pause a cross-origin player itself, so the bar
    // hands control back ("Pass clicks") where the player's own click-to-pause
    // works natively.
    let shield = null, shieldBar = null, shieldOn = false, shieldTold = false, vsDisarm = null, playerReady = false;
    if (opts.shield === true) {
        shield = document.createElement('div');
        shield.setAttribute('aria-label', 'Click shield active');
        shield.style.cssText = 'position:absolute;inset:0;z-index:6;cursor:not-allowed;background:rgba(0,0,0,0.06);';
        shield.title = 'Click shield: clicks are blocked so ads cannot redirect you.';

        shieldBar = document.createElement('div');
        shieldBar.style.cssText = 'position:absolute;left:10px;top:10px;z-index:8;display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(0,0,0,.82);border:1px solid var(--accent);border-radius:999px;color:var(--accent);font:11px monospace;user-select:none;';
        const shieldTxt = document.createElement('span');
        shieldBar.appendChild(shieldTxt);
        const shieldBtn = document.createElement('button');
        shieldBtn.type = 'button';
        shieldBtn.style.cssText = 'background:transparent;color:#fff;border:1px solid var(--accent);border-radius:999px;font:11px monospace;padding:3px 10px;cursor:pointer;white-space:nowrap;';
        shieldBar.appendChild(shieldBtn);

        const shieldSync = () => {
            shield.style.pointerEvents = shieldOn ? 'auto' : 'none';
            shield.style.background = shieldOn ? 'rgba(0,0,0,0.06)' : 'transparent';
            shieldTxt.textContent = shieldOn
                ? '🛡 shield ON — clicks blocked'
                : '🛡 shield OFF — player gets clicks';
            shieldBtn.textContent = shieldOn ? 'Pass clicks' : 'Re-arm';
            shieldBtn.title = shieldOn
                ? 'Hand clicks to the player (click the video to pause; ads may click too)'
                : 'Block clicks again (stop ad redirects)';
        };
        shieldOn = true;
        shieldSync();

        // Video players need clicks to reach them (play/pause). The vidsrc
        // embed relays the player's own status messages up to the hub — when
        // the player reports it's loaded (PLAYER_TITLE/TV_INFO), hand clicks
        // back automatically so the user can press play without arming the
        // bar first. The shield still guards the load window against
        // instant-redirect ads, and "Re-arm" brings it back.
        vsDisarm = (ev) => {
            const d = ev.data;
            if (!d || typeof d !== 'object') return;
            // Live playback reports (vidsrc-type): sync the pause button to
            // the real player state.
            if (d.type === 'PLAYER_EVENT' && d.data && typeof d.data.player_status === 'string') {
                seenPlayerEvent = true;
                playerReady = true;
                streamPlaying = d.data.player_status !== 'paused';
                try { syncPauseIcon(); } catch (err) {}
            }
            if ((d.type === 'PLAYER_TITLE' || d.type === 'TV_INFO') && shieldOn) {
                playerReady = true;
                shieldOn = false;
                shieldTold = false;
                shieldSync();
            } else if (d.type === 'PLAYER_TITLE' || d.type === 'TV_INFO') {
                playerReady = true;
            }
        };
        window.addEventListener('message', vsDisarm);
        shield.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (shieldTold) return;
            shieldTold = true;
            shieldTxt.textContent = '🛡 blocked — use "Pass clicks" to pause';
            setTimeout(shieldSync, 2600);
        });
        shield.addEventListener('mousedown', (e) => { e.preventDefault(); });
        shieldBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            shieldOn = !shieldOn;
            shieldTold = false;
            shieldSync();
            if (shieldOn) {
                try { frame.focus(); } catch (err) {}
            }
        });

        stage.appendChild(shield);
        stage.appendChild(shieldBar);
    }

    stage.appendChild(loading);
    stage.appendChild(frame);
    stage.appendChild(hint);
    stage.appendChild(wm);
    box.appendChild(bar);
    box.appendChild(stage);
    overlay.appendChild(box);
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const statusEl = loading.querySelector('.gv-status');
    let closed = false, frameLoaded = false;

    function setStatus(msg) {
        if (statusEl) statusEl.textContent = msg;
    }

    function showFrame(url, idx) {
        if (closed) return;
        frameLoaded = false;
        playerReady = false;
        streamPlaying = true;
        seenPlayerEvent = false;
        if (isMediaUrl(url)) {
            let acc = '';
            try {
                const cv = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
                if (/^#[0-9a-fA-F]{6}$/.test(cv)) acc = cv;
            } catch (e) {}
            frame.src = mediaFrameUrl(url, (opts && opts.title) || 'Media', acc);
        } else {
            frame.src = url;
        }
        frame.style.display = 'block';
        loading.style.display = 'none';
        mirrorSel.value = String(idx);
        // Return keyboard focus to the game so WASD/arrows work immediately.
        setTimeout(() => {
            try { frame.focus(); frame.contentWindow?.focus(); } catch (e) {}
        }, 100);
        // Framing blocks are not reliably detectable cross-origin;
        // surface the fallback hint in case the frame stays blank.
        setTimeout(() => {
            if (!closed) hint.style.display = 'flex';
        }, 6000);
    }

    async function load() {
        // Media files: skip the CORS probe (mp4s fail CORS fetch but play fine
        // in a frame) and load straight into the player.
        const first = mirrors[0];
        if (isMediaUrl(first) && mirrors.length === 1) {
            showFrame(first, 0);
            return;
        }
        // WATCH passes skipProbe: openWatch already ranked hosts with an
        // asset-decode probe the network's hijack can't fake, and a re-probe
        // here (plain fetch, fooled by hijack 200s) could demote the good pick.
        if (opts.skipProbe) {
            showFrame(first, 0);
            return;
        }
        setStatus(`Probing ${mirrors.length} mirror(s)…`);
        const found = await probeFirstReachable(mirrors, {
            onProbe: (i, total, u) => setStatus(`Trying ${labelFor(u) || hostOf(u)} (${i + 1}/${total})…`),
            imageUrl,
            timeoutMs: opts.probeTimeoutMs || 10000
        });
        if (closed) return;
        if (found) {
            showFrame(found.url, found.index);
        } else {
            setStatus('All mirrors failed. Use Pop-out or Open directly.');
            hint.style.display = 'flex';
        }
    }

    mirrorSel.addEventListener('change', () => {
        const i = parseInt(mirrorSel.value, 10) || 0;
        frame.style.display = 'none';
        loading.style.display = 'flex';
        hint.style.display = 'none';
        setStatus(`Loading ${labelFor(mirrors[i]) || hostOf(mirrors[i])}…`);
        showFrame(mirrors[i], i);
    });

    refreshBtn.addEventListener('click', () => {
        if (closed) return;
        const i = parseInt(mirrorSel.value, 10) || 0;
        frame.style.display = 'none';
        loading.style.display = 'flex';
        hint.style.display = 'none';
        setStatus(`Reloading ${labelFor(mirrors[i]) || hostOf(mirrors[i])}…`);
        showFrame(mirrors[i], i);
    });

    fsBtn.addEventListener('click', () => {
        try {
            if (!document.fullscreenElement) box.requestFullscreen();
            else document.exitFullscreen();
        } catch (e) {}
    });

    // Keep the pause icon truthful for same-origin clips: re-sync after
    // every navigation and mirror every native play/pause flip.
    frame.addEventListener('load', () => {
        frameLoaded = true;
        if (closed) return;
        if (pauseMode === 'youtube') { ytPlaying = true; syncPauseIcon(); return; }
        if (pauseMode !== 'media') return;
        try {
            const v = frame.contentDocument?.getElementById('v');
            if (v && !v.dataset.qpause) {
                v.dataset.qpause = '1';
                v.addEventListener('play', syncPauseIcon);
                v.addEventListener('pause', syncPauseIcon);
            }
        } catch (e) {}
        setTimeout(syncPauseIcon, 500);
    });

    function doPopOut() {
        const url = mirrors[parseInt(mirrorSel.value, 10) || 0];
        api.close();
        if (onPopOut) onPopOut(url);
        else window.open(url, '_blank', 'noopener');
    }
    if (onPopOut) popBtn.addEventListener('click', doPopOut);
    hintPop.addEventListener('click', doPopOut);

    openBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = mirrors[parseInt(mirrorSel.value, 10) || 0];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    function onKey(e) {
        if (e.key === 'Escape') api.close();
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) api.close();
    });

    const api = {
        close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('message', vsDisarm);
            try {
                if (document.fullscreenElement) document.exitFullscreen();
            } catch (e) {}
            try { frame.src = 'about:blank'; } catch (e) {}
            overlay.remove();
            style.remove();
            if (activeViewer === api) activeViewer = null;
        }
    };
    closeBtn.addEventListener('click', () => api.close());

    activeViewer = api;
    load();
    return api;
}

export default { openGameViewer, closeGameViewer };