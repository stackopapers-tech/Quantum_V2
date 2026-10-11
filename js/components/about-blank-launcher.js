/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * AboutBlankLauncher - Open a target website via an about:blank browsing context.
 *
 * Priority order:
 *   1. window.open('about:blank', '_blank') then write a sandboxed
 *      fullscreen iframe pointing at the target URL
 *   2. User-triggered <a target="_blank" rel="noopener noreferrer"> fallback
 *   3. Modal with "Open" button + "Copy URL" button (never silent)
 *
 * Iframe-only: every game renders inside an <iframe>. Note that some
 * external sites send X-Frame-Options or CSP frame-ancestors that
 * prevent framing — JavaScript cannot bypass these headers, so the
 * iframe shell includes an "Open directly" fallback link.
 *
 * Security: Does NOT bypass popup blockers, same-origin policy,
 * X-Frame-Options, CSP, or any browser restriction. Opens sites
 * normally in new tabs/windows, routed through about:blank first.
 */

// ============================================================
// Utilities
// ============================================================

const ESCAPE_MAP = {
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    '\'': '&apos;',
};

export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}

export function generateId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** True when the URL points at a direct media file (mp4/webm/...). */
export function isMediaUrl(url) {
    return /\.(mp4|webm|ogv?|mov|m4v|mkv|m4a|mp3|wav|aac)(\?|#|$)/i.test(String(url || ''));
}

/**
 * Route a media file through the local media-player page so the popup shows
 * an instant loading screen, play button, buffering state and error/retry UI
 * instead of a bare black frame. The player page is same-origin with the
 * shell, so the shell's volume slider reaches the <video> directly.
 */
export function mediaFrameUrl(url, label, accent) {
    const bust = 'c=1';
    try {
        const base = new URL('.', location.href).href;
        let u = 'media-player.html?' + bust +
            '&u=' + encodeURIComponent(url) +
            '&t=' + encodeURIComponent(label || 'Media');
        if (accent) u += '&a=' + encodeURIComponent(accent);
        return new URL(u, base).href;
    } catch (e) {
        return url;
    }
}

export function isValidHttpUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

export function normalizeHttpUrl(url) {
    let u = String(url || '').trim();
    if (!u) return '';
    // Only prepend https if it doesn't look like it already has a protocol
    if (!/^([a-zA-Z][a-zA-Z0-9+.-]*:)/.test(u)) {
        u = 'https://' + u;
    }
    return isValidHttpUrl(u) ? u : '';
}

// Clipboard copy with secure + non-secure fallback
export function copyToClipboard(text, button) {
    const doCopy = async () => {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (_) { /* fall through */ }
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (_) {
            return false;
        }
    };

    doCopy().then(ok => {
        if (!button) return;
        const original = button.textContent;
        button.textContent = ok ? 'Copied!' : 'Failed';
        setTimeout(() => { button.textContent = original; }, 1500);
    });
}

// ============================================================
// Modal (separated from launcher logic)
// ============================================================

export class FallbackModal {
    /**
     * @param {Object} opts
     * @param {string} opts.targetUrl
     * @param {string} opts.label
     * @param {Function} [opts.onDismiss]
     */
    constructor(opts) {
        this.targetUrl = opts.targetUrl;
        this.label = opts.label;
        this.onDismiss = opts.onDismiss || (() => {});
        this.modal = null;
        this.prevFocus = null;
        this.titleId = generateId('fallback-title');
    }

    open() {
        this.prevFocus = document.activeElement;

        const modal = document.createElement('div');
        this.modal = modal;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', this.titleId);
        modal.setAttribute('aria-hidden', 'false');
        modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:1rem;font-family:system-ui,sans-serif;';

        const card = document.createElement('div');
        card.style.cssText = 'background:#1a1a2e;border:1px solid #333;border-radius:12px;padding:24px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5);';

        const iconWrap = document.createElement('div');
        // Warning icon follows the hub accent (never hardcoded orange).
        let warn = '#39ff14';
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) warn = v;
        } catch (e) {}
        iconWrap.style.cssText = `width:48px;height:48px;background:${warn}20;border:1px solid ${warn}40;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;`;
        iconWrap.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${warn}" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

        const title = document.createElement('h3');
        title.id = this.titleId;
        title.style.cssText = 'color:#fff;margin:0 0 8px;font-size:18px;';
        title.textContent = 'Popup Blocked';

        const msg = document.createElement('p');
        msg.style.cssText = 'color:#888;margin:0 0 20px;font-size:14px;line-height:1.5;';
        const safeLabel = escapeHtml(this.label);
        msg.innerHTML = `Your browser blocked the automatic new tab for <strong>${safeLabel}</strong>. Allow popups for this site, then retry — or open manually:`;

        const openBtn = document.createElement('a');
        openBtn.href = this.targetUrl;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener noreferrer';
        openBtn.style.cssText = `display:inline-flex;align-items:center;justify-content:center;gap:8px;background:${warn};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;`;
        openBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open ' + safeLabel;

        const copyRow = document.createElement('div');
        copyRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:center;';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.readOnly = true;
        urlInput.value = this.targetUrl;
        urlInput.style.cssText = 'flex:1;padding:10px 12px;background:#0f0f1a;border:1px solid #333;border-radius:6px;color:#fff;font-family:monospace;font-size:12px;';
        urlInput.addEventListener('click', () => urlInput.select());

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.style.cssText = 'padding:10px 16px;background:#333;border:1px solid #444;border-radius:6px;color:#fff;font-size:12px;cursor:pointer;';
        copyBtn.addEventListener('click', () => copyToClipboard(this.targetUrl, copyBtn));

        copyRow.appendChild(urlInput);
        copyRow.appendChild(copyBtn);

        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = 'margin-top:16px;padding:8px 16px;background:transparent;border:1px solid #333;border-radius:6px;color:#888;font-size:12px;cursor:pointer;';
        dismissBtn.addEventListener('click', () => this.close());

        card.appendChild(iconWrap);
        card.appendChild(title);
        card.appendChild(msg);
        card.appendChild(openBtn);
        card.appendChild(copyRow);
        card.appendChild(dismissBtn);
        modal.appendChild(card);
        document.body.appendChild(modal);

        this.trapFocus(modal);
        setTimeout(() => openBtn.focus(), 10);
    }

    trapFocus(modal) {
        const focusable = modal.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        this._keydownHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                return;
            }
            if (e.key !== 'Tab') return;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        modal.addEventListener('keydown', this._keydownHandler);
    }

    close() {
        if (!this.modal) return;
        if (this._keydownHandler) {
            this.modal.removeEventListener('keydown', this._keydownHandler);
        }
        this.modal.setAttribute('aria-hidden', 'true');
        this.modal.remove();
        this.modal = null;
        if (this.prevFocus && typeof this.prevFocus.focus === 'function') {
            this.prevFocus.focus();
        }
        this.onDismiss();
    }
}

// ============================================================
// AboutBlankLauncher (core logic)
// ============================================================

export class AboutBlankLauncher {
    /**
     * @param {Object} options
     * @param {string} [options.targetUrl=''] - Target URL (http/https only)
     * @param {string} [options.label='Website'] - Human-readable label
     * @param {Function} [options.onSuccess] - Called when window opens successfully
     * @param {Function} [options.onError] - Called when all approaches fail
     * @param {Function} [options.onFallback] - Called when fallback approach used
     */
    constructor(options = {}) {
        this.targetUrl = options.targetUrl || '';
        this.label = options.label || 'Website';
        this.onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : () => {};
        this.onError = typeof options.onError === 'function' ? options.onError : () => {};
        this.onFallback = typeof options.onFallback === 'function' ? options.onFallback : () => {};
    }

    /** Set a new target URL and label. */
    setTarget(url, label) {
        this.targetUrl = normalizeHttpUrl(url);
        this.label = label || this.label;
    }

    /**
     * Launch the target. Must be called from a user gesture (click handler).
     * @returns {boolean} true if primary approach succeeded, false if fallback used
     */
    launch() {
        if (!this.targetUrl) {
            this.onError(new Error('Invalid URL: must be http:// or https://'));
            return false;
        }

        // Approach 1: window.open('about:blank') -> navigate
        const win = this.openAboutBlank();
        if (win) {
            // Write the shell IMMEDIATELY — no blank window while the browser
            // transitions (background tabs throttle timers, which used to leave
            // the popup empty for a long time). If the document isn't ready
            // yet, retry shortly after.
            const writeNow = () => {
                try {
                    const success = this.navigateBlankWindow(win, this.targetUrl);
                    if (success) {
                        this.onSuccess(this.label);
                        return true;
                    }
                } catch (e) {
                    console.error('Navigation failed:', e);
                }
                return false;
            };
            if (!writeNow()) {
                setTimeout(() => {
                    if (win.closed) return;
                    if (!writeNow()) this.tryAnchorClick();
                }, 250);
            }
            return true;
        }

        // Approach 2: Anchor click fallback (different code path)
        if (this.tryAnchorClick()) {
            this.onFallback(this.label, 'anchor-click');
            return true;
        }

        // Approach 3: Modal fallback (never silent)
        this.showFallbackModal();
        this.onError(new Error('Launch blocked by popup blocker'));
        return false;
    }

    /**
     * Open about:blank synchronously inside the current user gesture.
     * No feature string (3rd arg), no async delay.
     */
    openAboutBlank() {
        try {
            // Open about:blank first to establish the window context
            return window.open('about:blank', '_blank');
        } catch (e) {
            return null;
        }
    }

    /**
     * Navigate the about:blank window to the target URL.
     * Iframe-only: the game always renders inside a sandboxed iframe
     * (direct src keeps relative asset paths working). Includes an
     * "Open directly" fallback for sites that refuse framing via
     * X-Frame-Options / CSP frame-ancestors (cannot be bypassed).
     */
    navigateBlankWindow(win, url) {
        if (!win) return false;

        try {
            const safeUrl = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            const safeLabel = String(this.label).replace(/</g, '&lt;');
            // Separate document: inherit the hub's active scheme accent.
            let acc = '#39ff14';
            try {
                const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) acc = v;
            } catch (e) {}
            // Media files get the local player page (loading screen + controls);
            // everything else loads directly inside the frame.
            let frameSrc = safeUrl;
            if (isMediaUrl(url)) {
                const p = mediaFrameUrl(url, this.label, acc);
                frameSrc = String(p).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            }
            win.document.open();
            win.document.write(`<!DOCTYPE html>
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
</body></html>`);
            win.document.close();

            // Modern security: Remove the link to the original window
            // Note: some browsers throw errors if the target is cross-origin
            if (win.opener !== null) {
                win.opener = null;
            }
        } catch (e) {
            // Last resort: direct navigation (no iframe) if the shell write fails.
            try {
                win.location.href = url;
                return true;
            } catch (e2) {
                return false;
            }
        }
        return true;
    }

    /**
     * Fallback: create and click a hidden anchor.
     * Uses rel="noopener noreferrer" for safety.
     * Note: This returns true if the click was dispatched; actual
     * popup opening cannot be reliably detected due to browser
     * privacy restrictions on window.open return value.
     */
    tryAnchorClick() {
        try {
            const a = document.createElement('a');
            a.href = this.targetUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Last resort: accessible modal with Open button + Copy button.
     */
    showFallbackModal() {
        const modal = new FallbackModal({
            targetUrl: this.targetUrl,
            label: this.label,
            onDismiss: () => {}
        });
        modal.open();

        // Add a close button to the fallback modal
        const card = modal.modal.querySelector('div:nth-child(2)'); // The card container
        if (card) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;background:transparent;border:none;color:#888;cursor:pointer;font-size:16px;transition:color 0.2s;';
            closeBtn.addEventListener('mouseover', () => closeBtn.style.color = '#fff');
            closeBtn.addEventListener('mouseout', () => closeBtn.style.color = '#888');
            closeBtn.addEventListener('click', () => modal.close());
            card.style.position = 'relative';
            card.appendChild(closeBtn);
        }
    }
}

/**
 * Convenience function for one-off launches.
 * @param {string} url
 * @param {string} [label]
 * @param {Object} [callbacks] - { onSuccess, onError, onFallback }
 * @returns {boolean}
 */
export function launchViaAboutBlank(url, label, callbacks = {}) {
    const launcher = new AboutBlankLauncher({
        targetUrl: url,
        label: label,
        onSuccess: callbacks.onSuccess,
        onError: callbacks.onError,
        onFallback: callbacks.onFallback
    });
    return launcher.launch();
}

// Global for plain script usage (non-module)
if (typeof window !== 'undefined') {
    window.AboutBlankLauncher = AboutBlankLauncher;
    window.launchViaAboutBlank = launchViaAboutBlank;
    window.FallbackModal = FallbackModal;
    window.escapeHtml = escapeHtml;
    window.normalizeHttpUrl = normalizeHttpUrl;
    window.isValidHttpUrl = isValidHttpUrl;
    window.copyToClipboard = copyToClipboard;
    window.generateId = generateId;
}

// CommonJS export (for Node/legacy bundlers)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AboutBlankLauncher,
        launchViaAboutBlank,
        FallbackModal,
        escapeHtml,
        normalizeHttpUrl,
        isValidHttpUrl,
        copyToClipboard,
        generateId
    };
}