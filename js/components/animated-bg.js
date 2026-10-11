// (c) Quantum Hub — proprietary hub build. All rights reserved.
/**
 * Quantum Hub — animated backgrounds (Bubbles / Snow / Particles).
 *
 * Three zero-dependency canvas effects painted on ONE fixed layer pinned
 * behind the entire UI (z-index:-1, pointer-events:none, aria-hidden), so
 * themes, wallpapers and every control stay fully interactive on top. The
 * effects tint themselves to the live --accent color, use frame-delta timing
 * so motion stays smooth on any refresh rate, scale with devicePixelRatio,
 * and honor the global animations setting ('reduced' = fewer/slower,
 * 'none' = the layer is removed entirely). Teardown is exact: switching
 * effects or turning the setting off removes the canvas and its listeners.
 */

const EFFECTS = ['bubbles', 'snow', 'particles'];
const DEFAULT_ACCENT = [57, 255, 20];
let state = null;

/** Apply (or tear down) the animated background for the current settings. */
export function applyAnimatedBg(app) {
    const settings = (app && app.settings) || {};
    const effect = EFFECTS.indexOf(settings.animatedBg) !== -1 ? settings.animatedBg : '';
    const anim = settings.animations || 'full';
    const perf = typeof window !== 'undefined' && !!window.__perfMode;
    if (!effect || anim === 'none' || perf) { destroyAnimatedBg(); return; }
    if (state && state.effect === effect && state.anim === anim) return; // already running
    destroyAnimatedBg();
    start(effect, anim);
}

/** Remove the layer and every listener/rAF it owns. */
export function destroyAnimatedBg() {
    if (!state) return;
    state.alive = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.onResize) window.removeEventListener('resize', state.onResize);
    if (state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
    state = null;
}

function start(effect, anim) {
    const canvas = document.createElement('canvas');
    canvas.id = 'q-animated-bg';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const slow = anim === 'reduced';       // 'reduced' → fewer items, gentler speed
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, tick = 0;
    let accent = getAccent();
    let accentRgb = hexToRgb(accent);
    let items = [];

    const alive = true;
    state = { effect, anim, canvas, raf: 0, alive: true, onResize: null };

    function getAccent() {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            return v || '#39ff14';
        } catch (e) { return '#39ff14'; }
    }

    // ---- density: the layer fills the viewport without ever dominating it.
    const targetCount = () => {
        const px = Math.max(1, w * h);
        const per = effect === 'particles' ? 24000 : effect === 'bubbles' ? 21000 : 15000;
        const n = Math.round(px / per);
        const cap = Math.max(16, Math.round((effect === 'particles' ? 95 : 80) * (slow ? 0.55 : 1)));
        return Math.max(16, Math.min(cap, n));
    };

    // ---- per-effect item factories -------------------------------------
    const factories = {
        bubbles: {
            mk: (anywhere) => ({
                x: Math.random() * w,
                y: anywhere ? Math.random() * h : h + 30 + Math.random() * 60,
                r: 3 + Math.random() * 24,
                vy: 0.25 + Math.random() * 0.85,
                phase: Math.random() * Math.PI * 2,
                wob: 0.5 + Math.random() * 1.3,
                a: 0.10 + Math.random() * 0.22,
            }),
            update: (it, dt, sp) => {
                it.y -= it.vy * sp * dt;
                it.phase += 0.016 * it.wob * dt;
                it.x += Math.sin(it.phase) * 0.45 * dt;
                if (it.y + it.r < -8) Object.assign(it, factories.bubbles.mk(false));
            },
            draw: (it) => {
                ctx.globalAlpha = it.a;
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = Math.min(1, it.a * 2.4);
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1;
                ctx.stroke();
                // soap-film highlight
                ctx.globalAlpha = Math.min(0.5, it.a * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r * 0.72, Math.PI * 1.1, Math.PI * 1.6);
                ctx.stroke();
                ctx.globalAlpha = 1;
            },
        },
        snow: {
            mk: (anywhere) => {
                const big = Math.random() < 0.16;
                return {
                    x: Math.random() * w,
                    y: anywhere ? Math.random() * h : -10 - Math.random() * 40,
                    r: big ? 3.5 + Math.random() * 3.5 : 0.8 + Math.random() * 2.2,
                    vy: big ? 0.35 + Math.random() * 0.6 : 0.55 + Math.random() * 1.5,
                    sway: 0.25 + Math.random() * 0.9,
                    phase: Math.random() * Math.PI * 2,
                    a: big ? 0.10 + Math.random() * 0.12 : 0.35 + Math.random() * 0.55,
                };
            },
            update: (it, dt, sp) => {
                it.y += it.vy * sp * dt;
                it.phase += 0.02 * dt;
                it.x += Math.cos(it.phase) * it.sway * dt;
                if (it.x < -12) it.x = w + 12;
                if (it.x > w + 12) it.x = -12;
                if (it.y - it.r > h + 8) Object.assign(it, factories.snow.mk(false));
            },
            draw: (it) => {
                ctx.globalAlpha = it.a;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            },
        },
        particles: {
            mk: () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                r: 1 + Math.random() * 1.5,
                star: Math.random() < 0.12,
            }),
            update: (it, dt, sp) => {
                it.x += it.vx * sp * dt;
                it.y += it.vy * sp * dt;
                if (it.x < -6) it.x = w + 6; if (it.x > w + 6) it.x = -6;
                if (it.y < -6) it.y = h + 6; if (it.y > h + 6) it.y = -6;
            },
            draw: null, // constellation draws as a batch (lines first)
        },
    };
    const factory = factories[effect];

    const resize = () => {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const n = targetCount();
        if (items.length > n) items.length = n;
        while (items.length < n) items.push(factory.mk(true));
    };

    const drawConstellation = (dt, sp) => {
        // lines first so the dots sit on top
        const maxD = 132, maxD2 = maxD * maxD;
        ctx.lineWidth = 1;
        for (let i = 0; i < items.length; i++) {
            const a = items[i];
            for (let j = i + 1; j < items.length; j++) {
                const b = items[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > maxD2) continue;
                const al = (1 - Math.sqrt(d2) / maxD) * 0.32;
                ctx.strokeStyle = `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},${al.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
        for (const it of items) {
            ctx.globalAlpha = it.star ? 0.9 : 0.65;
            ctx.fillStyle = it.star ? '#ffffff' : accent;
            ctx.beginPath();
            ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    };

    const step = (ts) => {
        if (!state || !state.alive) return;
        if (window.__perfMode) { destroyAnimatedBg(); return; }
        if (!last) last = ts;
        let dt = (ts - last) / 16.667; // frame-delta → smooth on any refresh rate
        last = ts;
        if (dt > 3) dt = 3;
        tick++;
        if (tick % 90 === 1) { // follow the theme when the accent changes
            accent = getAccent();
            accentRgb = hexToRgb(accent);
        }
        const sp = (slow ? 0.55 : 1) * Math.min(dt, 2);
        ctx.clearRect(0, 0, w, h);
        if (effect === 'particles') {
            for (const it of items) factory.update(it, dt, sp);
            drawConstellation(dt, sp);
        } else {
            for (const it of items) { factory.update(it, dt, sp); factory.draw(it); }
        }
        raf = requestAnimationFrame(step);
        state.raf = raf;
    };

    state.onResize = resize;
    window.addEventListener('resize', state.onResize);
    resize();
    raf = requestAnimationFrame(step);
    state.raf = raf;
}

// '#39ff14' | '#f00' | 'rgb(r,g,b)' → [r, g, b]
function hexToRgb(css) {
    try {
        const s = String(css || '').trim();
        let m = s.match(/^#([0-9a-f]{3})$/i);
        if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
        m = s.match(/^#([0-9a-f]{6})$/i);
        if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
        m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    } catch (e) {}
    return DEFAULT_ACCENT.slice();
}
