// (c) Quantum Hub — proprietary hub build. All rights reserved.
/* Music Deck — the hub's MUSIC panel: Internet Archive live search, curated
   featured tracks (SoundHelix + public-domain classics), music source cards,
   and an in-hub deck player (play/pause/prev/next/seek) wired to the master
   volume. Inspired by SimpMusic (maxrave-dev/SimpMusic). Everything plays
   here inside the hub — no popups, no installs. */

import toast from './toast.js?v=2026.10.21-1';

const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';
const ARCHIVE_META = 'https://archive.org/metadata/';
const DEFAULT_ART = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80';

/* Curated public-domain items — verified to carry MP3 files + thumbnails.
   Clicking one pulls the item's full track list from archive.org metadata and
   queues it, so an album plays straight through the deck. */
const CLASSICS = [
    { id: 'MapleLeafRag', title: 'Maple Leaf Rag', artist: 'Scott Joplin' },
    { id: 'RagtimePianoSCOTTJOPLIN.TheEntertainer1902', title: 'The Entertainer', artist: 'Scott Joplin' },
    { id: 'FredericChopinNocturneOp.9No.1InBFlatMinor', title: 'Nocturne Op. 9, No. 1', artist: 'Frederic Chopin' },
    { id: 'FredericChopinNocturneNo.2InEFlatMajorOp.9No.2FromBlueLagoon', title: 'Nocturne Op. 9, No. 2', artist: 'Frederic Chopin' },
    { id: 'The_Four_Seasons_Vivaldi-10361', title: 'The Four Seasons', artist: 'Antonio Vivaldi' },
    { id: 'TCHAIKOVSKYNutcrackerBalletcomplete', title: 'The Nutcracker (complete)', artist: 'Pyotr Tchaikovsky' },
];

/* Music discovery sources — open in the in-hub viewer like everything else. */
const MUSIC_SOURCES = [
    { name: 'Internet Archive Audio', tag: 'FREE', url: 'https://archive.org/details/audio', desc: 'Millions of free audio items — the live search above queries this.' },
    { name: 'Free Music Archive', tag: 'FREE', url: 'https://freemusicarchive.org', desc: 'Creative-commons music from independent artists.' },
    { name: 'Jamendo Music', tag: 'FREE', url: 'https://www.jamendo.com', desc: 'Free and legal music streaming and downloads.' },
    { name: 'Musopen', tag: 'CLASSICAL', url: 'https://musopen.org', desc: 'Public-domain classical recordings and sheet music.' },
    { name: 'Archive Netlabels', tag: 'FREE', url: 'https://archive.org/details/netlabels', desc: 'Net-label releases, all free to stream and download.' },
];

const fmtTime = (sec) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
};

/* Archive.org `length` comes as seconds ("203.49"), "mm:ss" or "hh:mm:ss". */
const parseLen = (l) => {
    if (l == null || l === '') return 0;
    if (typeof l === 'number') return isFinite(l) ? l : 0;
    const str = String(l);
    if (str.includes(':')) {
        const p = str.split(':').map(Number);
        if (p.some(n => !isFinite(n))) return 0;
        return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    }
    const n = parseFloat(str);
    return isFinite(n) ? n : 0;
};

const archiveFileUrl = (ident, name) =>
    `https://archive.org/download/${ident}/${String(name).split('/').map(encodeURIComponent).join('/')}`;

const archiveThumb = (ident) => `https://archive.org/services/img/${ident}`;

export function initMusicDeck(app, media) {
    const panel = $('#panel-music');
    if (!panel || panel.dataset.q) return;
    panel.dataset.q = '1';

    const audio = $('#music-audio');
    const playBtn = $('#music-play'), playIcon = $('#music-play-icon'), playLabel = $('#music-play-label');
    const prevBtn = $('#music-prev'), nextBtn = $('#music-next');
    const nowTitle = $('#music-now-title'), nowArtist = $('#music-now-artist'), artBox = $('#music-art');
    const bar = $('#music-progress-bar'), fill = $('#music-progress-fill');
    const timeCur = $('#music-time-cur'), timeDur = $('#music-time-dur');
    const input = $('#music-search'), count = $('#music-search-count');
    const hcount = $('#music-results-count');
    const resultsWrap = $('#music-results-wrap'), resultsGrid = $('#music-results');
    const featuredGrid = $('#music-featured'), sourcesGrid = $('#music-sources');
    const ms = $('#q-music-volume'), msl = $('#q-music-volume-val');
    if (!audio || !playBtn || !input) return;

    const state = { queue: [], index: -1, track: null, results: [], loading: false };

    /* ---------- volume: mirrors every other volume bar in the hub ---------- */
    const applyVol = (v) => {
        v = Math.min(1, Math.max(0, Number(v) || 0));
        try { audio.volume = v; } catch (e) {}
        document.querySelectorAll('video, audio').forEach(el => { try { el.volume = v; } catch (e) {} });
        document.querySelectorAll('iframe').forEach(fr => {
            try {
                const d = fr.contentDocument;
                if (d) d.querySelectorAll('video, audio').forEach(el => { try { el.volume = v; } catch (e) {} });
            } catch (e) {}
        });
    };
    if (ms) {
        ms.value = Math.round((app.settings.volume ?? 0.8) * 100);
        msl.textContent = ms.value + '%';
        ms.addEventListener('input', () => {
            const v = ms.value / 100;
            app.settings.volume = v;
            try { app.saveSettings(); } catch (e) {}
            msl.textContent = ms.value + '%';
            const sv = $('#q-volume'); if (sv) sv.value = ms.value;
            const mv = $('#q-media-volume'); if (mv) mv.value = ms.value;
            const ml = $('#q-media-volume-val'); if (ml) ml.textContent = ms.value + '%';
            applyVol(v);
        });
        // Follow the status-bar and media-deck sliders so all three stay in sync.
        const follow = (el) => el && el.addEventListener('input', () => {
            ms.value = el.value;
            msl.textContent = el.value + '%';
            applyVol(el.value / 100);
        });
        follow($('#q-volume'));
        follow($('#q-media-volume'));
    }

    /* ---------- deck player ---------- */
    const setNow = (title, artist) => {
        nowTitle.textContent = title;
        nowArtist.textContent = artist || '';
    };
    const refreshPlay = () => {
        const playing = !!(state.track && !audio.paused);
        playIcon.className = `fas fa-${playing ? 'pause' : 'play'}`;
        playLabel.textContent = playing ? 'PAUSE' : 'PLAY';
    };

    const playCurrent = () => {
        const t = state.queue[state.index];
        if (!t) return;
        state.track = t;
        audio.src = t.file;
        audio.volume = Math.min(1, Math.max(0, Number(app.settings.volume ?? 0.8) || 0));
        setNow(t.title, t.artist || '');
        try { artBox.style.backgroundImage = `url('${t.art || DEFAULT_ART}')`; } catch (e) {}
        fill.style.width = '0%';
        timeCur.textContent = '0:00';
        timeDur.textContent = t.duration ? fmtTime(t.duration) : '0:00';
        audio.play().then(refreshPlay).catch(err => {
            console.error('music deck: play failed', err);
            refreshPlay();
            toast.show('Playback was blocked — hit PLAY to start the deck.', 'warning');
        });
    };

    const loadQueue = (tracks, index) => {
        if (!tracks || !tracks.length) return;
        state.queue = tracks;
        state.index = Math.min(Math.max(index | 0, 0), tracks.length - 1);
        playCurrent();
    };

    const step = (delta) => {
        if (!state.queue.length) return;
        let i = state.index + delta;
        if (i < 0) i = state.queue.length - 1;
        if (i >= state.queue.length) i = 0;
        state.index = i;
        playCurrent();
    };

    audio.addEventListener('play', refreshPlay);
    audio.addEventListener('pause', refreshPlay);
    audio.addEventListener('ended', () => step(1));
    audio.addEventListener('loadedmetadata', () => {
        timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : timeDur.textContent;
    });
    audio.addEventListener('timeupdate', () => {
        if (audio.duration && isFinite(audio.duration)) {
            fill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
            timeCur.textContent = fmtTime(audio.currentTime);
        }
    });
    audio.addEventListener('error', () => {
        if (!state.track) return;
        refreshPlay();
        setNow('Playback error', `${state.track.title} — stream unavailable, try Next`);
    });
    bar.addEventListener('click', (e) => {
        if (!audio.duration || !isFinite(audio.duration)) return;
        const r = bar.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        audio.currentTime = p * audio.duration;
    });
    playBtn.addEventListener('click', () => {
        if (!state.track) { playFeatured(0); return; }
        if (audio.paused) {
            audio.play().then(refreshPlay).catch(() => toast.show('Playback blocked by the browser.', 'warning'));
        } else {
            audio.pause();
        }
    });
    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));

    /* ---------- archive.org item -> track queue ---------- */
    async function openArchiveItem(ident, title, artist) {
        setNow(`Loading ${title}…`, artist || 'archive.org');
        try {
            const res = await fetch(ARCHIVE_META + ident);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = await res.json();
            const meta = j.metadata || {};
            const creator = Array.isArray(meta.creator) ? meta.creator[0] : (meta.creator || '');
            const files = (j.files || []).filter(f => f && /mp3/i.test(String(f.format || '')));
            if (!files.length) throw new Error('no MP3 files in item');
            const tracks = files.map(f => ({
                title: String(f.name || '').split('/').pop().replace(/\.mp3$/i, ''),
                artist: artist || creator || '',
                duration: parseLen(f.length),
                file: archiveFileUrl(ident, f.name),
                art: archiveThumb(ident),
            }));
            loadQueue(tracks, 0);
        } catch (e) {
            console.error('music deck: archive item failed', ident, e);
            setNow('Could not load that item', 'archive.org metadata unreachable — try another track');
            toast.show('Could not load that audio item from archive.org.', 'error');
        }
    }

    /* ---------- featured grid (SoundHelix files + curated classics) ---------- */
    const fileTracks = ((media && Array.isArray(media.music)) ? media.music : []).map(s => ({
        title: s.title, artist: s.artist || '', duration: s.duration || '',
        file: s.file, art: s.thumb,
    }));
    const featured = [
        ...fileTracks.map(t => ({ kind: 'file', ...t })),
        ...CLASSICS.map(c => ({ kind: 'archive', title: c.title, artist: c.artist, ident: c.id, art: archiveThumb(c.id) })),
    ];

    function cardHTML(t, attrs) {
        const dur = t.duration ? (typeof t.duration === 'number' ? fmtTime(t.duration) : t.duration) : '';
        return `<button class="glass-panel p-3 flex items-center gap-3 text-left w-full q-music-track" ${attrs}>
            <img src="${esc(t.art || '')}" alt="" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" style="background:rgba(255,255,255,.05)" onerror="this.style.visibility='hidden'">
            <div class="flex-1 min-w-0">
                <div class="text-xs text-white font-bold truncate">${esc(t.title)}</div>
                <div class="text-[11px] text-gray-500 truncate">${esc(t.artist || '')}${dur ? ` · ${esc(dur)}` : ''}</div>
            </div>
            <i class="fas fa-play text-accent"></i>
        </button>`;
    }

    function playFeatured(i) {
        const t = featured[i];
        if (!t) return;
        if (t.kind === 'file') loadQueue(fileTracks, fileTracks.indexOf(t));
        else openArchiveItem(t.ident, t.title, t.artist);
    }

    function renderFeatured() {
        if (!featuredGrid) return;
        featuredGrid.innerHTML = featured.map((t, i) =>
            cardHTML(t, `data-fi="${i}" title="${esc(t.artist || '')} — ${esc(t.title)}"`)).join('');
        featuredGrid.addEventListener('click', (e) => {
            const b = e.target.closest('.q-music-track');
            if (b) playFeatured(parseInt(b.dataset.fi, 10));
        });
    }
    renderFeatured();

    /* ---------- live search (Internet Archive, CORS-enabled) ---------- */
    let timer = null;
    async function runSearch() {
        const q = input.value.trim();
        if (!q) {
            resultsWrap.classList.add('hidden');
            resultsGrid.innerHTML = '';
            count.textContent = '';
            if (hcount) hcount.textContent = '';
            return;
        }
        count.textContent = 'searching…';
        try {
            const url = `${ARCHIVE_SEARCH}?q=${encodeURIComponent(q + ' AND mediatype:audio AND format:(MP3)')}` +
                '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year' +
                `&sort%5B%5D=${encodeURIComponent('downloads desc')}&rows=24&page=1&output=json`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = await res.json();
            const docs = (j.response && j.response.docs) || [];
            state.results = docs;
            resultsWrap.classList.remove('hidden');
            count.textContent = docs.length ? `${docs.length} / ${j.response.numFound}` : '';
            if (hcount) hcount.textContent = docs.length ? `(${docs.length})` : '';
            if (!docs.length) {
                resultsGrid.innerHTML = '<div class="text-xs text-gray-500">No tracks found. Try another artist, song, or album.</div>';
                return;
            }
            resultsGrid.innerHTML = docs.map((d, i) => {
                const creator = Array.isArray(d.creator) ? d.creator[0] : (d.creator || '');
                const artist = `${creator || d.identifier}${d.year ? ` · ${d.year}` : ''}`;
                return cardHTML({ title: d.title || d.identifier, artist, art: archiveThumb(d.identifier) },
                    `data-si="${i}" title="${esc(d.title || d.identifier)}"`);
            }).join('');
        } catch (e) {
            console.error('music deck search failed:', e);
            resultsWrap.classList.remove('hidden');
            count.textContent = '';
            if (hcount) hcount.textContent = '';
            resultsGrid.innerHTML = '<div class="text-xs text-gray-500">Search unreachable right now — check the connection and try again.</div>';
        }
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 450); });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(timer); runSearch(); }
    });
    resultsGrid.addEventListener('click', (e) => {
        const b = e.target.closest('.q-music-track');
        if (!b) return;
        const d = state.results[parseInt(b.dataset.si, 10)];
        if (d) openArchiveItem(d.identifier, d.title || d.identifier,
            Array.isArray(d.creator) ? d.creator[0] : (d.creator || ''));
    });

    /* ---------- music sources (open in the in-hub viewer) ---------- */
    if (sourcesGrid && !sourcesGrid.dataset.q) {
        sourcesGrid.dataset.q = '1';
        sourcesGrid.innerHTML = MUSIC_SOURCES.map((s, i) => `<div class="media-card catalog-card" data-si="${i}" title="${esc(s.desc)}">
            <div class="catalog-art">
                <span class="catalog-title">${esc(s.name)}</span>
                <span class="catalog-tier">${esc(s.tag)}</span>
            </div></div>`).join('');
        sourcesGrid.addEventListener('click', (e) => {
            const c = e.target.closest('.catalog-card');
            if (!c) return;
            const s = MUSIC_SOURCES[parseInt(c.dataset.si, 10)];
            if (s) app.launchContent(s.url, 'about-blank', s.name);
        });
    }

    refreshPlay();
}
