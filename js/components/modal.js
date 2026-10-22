/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * Modular high-end modal component manager
 */

export class ModalManager {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.overlay);

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // ESC Key to close
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.close();
            }
        });
    }

    /**
     * Set modal content and open it
     * @param {string} html - HTML structure of modal
     * @param {Object} eventHandlers - Map of selector to action functions
     */
    open(html, eventHandlers = {}) {
        this.overlay.innerHTML = `
            <div class="modal-content glass-panel p-6 relative">
                <button class="modal-close-btn absolute top-4 right-4 text-gray-400 hover:text-white transition" aria-label="Close modal">
                    <i class="fas fa-times text-xl"></i>
                </button>
                ${html}
            </div>
        `;

        this.overlay.classList.add('active');
        this.overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Wire close button
        const closeBtn = this.overlay.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Wire custom event handlers
        Object.entries(eventHandlers).forEach(([selector, handler]) => {
            const el = this.overlay.querySelector(selector);
            if (el) {
                // If it is a form
                if (selector.endsWith('form') || selector.includes('-form')) {
                    el.addEventListener('submit', (e) => {
                        e.preventDefault();
                        handler(e, el);
                    });
                } else {
                    el.addEventListener('click', (e) => handler(e, el));
                }
            }
        });

        // Focus first input or button for accessibility
        const focusable = this.overlay.querySelector('input, select, textarea, button:not(.modal-close-btn)');
        if (focusable) {
            setTimeout(() => focusable.focus(), 100);
        }
    }

    close() {
        this.overlay.classList.remove('active');
        this.overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        setTimeout(() => {
            this.overlay.innerHTML = '';
        }, 300);
    }

    /**
     * Show Mirror selection modal interface
     */
    showMirrorSelector(mirrors, onSelect) {
        const mirrorCardsHtml = mirrors.map(m => `
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

        const html = `
            <div class="text-center mb-6">
                <h2 class="text-2xl font-bold font-logo text-white tracking-wider flex items-center justify-center gap-3">
                    <i class="fas fa-shield-alt text-accent"></i> SELECT SECURE MIRROR
                </h2>
                <p class="text-gray-400 text-sm mt-2">Choose a primary content distribution mirror to launch your application sandboxed environment.</p>
            </div>
            <div class="mirror-selector-grid mt-4 max-h-[60vh] overflow-y-auto pr-1">
                ${mirrorCardsHtml}
            </div>
        `;

        this.open(html);

        // Bind clicks. window.open MUST stay synchronous in the gesture,
        // so launch first, show loading on the button, close modal after.
        const cards = this.overlay.querySelectorAll('.mirror-card');
        const fireSelect = (mirrorId, btn) => {
            const selectedMirror = mirrors.find(m => m.id === mirrorId);
            if (!selectedMirror) return;
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LAUNCHING…';
            }
            try { onSelect(selectedMirror); }
            finally { setTimeout(() => this.close(), 250); }
        };
        cards.forEach(card => {
            const btn = card.querySelector('.launch-mirror-btn');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                fireSelect(btn.getAttribute('data-id'), btn);
            });

            // Make whole card clickable
            card.addEventListener('click', () => {
                fireSelect(card.getAttribute('data-id'), card.querySelector('.launch-mirror-btn'));
            });
        });
    }

    /**
     * Show confirmation modal dialog
     */
    showConfirm(title, message, onConfirm) {
        const html = `
            <div class="text-center p-4">
                <div class="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                    <i class="fas fa-exclamation-triangle text-2xl animate-pulse"></i>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <p class="text-gray-400 text-sm mb-6">${message}</p>
                <div class="flex items-center justify-center gap-4">
                    <button class="btn-outline px-6 py-2 cancel-btn">CANCEL</button>
                    <button class="btn-premium px-6 py-2 bg-red-600 hover:bg-red-500 text-white confirm-btn" style="background: #ef4444; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4)">
                        CONFIRM ACTION
                    </button>
                </div>
            </div>
        `;

        this.open(html, {
            '.cancel-btn': () => this.close(),
            '.confirm-btn': () => {
                onConfirm();
                this.close();
            }
        });
    }

    /**
     * Show Game Form modal for Importing / Editing Games
     */
    showGameForm(game = null, onSubmit) {
        const isEdit = !!game;
        const artworkPresets = [
            'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600',
            'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=600',
            'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600',
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=600',
            'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600',
            'https://images.unsplash.com/photo-1553481187-be93c21490a9?q=80&w=600'
        ];

        const html = `
            <div class="mb-4">
                <h3 class="text-xl font-bold text-white font-logo tracking-wider flex items-center gap-2">
                    <i class="fas ${isEdit ? 'fa-edit' : 'fa-plus-circle'} text-accent"></i>
                    ${isEdit ? 'EDIT GAME SPECIFICATION' : 'IMPORT NEW GAME LAYER'}
                </h3>
                <p class="text-xs text-gray-400 mt-1">Configure your cloud integration layer to render a beautiful launch card.</p>
            </div>
            <form id="game-import-form" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Game Title</label>
                        <input type="text" id="g-name" class="form-input" required value="${isEdit ? game.name : ''}" placeholder="e.g. Cyber Runner 2077">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Launch URL</label>
                        <input type="url" id="g-url" class="form-input" required value="${isEdit ? game.url : ''}" placeholder="https://your-site.example/play">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Category Tag</label>
                        <select id="g-category" class="form-select">
                            <option value="RPG" ${isEdit && game.category === 'RPG' ? 'selected' : ''}>RPG</option>
                            <option value="Arcade" ${isEdit && game.category === 'Arcade' ? 'selected' : ''}>Arcade / Retro</option>
                            <option value="Puzzle" ${isEdit && game.category === 'Puzzle' ? 'selected' : ''}>Puzzle</option>
                            <option value="Action" ${isEdit && game.category === 'Action' ? 'selected' : ''}>Action</option>
                            <option value="Sandbox" ${isEdit && game.category === 'Sandbox' ? 'selected' : ''}>Sandbox</option>
                            <option value="Strategy" ${isEdit && game.category === 'Strategy' ? 'selected' : ''}>Strategy</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Accent Layer Glow</label>
                        <input type="color" id="g-accent" class="form-input h-11 p-1 cursor-pointer bg-transparent" value="${isEdit ? game.accentColor : '#39ff14'}">
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Artwork / Graphic Layer URL</label>
                    <input type="text" id="g-image" class="form-input mb-2" value="${isEdit ? game.image : ''}" placeholder="https://images.unsplash.com/...">
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Upload Artwork Image</label>
                    <input type="file" id="g-image-file" accept="image/*" class="form-input text-xs mb-2" aria-label="Upload game artwork">
                    <div id="g-image-preview" class="mb-2 ${isEdit && game.image ? '' : 'hidden'}">
                        <div class="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Current artwork preview:</div>
                        <div class="w-32 h-20 rounded border border-white/10 bg-cover bg-center" style="background-image: url('${isEdit ? game.image : ''}')"></div>
                    </div>
                    <div class="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Or choose from visual presets:</div>
                    <div class="flex gap-2 overflow-x-auto pb-1 preset-scroll">
                        ${artworkPresets.map(url => `
                            <button type="button" class="preset-art-btn flex-shrink-0 w-20 h-12 rounded border border-gray-800 overflow-hidden relative transition hover:border-accent" data-url="${url}">
                                <div class="w-full h-full bg-cover bg-center" style="background-image: url('${url}')"></div>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Brief Description</label>
                    <textarea id="g-desc" class="form-textarea h-20" placeholder="Summarize the core experience and control layouts...">${isEdit ? game.description : ''}</textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Preferred Launch Mode (global setting governs)</label>
                        <select id="g-launch" class="form-select">
                            <option value="about-blank" ${isEdit && game.launchMode === 'about-blank' ? 'selected' : ''}>about:blank — separate sandboxed tab (recommended)</option>
                            <option value="new-tab" ${isEdit && game.launchMode === 'new-tab' ? 'selected' : ''}>New Tab — separate direct tab</option>
                            <option value="same-tab" ${isEdit && game.launchMode === 'same-tab' ? 'selected' : ''}>Legacy same-frame (auto-mapped to separate tab)</option>
                        </select>
                        <p class="text-[10px] text-gray-500 mt-1">Settings → Launch Behavior governs all launches. Games always open in a separate tab/window.</p>
                    </div>
                    <div class="flex items-end justify-end">
                        <button type="button" class="btn-outline px-4 py-2 text-xs mr-2 cancel-btn">CANCEL</button>
                        <button type="submit" class="btn-premium px-5 py-2 text-xs">
                            <i class="fas fa-save"></i> ${isEdit ? 'SAVE SPEC' : 'ADD INTERFACE'}
                        </button>
                    </div>
                </div>
            </form>
        `;

        this.open(html, {
            '.cancel-btn': () => this.close(),
            '#game-import-form': (e, form) => {
                const data = {
                    name: form.querySelector('#g-name').value,
                    url: form.querySelector('#g-url').value,
                    category: form.querySelector('#g-category').value,
                    accentColor: form.querySelector('#g-accent').value,
                    image: form.querySelector('#g-image').value || artworkPresets[4],
                    description: form.querySelector('#g-desc').value,
                    launchMode: form.querySelector('#g-launch').value,
                };
                if (isEdit) {
                    data.id = game.id;
                }
                onSubmit(data);
                this.close();
            }
        });

        // Setup preset artwork clicks
        const presetBtns = this.overlay.querySelectorAll('.preset-art-btn');
        const imgInput = this.overlay.querySelector('#g-image');
        const fileInput = this.overlay.querySelector('#g-image-file');
        const previewBox = this.overlay.querySelector('#g-image-preview');
        const updatePreview = (url) => {
            if (!previewBox || !url) return;
            previewBox.classList.remove('hidden');
            const inner = previewBox.querySelector('div:last-child');
            if (inner) inner.style.backgroundImage = `url('${url}')`;
        };
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.getAttribute('data-url');
                imgInput.value = url;
                updatePreview(url);
                
                // Highlight active preset
                presetBtns.forEach(b => b.classList.remove('border-accent'));
                btn.classList.add('border-accent');
            });
        });
        if (imgInput) {
            imgInput.addEventListener('input', (e) => updatePreview(e.target.value));
        }
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                const f = fileInput.files && fileInput.files[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) {
                    // Keep localStorage safe: warn but still allow via downscale? For now warn.
                    alert('Image is larger than 2MB and may exceed localStorage quota. Consider using a URL instead.');
                }
                const reader = new FileReader();
                reader.onload = () => {
                    imgInput.value = reader.result;
                    updatePreview(reader.result);
                };
                reader.readAsDataURL(f);
            });
        }
    }
}

export const modals = new ModalManager();
export default modals;
