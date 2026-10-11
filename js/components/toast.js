/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * High-end neon toast notification system
 */

export class ToastManager {
    constructor() {
        this.container = document.querySelector('.toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a beautiful glassmorphic toast notification
     * @param {string} message - Notification text
     * @param {'success' | 'info' | 'warning' | 'error'} type - Style type
     * @param {number} duration - Time to live in ms
     */
    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'info-circle';
        let color = 'var(--accent)';
        if (type === 'success') {
            icon = 'check-circle';
            color = '#39ff14';
        } else if (type === 'warning') {
            icon = 'exclamation-triangle';
            color = '#ffb300';
        } else if (type === 'error') {
            icon = 'exclamation-circle';
            color = '#ff3b30';
        }

        toast.style.borderLeftColor = color;
        toast.innerHTML = `
            <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.1rem; text-shadow: 0 0 10px ${color}55;"></i>
            <div style="flex-grow: 1; font-weight: 500;">${message}</div>
            <div class="toast-battery-container" style="position:absolute;bottom:0;left:0;right:0;height:6px;background:rgba(255,255,255,0.1);border-top:1px solid rgba(255,255,255,0.2);">
                <div class="toast-progress-bar" style="height:100%;background:${color};width:100%;box-shadow: 0 0 8px ${color};transition: width 0.1s linear;"></div>
            </div>
            <button class="toast-close" style="background: transparent; border: none; color: rgba(255,255,255,0.4); cursor: pointer; transition: color 0.2s;">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.container.appendChild(toast);

        const progressBar = toast.querySelector('.toast-progress-bar');
        let startTime = Date.now();
        let elapsedAtPause = 0;
        let isPaused = false;

        const updateProgress = () => {
            if (!isPaused) {
                const now = Date.now();
                const totalElapsed = elapsedAtPause + (now - startTime);
                const remaining = duration - totalElapsed;
                const percentage = Math.max(0, (remaining / duration) * 100);
                if (progressBar) progressBar.style.width = `${percentage}%`;
                if (remaining <= 0) {
                    this.remove(toast);
                    return;
                }
            } else {
                // Slow drain while paused (1/5th speed)
                const slowDrainRate = 0.2;
                const now = Date.now();
                // We simulate a slow clock by adjusting the startTime
                startTime += (16.67 * (1 - slowDrainRate)); // approx 60fps
            }
            if (toast.parentNode) requestAnimationFrame(updateProgress);
        };

        requestAnimationFrame(updateProgress);

        toast.addEventListener('mouseenter', () => {
            isPaused = true;
            elapsedAtPause += Date.now() - startTime;
        });

        toast.addEventListener('mouseleave', () => {
            isPaused = false;
            startTime = Date.now();
        });

        // Click close
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        // Play feedback sound if enabled
        this._playFeedbackSound(type);
    }

    remove(toast) {
        if (toast.classList.contains('removing')) return;
        toast.classList.add('removing');
        // Add sliding animation to the right
        toast.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';

        toast.addEventListener('animationend', () => {
            toast.remove();
        });
        // Fallback for style-based transitions
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }

    _playFeedbackSound(type) {
        // Safe play Web Audio API sound (if settings allow)
        try {
            const audioFeedback = localStorage.getItem('hub_audio_feedback') !== 'false';
            if (!audioFeedback) return;

            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;

            if (type === 'success') {
                // Happy high double beep
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.08, now + 0.08); // E5
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === 'error') {
                // Lower descending warning buzz
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.linearRampToValueAtTime(120, now + 0.2);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.22);
            } else {
                // Subtle standard UI blip
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now); // A4
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
            }
        } catch (e) {
            // Audio context not initialized or blocked
        }
    }
}
export const toast = new ToastManager();
export default toast;
