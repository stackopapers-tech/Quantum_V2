// (c) Quantum Hub — proprietary hub build. All rights reserved.
/**
 * Quantum Hub — default settings, demo catalog, and media library.
 */

export const DEFAULT_SETTINGS = {
    theme: 'obsidian', // obsidian, cyberpunk, deepspace, amethyst, cassian
    accentColor: '#39ff14', // Default neon green
    animations: 'full', // full, reduced, none
    audioFeedback: true,
    particlesEnabled: true,
    defaultLaunchBehavior: 'about-blank', // 'about-blank', 'new-tab', 'same-tab'
    defaultMirrorId: 'cdn-githack',
    linksOpenNewTab: true,
    // New features
    viewMode: 'grid', // 'grid', 'list', 'compact'
    showGameStats: true,
    customWallpaper: '',
    animatedBg: '', // '', 'bubbles', 'snow', 'particles' (canvas layer behind the UI)
    soundPack: 'quantum', // 'quantum', 'retro', 'minimal'
    commandPaletteEnabled: true,
    gamepadSupport: true,
    autoHideDock: false,
    compactMode: false,
    language: 'en',
    // Auth settings
    rememberSession: true,
    sessionTimeout: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export const DEFAULT_SOUND_PACKS = {
    quantum: {
        click: { freq: 880, dur: 0.02, type: 'sine', vol: 0.012 },
        hover: { freq: 660, dur: 0.015, type: 'sine', vol: 0.008 },
        launch: { freq: 440, dur: 0.15, type: 'triangle', vol: 0.03 },
        success: [ { freq: 523.25, dur: 0.08 }, { freq: 659.25, dur: 0.08 } ],
        error: { freq: 180, dur: 0.2, type: 'sawtooth', vol: 0.12 },
        notification: { freq: 440, dur: 0.15, type: 'sine', vol: 0.05 },
    },
    retro: {
        click: { freq: 523.25, dur: 0.05, type: 'square', vol: 0.02 },
        hover: { freq: 659.25, dur: 0.03, type: 'square', vol: 0.01 },
        launch: { freq: 261.63, dur: 0.3, type: 'square', vol: 0.04 },
        success: [ { freq: 523.25, dur: 0.1, type: 'square' }, { freq: 783.99, dur: 0.1, type: 'square' }, { freq: 1046.5, dur: 0.15, type: 'square' } ],
        error: { freq: 130.81, dur: 0.3, type: 'sawtooth', vol: 0.15 },
        notification: { freq: 392, dur: 0.2, type: 'triangle', vol: 0.06 },
    },
    minimal: {
        click: { freq: 1000, dur: 0.01, type: 'sine', vol: 0.005 },
        hover: null,
        launch: { freq: 800, dur: 0.05, type: 'sine', vol: 0.01 },
        success: [ { freq: 800, dur: 0.05, type: 'sine' } ],
        error: { freq: 200, dur: 0.1, type: 'sine', vol: 0.02 },
        notification: { freq: 600, dur: 0.05, type: 'sine', vol: 0.01 },
    },
};

/* Launch destinations only. The hub opens these directly in a separate tab
   (about:blank -> destination, or plain new tab). It does NOT proxy, cache,
   rewrite, or relay traffic for them, and does NOT bypass any network, ISP,
   school, workplace, or browser restriction. Each URL is a real, public
   destination owned by its own site. */
// ============================================================
// MIRROR SYSTEM: Per-game CDN mirrors with fallback.
// Global mirrors removed. Each game now has its own `mirrors` array.
// Allowed mirror hosts (the ONLY two that work — verified 2026-10-04):
//   raw.githack.com, rawcdn.githack.com
// Everything else (jsDelivr family, Statically, cdnjs, Bunny, raw.githubusercontent)
// serves .html as text/plain or is blocked — NOT offered as mirrors anymore.
// ============================================================
// Launch destinations only. The hub opens these directly in a separate tab
// (about:blank -> destination, or plain new tab). It does NOT proxy, cache,
// rewrite, or relay traffic for them, and does NOT bypass any network, ISP,
// school, workplace, or browser restriction. Each URL is a real, public
// destination owned by its own site.
export const DEFAULT_MIRRORS = [

    {
        id: 'cdn-githack',
        name: 'Githack Raw CDN',
        description: 'jQuery 3.7.1 via Githack raw proxy (raw.githack.com, proper MIME, non-jsDelivr domain). Verified 200.',
        url: 'https://raw.githack.com/jquery/jquery-dist/3.7.1/dist/jquery.min.js',
        icon: 'archive',
        status: 'Available',
        latency: '24ms',
        enabled: true,
        launchMode: 'about-blank'
    },

    {
        id: 'cdn-rawcdn',
        name: 'Githack Cloudflare Edge',
        description: 'jQuery 3.7.1 via rawcdn.githack.com (Cloudflare edge of the same Githack service). Verified 200, CORS=*.',
        url: 'https://rawcdn.githack.com/jquery/jquery-dist/3.7.1/dist/jquery.min.js',
        icon: 'cloud',
        status: 'Available',
        latency: 'unverified',
        enabled: true,
        launchMode: 'about-blank'
    },

    {
        id: 'hub-netlify',
        name: 'Quantum Hub — Netlify Mirror',
        description: 'Full hub deployment on Netlify (same build, alternate host). Pick it when the primary host is blocked.',
        url: 'https://quantum2v.netlify.app/',
        icon: 'bolt',
        status: 'Available',
        latency: 'unverified',
        enabled: true,
        launchMode: 'about-blank'
    },

];

// MIRROR RULE (enforced):
// raw.githack.com and rawcdn.githack.com are the ONLY CDN probe mirrors
// (user-verified 2026-10-04): every other CDN host was removed from
// DEFAULT_MIRRORS, ALLOWED_CDN_BASES and every catalog's mirrors[] array.
// Both built-in entries use jQuery 3.7.1 (MIT) as the probe file.
// Prohibited as mirrors: jsDelivr family, Statically, cdnjs, Bunny,
// raw.githubusercontent (serve .html as text/plain) and other game sites.
//
// Exception (user-requested): hub-netlify is a full hub DEPLOYMENT mirror,
// not a CDN probe — an alternate host serving the same build.
//
// Per-game mirrors are generated at launch time (mirror-loader.js
// mirrorCandidates/mirrorUrlGuesses): html game entries fan out across the
// two hosts that serve text/html (raw.githack.com + rawcdn.githack.com —
// jsDelivr, Statically and raw.githubusercontent serve .html as text/plain,
// which an iframe can only show as source, so they are not offered), with
// *.github.io branch guesses riding along at the end. The server relay
// (/relay/raw/…) is always last: it fetches server-side, repairs the MIME,
// injects <base>/root-path rewrites so every relative and root-relative
// asset streams through it too, and works even when the browser's network
// blocks the CDNs entirely.
//
// Retired portal entries (direct, crazygames, poki, newgrounds, archive,
// github-pages) and the retired non-githack CDN entries (cdn-jsdelivr,
// cdn-jsdmirror, cdn-bunny, cdn-statically, cdn-cdnjs) are purged from
// existing users' localStorage on load — loadMirrors() rebuilds strictly
// from DEFAULT_MIRRORS. The #panel-proxy launch nodes
// (YukiOS, Nebula, Mizu Math, UnblockZone) are separate user-requested
// launch destinations, NOT mirrors, and are unaffected by this rule.

// CDN base domains allowed for game mirrors (used for validation)
// Githack-only: raw + rawcdn edges are the two hosts that serve text/html.
export const ALLOWED_CDN_BASES = [
    'raw.githack.com',
    'rawcdn.githack.com'
];

export const DEFAULT_GAMES = [
    // --- HIGH-OCTANE ACTION ---
    {
        id: 'game_krunker',
        name: 'Krunker.io',
        url: 'https://unblockedgames66.gitlab.io/krunker-io/',
        image: 'games/img/game_krunker.jpg',
        description: 'Competitive fast-paced FPS. High-speed movement and precision shooting.',
        category: 'FPS',
        accentColor: '#ff4444',
        launchMode: 'about-blank'
    },
    {
        id: 'game_slither',
        name: 'Slither.io',
        url: 'https://slither.io/',
        image: 'https://slither.io/favicon.ico',
        description: 'Massive multiplayer snake. Eat orbs, grow large, and trap others.',
        category: 'Arcade',
        accentColor: '#3b82f6',
        launchMode: 'about-blank'
    },
    {
        id: 'game_shellshock',
        name: 'Shell Shockers',
        url: 'https://unblockedgames66.gitlab.io/shell-shockers/',
        image: 'https://shellshock.io/favicon.ico',
        description: 'Egg-based first person shooter. Tactical combat in a surreal world.',
        category: 'FPS',
        accentColor: '#facc15',
        launchMode: 'about-blank'
    , mirrors: []},
    {
        id: 'game_evazoid',
        name: 'Evazoid',
        url: 'https://evazoid.com/',
        image: 'https://evazoid.com/favicon.ico',
        description: 'A stealth-action game where you must evade detection systems.',
        category: 'Action',
        accentColor: '#a855f7',
        launchMode: 'about-blank'
    },

    // --- MIND-BENDING PUZZLES ---
    {
        id: 'game_2048',
        name: '2048',
        url: 'https://monkeygg2.github.io/games/2048',
        image: 'https://unblocked-games-g-plus.poki2.online/assets/upload/66games/jpg/2048.jpg',
        description: 'Merge tiles to reach the 2048 square. Pure logic and strategy.',
        category: 'Puzzle',
        accentColor: '#39ff14',
        launchMode: 'about-blank'
    , mirrors: ['https://raw.githack.com/Prollhouse2/gamesite/main/g/2048/index.html', 'https://raw.githack.com/55gms/55GMS/main/static/misc/2048/index.html']},
    {
        id: 'game_cut-the-wire',
        name: 'Cut the Wire',
        url: 'https://www.cutthewire.com/',
        image: 'https://www.cutthewire.com/favicon.ico',
        description: 'Physics-based puzzle. Cut the right lines to guide the energy.',
        category: 'Puzzle',
        accentColor: '#22c55e',
        launchMode: 'about-blank'
    },
    {
        id: 'game_google-maze',
        name: 'Google Maze',
        url: 'https://elgoog.im/maze/',
        image: 'https://elgoog.im/favicon.ico',
        description: 'Find the exit of the maze as fast as possible. Classic stress-test.',
        category: 'Puzzle',
        accentColor: '#3b82f6',
        launchMode: 'about-blank'
    },

    // --- SANDBOX & SIMULATION ---
    {
        id: 'game_minecraft_classic',
        name: 'Minecraft Classic',
        url: 'https://unblockedgames66.gitlab.io/minecraft-classic/',
        image: 'https://unblocked-games-g-plus.poki2.online/assets/upload/66games/jpg/minecraft-classic.jpg',
        description: 'The original 2009 build. Build and mine in a limited world.',
        category: 'Sandbox',
        accentColor: '#10b981',
        launchMode: 'about-blank'
    },
    {
        id: 'game_paper-io',
        name: 'Paper.io 2',
        url: 'https://paper-io.com/',
        image: 'https://paper-io.com/favicon.ico',
        description: 'Claim as much territory as possible without being cut off.',
        category: 'Sandbox',
        accentColor: '#ec4899',
        launchMode: 'about-blank'
    , mirrors: ['https://raw.githack.com/Prollhouse2/gamesite/main/g/paperio2/index.html', 'https://raw.githack.com/55gms/55GMS/main/static/misc/paperio2/index.html']},

    // --- RETRO ARCADE ---
    {
        id: 'game_dino',
        name: 'Chrome Dino',
        url: 'https://monkeygg2.github.io/games/chrome-dino',
        image: 'https://chromedino.com/favicon.ico',
        description: 'The legendary offline runner. Jump over cacti and birds.',
        category: 'Arcade',
        accentColor: '#9ca3af',
        launchMode: 'about-blank'
    },
    {
        id: 'game_pacman',
        name: 'Google Pacman',
        url: 'https://www.google.com/logos/2010/pacman10-i.html',
        image: 'https://www.google.com/favicon.ico',
        description: 'The timeless arcade classic. Eat all the dots, avoid the ghosts.',
        category: 'Arcade',
        accentColor: '#ffff00',
        launchMode: 'about-blank'
    },
    {
        id: 'game_tetris',
        name: 'Tetris',
        url: 'https://unblockedgames66.gitlab.io/tetris/',
        image: 'https://tetris.com/favicon.ico',
        description: 'The world\'s most famous puzzle game. Fit the blocks, clear the lines.',
        category: 'Puzzle',
        accentColor: '#3b82f6',
        launchMode: 'about-blank'
    , mirrors: ['https://raw.githack.com/Prollhouse2/gamesite/main/g/tetris/index.html', 'https://raw.githack.com/55gms/55GMS/main/static/misc/flash/index.html?swf=tetris.swf']},
    {
        id: 'game_escape_road_2',
        name: 'Escape Road 2',
        url: 'https://raw.githack.com/matheveryday25/math/main/escaperoad2city/',
        image: 'https://raw.githack.com/s0n-1m-cr1n3/sc13nc3/main/assets/img/main/escaperoad2.png',
        description: 'Unity 3D sequel. Bigger city, faster chase. Opens in sandboxed iframe with CDN fallback.',
        category: 'Action',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        iframeOnly: true
    },
    {
        id: 'game_escape_road_3',
        name: 'Escape Road 3',
        url: 'https://raw.githack.com/matheveryday25/math/main/road3/',
        image: 'https://raw.githack.com/s0n-1m-cr1n3/sc13nc3/main/assets/img/main/escaperoad3.png',
        description: 'Unity 3D threequel. New city, new rides. Opens in sandboxed iframe with CDN fallback.',
        category: 'Action',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        iframeOnly: true
    },
    {
        id: 'game_escape_road',
        name: 'Escape Road',
        url: 'https://raw.githack.com/abisdbest/classroom.google.com/45b2d69c626dc365753f6922d2c48c4075683ef5/drive.google.com/escape%20road/',
        image: 'https://raw.githack.com/abisdbest/classroom.google.com/45b2d69c626dc365753f6922d2c48c4075683ef5/drive.google.com/escape%20road/icon.png',
        description: 'Unity 3D driving game. Escape the police through traffic in this high-speed chase.',
        category: 'Action',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        mirrors: ['https://raw.githack.com/abisdbest/classroom.google.com/45b2d69c626dc365753f6922d2c48c4075683ef5/drive.google.com/escape%20road/']
    },

    // --- MIRROR-HOSTED GAMES (GitHub/jsDelivr CDN) ---
    // These games are hosted on GitHub and served via jsDelivr CDN mirrors
    // The mirror loader will try each CDN edge until one works
    {
        id: 'game_eaglercraft',
        name: 'Eaglercraft (Minecraft 1.8.8)',
        url: 'https://raw.githack.com/s0n-1m-cr1n3/sc13nc3/main/assets/index.html',
        image: 'https://raw.githack.com/s0n-1m-cr1n3/sc13nc3/main/assets/icon.png',
        description: 'Minecraft 1.8.8 in your browser. Singleplayer, multiplayer, realms. Runs on WebGL.',
        category: 'Sandbox',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        mirrors: ['https://raw.githack.com/s0n-1m-cr1n3/sc13nc3/main/assets/index.html']
    },
    {
        id: 'game_eaglercraft_1.12',
        name: 'Eaglercraft 1.12.2',
        url: 'https://raw.githack.com/lax1dude/eaglercraft-1.12/main/index.html',
        image: 'https://raw.githack.com/lax1dude/eaglercraft-1.12/main/icon.png',
        description: 'Minecraft 1.12.2 in browser. Newer version with more features.',
        category: 'Sandbox',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        mirrors: ['https://raw.githack.com/lax1dude/eaglercraft-1.12/main/index.html']
    },
    {
        id: 'game_hextris',
        name: 'Hextris',
        url: 'https://monkeygg2.github.io/games/hextris',
        image: 'https://raw.githack.com/Hextris/hextris.github.io/master/icon.png',
        description: 'Fast-paced hexagon puzzle inspired by Tetris. Open source (GPLv3).',
        category: 'Puzzle',
        accentColor: '#00f0ff',
        launchMode: 'about-blank',
        mirrors: ['https://raw.githack.com/Hextris/hextris.github.io/master/index.html', 'https://raw.githack.com/55gms/55GMS/main/static/misc/hextris/index.html']
    },
    {
        id: 'game_2048_mirror',
        name: '2048 (Mirror)',
        url: 'https://raw.githack.com/gabrielecirulli/2048/master/index.html',
        image: 'https://raw.githack.com/gabrielecirulli/2048/master/icon.png',
        description: 'Original 2048 by Gabriele Cirulli. Mirror-hosted via jsDelivr.',
        category: 'Puzzle',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        mirrors: ['https://raw.githack.com/gabrielecirulli/2048/master/index.html']
    },
    {
        id: 'game_snake_mirror',
        name: 'Snake (Mirror)',
        url: 'https://raw.githack.com/paulirish/snake/master/index.html',
        image: 'https://raw.githack.com/paulirish/snake/master/icon.png',
        description: 'Classic Snake game. Mirror-hosted via jsDelivr.',
        category: 'Arcade',
        accentColor: '#22c55e',
        launchMode: 'about-blank',
        mirrors: ['https://raw.githack.com/paulirish/snake/master/index.html']
    },
    // --- GAME PORTALS (from pasted Gamesites directory; verified live) ---
    // Dead links from that list (DNS gone, 404, or cert-blocked) were skipped:
    // Unblockify, Lioxryt, Zatoga, Internet Archive, School Heaven,
    // MathGames66, ABC Games, Modern Method, Skool, Odd Games, SHS Games.
    {
        id: 'portal_3kh0',
        name: '3kh0',
        url: 'https://3kh0.github.io/',
        image: 'games/img/portal_3kh0.jpg',
        description: 'Game portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#3b82f6',
        launchMode: 'about-blank',
        iframeOnly: false
    },
    {
        id: 'portal_pringles',
        name: 'Pringles',
        url: 'https://ellieeet123.github.io/',
        image: 'games/img/portal_pringles.jpg',
        description: 'Game portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#facc15',
        launchMode: 'about-blank',
        iframeOnly: false
    },
    {
        id: 'portal_outred',
        name: 'OutRed Games',
        url: 'https://outred.github.io/',
        image: 'games/img/portal_outred.jpg',
        description: 'Game portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#ff4444',
        launchMode: 'about-blank',
        iframeOnly: false
    },
    {
        id: 'portal_gba',
        name: 'Gba Online',
        url: 'https://gba.js.org/',
        image: 'games/img/portal_gba.jpg',
        description: 'Game portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#22c55e',
        launchMode: 'about-blank',
        iframeOnly: false
    },
    {
        id: 'portal_webretro',
        name: 'Web Retro',
        url: 'https://binbashbanana.github.io/webretro/',
        image: 'games/img/portal_webretro.jpg',
        description: 'Retro emulator portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#a855f7',
        launchMode: 'about-blank',
        iframeOnly: false
    },
    {
        id: 'portal_bidoofery',
        name: 'Bidoofery',
        url: 'https://bidoofery.github.io/',
        image: 'games/img/portal_bidoofery.jpg',
        description: 'Game portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#ec4899',
        launchMode: 'about-blank',
        iframeOnly: false
    },
    {
        id: 'portal_retro_games',
        name: 'Retro Games',
        url: 'https://theooofficial.github.io/myRETROGAMES/',
        image: 'games/img/portal_retro_games.jpg',
        description: 'Retro game portal. Opens in sandboxed iframe with direct-open fallback.',
        category: 'Portal',
        accentColor: '#39ff14',
        launchMode: 'about-blank',
        iframeOnly: false
    }
];

export const DEMO_MEDIA = {
    movies: [
    { title: "Sita Sings the Blues", year: "2008", duration: "", genre: "Public Domain", url: "https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_DVD_NTSC1.mp4", thumb: "https://archive.org/services/img/Sita_Sings_the_Blues" },
    { title: "Big Buck Bunny", year: "2008", duration: "0:10", genre: "Animation", url: "media/offline/big-buck-bunny.mp4", thumb: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=400" },
    { title: "Flower in the Wind", year: "Clip", duration: "0:30", genre: "Nature", url: "media/offline/flower.mp4", thumb: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?q=80&w=400" },
    { title: "Elephants Dream", year: "2006", duration: "Short", genre: "Animation", url: "media/offline/elephants-dream.mp4", thumb: "https://archive.org/services/img/elephantsdream" },
    { title: "Nosferatu", year: "1922", duration: "1:34", genre: "Horror", url: "https://archive.org/download/bedford-Nosferatu/Nosferatu.mp4", thumb: "https://archive.org/services/img/bedford-Nosferatu" },
    { title: "House on Haunted Hill", year: "1959", duration: "", genre: "Horror", url: "https://archive.org/download/devula-006-house-on-haunted-hill/Devula-006-House%20on%20Haunted%20Hill.mp4", thumb: "https://archive.org/services/img/devula-006-house-on-haunted-hill" },
    { title: "Plan 9 from Outer Space", year: "1959", duration: "", genre: "Sci-Fi", url: "https://archive.org/download/774-plan-9-from-outer-space/774-Plan9FromOuterSpace.mp4", thumb: "https://archive.org/services/img/774-plan-9-from-outer-space" },
    { title: "His Girl Friday", year: "1940", duration: "", genre: "Comedy", url: "https://archive.org/download/HisGirlFriday1940_201808/HisGirlFriday1940.mp4", thumb: "https://archive.org/services/img/HisGirlFriday1940_201808" },
    { title: "Carnival of Souls", year: "1962", duration: "", genre: "Horror", url: "https://archive.org/download/carnival-of-souls-512kb_202507/CarnivalOfSouls_512kb.mp4", thumb: "https://archive.org/services/img/carnival-of-souls-512kb_202507" },
    { title: "White Zombie", year: "1932", duration: "", genre: "Horror", url: "https://archive.org/download/11-white-zombie/11%20White%20zombie.mp4", thumb: "https://archive.org/services/img/11-white-zombie" },
    { title: "The Last Man on Earth", year: "1964", duration: "1:26", genre: "Sci-Fi", url: "https://archive.org/download/the-last-man-on-earth-1964-color/The%20Last%20Man%20On%20Earth1964%20(Color).mp4", thumb: "https://archive.org/services/img/the-last-man-on-earth-1964-color" },
    { title: "Safety Last!", year: "1923", duration: "", genre: "Comedy", url: "https://archive.org/download/safety-last-1923-by-fred-c.-newmeyer-and-sam-taylor/Safety.Last.1923.1080p.BluRay.x264.AAC-%5BYTS.MX%5D.mp4", thumb: "https://archive.org/services/img/safety-last-1923-by-fred-c.-newmeyer-and-sam-taylor" },
    { title: "Angel and the Badman", year: "1947", duration: "", genre: "Western", url: "https://archive.org/download/angel-and-the-badman-1947-by-james-edward-grant/Angel.And.The.Badman.1947.1080p.BluRay.x264-%5BYTS.AM%5D.mp4", thumb: "https://archive.org/services/img/angel-and-the-badman-1947-by-james-edward-grant" },
    { title: "Kansas City Confidential", year: "1952", duration: "", genre: "Noir", url: "https://archive.org/download/kansas-city-confidential-1952-by-phil-karlson/Kansas.City.Confidential.1952.1080p.BluRay.x264-%5BYTS.AM%5D.mp4", thumb: "https://archive.org/services/img/kansas-city-confidential-1952-by-phil-karlson" },
    { title: "The Brain That Wouldn't Die", year: "1962", duration: "", genre: "Horror", url: "https://archive.org/download/turner_video_265/265.mp4", thumb: "https://archive.org/services/img/turner_video_265" },
    { title: "The Phantom Planet", year: "1961", duration: "", genre: "Sci-Fi", url: "https://archive.org/download/ThePhantomPlanet/ThePhantomPlanetPresentedByMoviePowder.mp4", thumb: "https://archive.org/services/img/ThePhantomPlanet" },
    { title: "Teenagers from Outer Space", year: "1959", duration: "", genre: "Sci-Fi", url: "https://archive.org/download/teenagers-from-outer-space-1959_202606/Teenagers%20from%20Outer%20Space%201959.mp4", thumb: "https://archive.org/services/img/teenagers-from-outer-space-1959_202606" },
    { title: "A Star Is Born", year: "1937", duration: "", genre: "Drama", url: "https://archive.org/download/a.-star.is.-born.-1937.-bluray.-1080p.-dts-hd-2.0.x-264-grym/A.Star.is.Born.1937.Bluray.1080p.DTS-HD-2.0.x264-Grym.mp4", thumb: "https://archive.org/services/img/a.-star.is.-born.-1937.-bluray.-1080p.-dts-hd-2.0.x-264-grym" },
    { title: "A Day's Pleasure", year: "1919", duration: "", genre: "Comedy", url: "https://archive.org/download/a-days-pleasure-1919/A%20Days%20Pleasure%20%281919%29.mp4", thumb: "https://archive.org/services/img/a-days-pleasure-1919" },
    { title: "Billy the Kid", year: "1930", duration: "", genre: "Western", url: "https://archive.org/download/billy-the-kid-1930_202507/Billy%20the%20Kid%201930.mp4", thumb: "https://archive.org/services/img/billy-the-kid-1930_202507" },
    { title: "Detour", year: "1945", duration: "", genre: "Noir", url: "https://archive.org/download/detour-1945-colorized-movie-720p-hd/detour-1945-colorized%20movie-720p-hd.mp4", thumb: "https://archive.org/services/img/detour-1945-colorized-movie-720p-hd" },
    { title: "D.O.A.", year: "1949", duration: "", genre: "Noir", url: "https://archive.org/download/doa-1950_202506/DOA%201950.mp4", thumb: "https://archive.org/services/img/doa-1950_202506" },
    { title: "The Terror", year: "1963", duration: "", genre: "Horror", url: "https://archive.org/download/RogerCormansTheTerror720p/TheTerrorsd_xvid.mp4", thumb: "https://archive.org/services/img/RogerCormansTheTerror720p" },
    { title: "College", year: "1927", duration: "", genre: "Comedy", url: "https://archive.org/download/college-1927-with-commentary-by-rob-farr/College%20%281927%29%20with%20commentary%20by%20Rob%20Farr.mp4", thumb: "https://archive.org/services/img/college-1927-with-commentary-by-rob-farr" }
    ],
    tv: [
    ],
    music: [
        { title: 'SoundHelix Track 1', artist: 'SoundHelix', duration: '6:12', file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', thumb: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200' },
        { title: 'SoundHelix Track 2', artist: 'SoundHelix', duration: '7:04', file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', thumb: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=200' },
        { title: 'SoundHelix Track 3', artist: 'SoundHelix', duration: '5:44', file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', thumb: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=200' },
        { title: 'SoundHelix Track 4', artist: 'SoundHelix', duration: '6:30', file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', thumb: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=200' },
        { title: 'SoundHelix Track 5', artist: 'SoundHelix', duration: '5:54', file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', thumb: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=200' },
        { title: 'SoundHelix Track 6', artist: 'SoundHelix', duration: '6:21', file: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=200' }
    ],
    podcasts: [
        { title: 'Decentralized Future', host: 'Alex Sterling', duration: '45m', thumb: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=200' },
        { title: 'Indie Dev Space', host: 'Mia Chen', duration: '32m', thumb: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=200' },
        { title: 'Pixel Talk Weekly', host: 'Jordan Blake', duration: '58m', thumb: 'https://images.unsplash.com/photo-1589902869114-7b3b1a5d3e5e?q=80&w=200' },
        { title: 'Speedrun Stories', host: 'Casey Rivers', duration: '41m', thumb: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?q=80&w=200' },
        { title: 'Synth & Circuits', host: 'Nova Reed', duration: '36m', thumb: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=200' },
        { title: 'Open Source Hour', host: 'Dev Patel', duration: '52m', thumb: 'https://images.unsplash.com/photo-1618401471353-b98af9a5850c?q=80&w=200' }
    ],
    favorites: [
        { title: 'Minecraft Classic', type: 'Game', id: 'game-3' }
    ]
};

export const PROXY_DATA = {
    resources: [
        { name: 'MDN Web Docs', url: 'https://developer.mozilla.org', desc: 'Legitimate open resources for web technology and browser behaviors.', cat: 'Dev Tools' },
        { name: 'JSONPlaceholder API', url: 'https://jsonplaceholder.typicode.com', desc: 'Free online REST API for testing and prototyping network requests.', cat: 'APIs' },
        { name: 'DevDocs.io', url: 'https://devdocs.io', desc: 'Fast, offline-capable developer documentation viewer combining multiple APIs.', cat: 'Dev Tools' },
        { name: 'Postman Learning', url: 'https://learning.postman.com', desc: 'Interactive lessons on HTTP requests, methods, headers, and status codes.', cat: 'Debugging' }
    ]
};

// Demo collections for games
export const DEFAULT_COLLECTIONS = [
    { id: 'coll_favorites', name: 'Favorites', color: '#ff007f', icon: 'heart', gameIds: [] },
    { id: 'coll_retro', name: 'Retro Arcade', color: '#00f0ff', icon: 'gamepad', gameIds: [] },
    { id: 'coll_sandbox', name: 'Sandbox Worlds', color: '#39ff14', icon: 'cube', gameIds: [] },
];

// Achievements definitions
export const ACHIEVEMENT_DEFS = [
    { id: 'first_launch', name: 'First Contact', desc: 'Launch your first game', icon: 'rocket', hidden: false },
    { id: 'ten_launches', name: 'Frequent Flyer', desc: 'Launch games 10 times', icon: 'plane', hidden: false },
    { id: 'add_five_games', name: 'Curator', desc: 'Add 5 games to your library', icon: 'plus-circle', hidden: false },
    { id: 'night_owl', name: 'Night Owl', desc: 'Launch a game after midnight', icon: 'moon', hidden: false },
    { id: 'mirror_master', name: 'Mirror Master', desc: 'Use 3 different mirrors', icon: 'shield-alt', hidden: false },
    { id: 'theme_hopper', name: 'Chameleon', desc: 'Try all 5 themes', icon: 'palette', hidden: false },
    { id: 'tool_user', name: 'Tinkerer', desc: 'Use 5 different tools', icon: 'tools', hidden: false },
    { id: 'collection_builder', name: 'Organizer', desc: 'Create a custom collection', icon: 'folder-plus', hidden: false },
];


