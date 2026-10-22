// (c) Quantum Hub — proprietary hub build. All rights reserved.
/* Quantum Hub Plus — basics pack: status bar, dock/sidebar, auth fix,
   favorites, random, ratings, GOTD, streaks, i18n, lite, txt backup,
   updates, feedback, media previews, similar, ranks, forms, install,
   stats, polls, profiles, social (friends/chat/block/report). */
import toast from './toast.js?v=2026.10.21-2';
import modals from './modal.js?v=2026.10.21-2';
import { TV_CATALOG, MOVIE_CATALOG, ANIME_CATALOG, TOP_TIER } from '../data/catalog.js?v=2026.10.21-2';

import { TMDB_IDS } from '../data/tmdb-ids.js?v=2026.10.21-2';
import { openGameViewer } from './game-viewer.js?v=2026.10.21-2';

import { launchViaAboutBlank } from './about-blank-launcher.js?v=2026.10.21-2';
import { localHubApi } from '../local-api.js?v=2026.10.21-2';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const NSFW = ['porn', 'pornhub', 'xvideos', 'xhamster', 'onlyfans', 'escort', 'hentai', 'xxx',
    'nsfw', 'nude', 'naked', 'dick', 'pussy', 'boob', 'slut', 'whore', 'rape', 'molest', 'gore',
    'behead', 'dildo', 'prostitut', 'hooker', 'stripper', 'playboy', 'fetish', 'orgasm', 'masturbat'];
const cleanText = (s) => {
    const low = ` ${(s || '').toLowerCase()} `;
    return !NSFW.some((w) => low.includes(w));
};

/* Master volume: reaches every audio/video in the hub page plus
   same-origin frames (local games/viewer popups). Cross-origin frames
   can't be touched from here — popup shells carry their own slider. */
function applyMasterVolume(v) {
    document.querySelectorAll('video, audio').forEach(el => { try { el.volume = v; } catch (e) {} });
    document.querySelectorAll('iframe').forEach(fr => {
        try {
            const d = fr.contentDocument;
            if (d) d.querySelectorAll('video, audio').forEach(el => { try { el.volume = v; } catch (e) {} });
        } catch (e) {}
    });
}

/* ---------- mini i18n (fixes the stored-but-unused language setting) ----------
   Coverage: nav, dashboard headings, section chrome, common buttons, settings
   labels/options, status bar, media-source tags, core modals/toasts. Game and
   movie titles, descriptions and catalog names stay in their original language
   (titles are proper nouns). `t()` is the key lookup; static markup declares
   keys via data-i18n / data-i18n-ph attributes and applyI18n() walks them. */
const I18N = {
    en: {
        // nav + shell
        navMedia: 'Media', navMusic: 'Music', navGames: 'Games', navProxy: 'Proxy', navTools: 'Tools', navSettings: 'Settings',
        gateway: 'Secure Gateway Interface', accessMirrors: 'ACCESS MIRRORS', latency: 'LATENCY:', status: 'STATUS:',
        // dashboard headings
        mediaDeck: 'DASHBOARD // MEDIA DECK', mediaTitle: 'CURATED DIGITAL MEDIA STREAMING',
        mediaBlurb: 'Access films, audio compositions, television series summaries and custom YouTube integration inside sandboxed glass nodes.',
        musicDeck: 'DASHBOARD // MUSIC DECK', musicTitle: 'MUSIC STREAM TERMINAL',
        gameDeck: 'DASHBOARD // GAME DECK', gameTitle: 'CLOUD LAUNCHER CENTRAL',
        activeLayers: 'ACTIVE SPEC LAYERS:',
        gatewayDeck: 'DASHBOARD // GATEWAY DECK', gatewayTitle: 'SECURED DEVELOPMENT RESOURCES',
        utilityDeck: 'DASHBOARD // UTILITY DECK', utilityTitle: 'INTEGRATED WEB TERMINALS',
        settingsDeck: 'DASHBOARD // SETTINGS CONTROL', settingsTitle: 'SYSTEM PREFERENCES MANAGER',
        hubExtras: 'HUB EXTRAS',
        // section labels
        search: 'Search games by name, category, description...', searchMedia: 'Search movies, shows, anime, sources...',
        favOnly: 'Favorites Only', random: 'RANDOM', lucky: "I'M FEELING LUCKY",
        allCategories: 'All Categories', sortName: 'Sort: Name', sortCategory: 'Sort: Category',
        sortLaunches: 'Sort: Most Played', sortRecent: 'Sort: Recently Played', sortAdded: 'Sort: Recently Added',
        // core buttons
        play: 'LAUNCH GAME', launch: 'LAUNCH', launchNode: 'LAUNCH NODE', deploy: 'DEPLOY SANDBOX',
        attach: 'ATTACH LAYER', openClaude: 'OPEN CLAUDE', openAI: 'OPEN AI', goToAIHub: 'GO TO AI HUB', clear: 'CLEAR', reset: 'RESET', set: 'SET',
        save: 'SAVE', cancel: 'CANCEL', close: 'CLOSE', login: 'LOGIN', logout: 'LOG OUT', send: 'SEND',
        settings: 'Settings', online: 'online', install: 'INSTALL APP', feedback: 'FEEDBACK',
        updates: 'UPDATES', news: 'EVENTS & NEWS', txtSettings: 'SETTINGS .TXT', txtData: 'MY DATA FILE',
        txtImport: 'IMPORT .TXT', importHint: 'Paste a settings .txt to import',
        watchNow: 'WATCH NOW', whereWatch: 'WHERE TO WATCH', trailer: 'TRAILER',
        // status bar titles
        timeTitle: 'Local time', batteryTitle: 'Battery', weatherTitle: 'Weather (open-meteo)',
        onlineTitle: 'Users online', volumeTitle: 'Volume', dayMode: 'Day mode', nightMode: 'Night mode', darkLight: 'Dark / Light',
        // settings labels
        language: 'Language', animations: 'Animations', animFull: 'Full animations', animReduced: 'Reduced motion', animNone: 'No animations',
        defaultMirror: 'Default Mirror', soundPack: 'Sound Pack', wallpaper: 'Custom Wallpaper',
        animatedBg: 'Animated Background', aiAssistant: 'AI Assistant', aiEnabled: 'Enabled (Local)', aiDisabled: 'Disabled',
        aiPersonality: 'AI Personality', autoHide: 'Auto-Hide Dock', compactMode: 'Compact Mode', showFps: 'Show FPS Counter',
        cloakPreset: 'Tab Cloak Preset', customTitle: 'Custom Tab Title', customFavicon: 'Custom Favicon URL',
        launcherTarget: 'Launcher Shell Default Target', newTab: 'Discrete Browser Thread Window (New Tab)',
        liteMode: 'Lite mode (strip animations & effects)', autoTheme: 'Auto theme by time', off: 'Off', byTime: 'By time',
        dockPos: 'Dock position', sidePos: 'Sidebar side', bottom: 'Bottom', left: 'Left', right: 'Right',
        unlocked: 'Unlocked (drag)', noneOpt: 'None',
        // media source tags
        tagFree: 'FREE', tagDiscover: 'DISCOVER', tagAnime: 'ANIME', tagWhere: 'WHERE TO WATCH',
        tagFreeVideo: 'FREE VIDEO', tagLibrary: 'LIBRARY', tagLive: 'FREE LIVE', tagDocs: 'DOCS',
        // modal / viewer copy
        watchBlurb: 'WATCH NOW streams the title in the hub viewer where available. Trailers and the hub\'s free films play right here. Where-to-watch opens in a cloaked tab (JustWatch refuses to be embedded).',
        noStream: 'No stream source for this title yet.',
        noHosts: 'No stream host verified on this network — the filter may be hijacking them. Trying anyway.',
        guestChip: 'Guest', guestHint: 'Local guest mode — actions are limited until you log in.',
        epgTitle: 'Season', epgEp: 'Episode', langApplied: 'Language applied.',
    },
    es: {
        navMedia: 'Medios', navMusic: 'Música', navGames: 'Juegos', navProxy: 'Proxy', navTools: 'Herramientas', navSettings: 'Ajustes',
        gateway: 'Interfaz de puerta segura', accessMirrors: 'ACCESO A MIRRORES', latency: 'LATENCIA:', status: 'ESTADO:',
        mediaDeck: 'PANEL // DECK DE MEDIOS', mediaTitle: 'STREAMING DE MEDIOS DIGITALES CURADOS',
        mediaBlurb: 'Accede a películas, música, resúmenes de series e integración de YouTube dentro de nodos de cristal protegidos.',
        musicDeck: 'PANEL // DECK DE MÚSICA', musicTitle: 'TERMINAL DE MÚSICA',
        gameDeck: 'PANEL // DECK DE JUEGOS', gameTitle: 'CENTRO DE LANZAMIENTO EN LA NUBE',
        activeLayers: 'CAPAS ACTIVAS:',
        gatewayDeck: 'PANEL // PUERTA', gatewayTitle: 'RECURSOS DE DESARROLLO PROTEGIDOS',
        utilityDeck: 'PANEL // UTILIDADES', utilityTitle: 'TERMINALES WEB INTEGRADOS',
        settingsDeck: 'PANEL // AJUSTES', settingsTitle: 'GESTOR DE PREFERENCIAS DEL SISTEMA',
        hubExtras: 'EXTRAS DEL HUB',
        search: 'Buscar juegos por nombre, categoría, descripción...', searchMedia: 'Buscar películas, series, anime, fuentes...',
        favOnly: 'Solo favoritos', random: 'ALEATORIO', lucky: 'VOY A TENER SUERTE',
        allCategories: 'Todas las categorías', sortName: 'Orden: Nombre', sortCategory: 'Orden: Categoría',
        sortLaunches: 'Orden: Más jugados', sortRecent: 'Orden: Recientes', sortAdded: 'Orden: Añadidos',
        play: 'JUGAR', launch: 'ABRIR', launchNode: 'LANZAR NODO', deploy: 'DESPLEGAR SANDBOX',
        attach: 'CONECTAR CAPA', openClaude: 'ABRIR CLAUDE', openAI: 'ABRIR IA', goToAIHub: 'IR A AI HUB', clear: 'LIMPIAR', reset: 'RESTABLECER', set: 'ESTABLECER',
        save: 'GUARDAR', cancel: 'CANCELAR', close: 'CERRAR', login: 'ENTRAR', logout: 'SALIR', send: 'ENVIAR',
        settings: 'Ajustes', online: 'en línea', install: 'INSTALAR APP', feedback: 'COMENTARIOS',
        updates: 'ACTUALIZACIONES', news: 'NOTICIAS Y EVENTOS', txtSettings: 'AJUSTES .TXT', txtData: 'MI ARCHIVO DE DATOS',
        txtImport: 'IMPORTAR .TXT', importHint: 'Pega un archivo .txt de ajustes para importar',
        watchNow: 'VER AHORA', whereWatch: 'DÓNDE VER', trailer: 'TRÁILER',
        timeTitle: 'Hora local', batteryTitle: 'Batería', weatherTitle: 'Clima (open-meteo)',
        onlineTitle: 'Usuarios en línea', volumeTitle: 'Volumen', dayMode: 'Modo día', nightMode: 'Modo noche', darkLight: 'Oscuro / Claro',
        language: 'Idioma', animations: 'Animaciones', animFull: 'Animaciones completas', animReduced: 'Movimiento reducido', animNone: 'Sin animaciones',
        defaultMirror: 'Mirror predeterminado', soundPack: 'Paquete de sonido', wallpaper: 'Fondo personalizado',
        animatedBg: 'Fondo animado', aiAssistant: 'Asistente IA', aiEnabled: 'Activado (local)', aiDisabled: 'Desactivado',
        aiPersonality: 'Personalidad IA', autoHide: 'Ocultar dock', compactMode: 'Modo compacto', showFps: 'Mostrar contador FPS',
        cloakPreset: 'Plantilla de camuflaje de pestaña', customTitle: 'Título personalizado de pestaña', customFavicon: 'URL de favicon personalizada',
        launcherTarget: 'Destino predeterminado del lanzador', newTab: 'Ventana discreta (nueva pestaña)',
        liteMode: 'Modo ligero (quitar animaciones y efectos)', autoTheme: 'Tema automático por hora', off: 'Apagado', byTime: 'Por hora',
        dockPos: 'Posición del dock', sidePos: 'Lado de la barra lateral', bottom: 'Abajo', left: 'Izquierda', right: 'Derecha',
        unlocked: 'Desbloqueado (arrastrar)', noneOpt: 'Ninguno',
        tagFree: 'GRATIS', tagDiscover: 'DESCUBRIR', tagAnime: 'ANIME', tagWhere: 'DÓNDE VER',
        tagFreeVideo: 'VÍDEO GRATIS', tagLibrary: 'BIBLIOTECA', tagLive: 'TV GRATIS', tagDocs: 'DOCS',
        watchBlurb: 'VER AHORA reproduce el título en el visor del hub cuando está disponible. Los tráilers y las películas gratis se ven aquí. DÓNDE VER abre en una pestaña oculta (JustWatch no permite incrustarse).',
        noStream: 'Todavía no hay fuente de streaming para este título.',
        noHosts: 'Ningún host verificado en esta red — el filtro puede estar secuestrándolos. Intentándolo de todos modos.',
        guestChip: 'Invitado', guestHint: 'Modo invitado local — las acciones son limitadas hasta que inicies sesión.',
        epgTitle: 'Temporada', epgEp: 'Episodio', langApplied: 'Idioma aplicado.',
    },
    fr: {
        navMedia: 'Médias', navMusic: 'Musique', navGames: 'Jeux', navProxy: 'Proxy', navTools: 'Outils', navSettings: 'Réglages',
        gateway: 'Interface passerelle sécurisée', accessMirrors: 'ACCÈS AUX MIROIRS', latency: 'LATENCE :', status: 'STATUT :',
        mediaDeck: 'TABLEAU // DECK MÉDIAS', mediaTitle: 'STREAMING DE MÉDIAS NUMÉRIQUES CURATÉS',
        mediaBlurb: 'Accédez à des films, musiques, séries et à l\'intégration YouTube dans des nœuds de verre sécurisés.',
        musicDeck: 'TABLEAU // DECK MUSIQUE', musicTitle: 'TERMINAL DE MUSIQUE',
        gameDeck: 'TABLEAU // DECK JEUX', gameTitle: 'CENTRE DE LANCEMENT CLOUD',
        activeLayers: 'COUCHES ACTIVES :',
        gatewayDeck: 'TABLEAU // PASSERELLE', gatewayTitle: 'RESSOURCES DE DÉVELOPPEMENT SÉCURISÉES',
        utilityDeck: 'TABLEAU // UTILITAIRES', utilityTitle: 'TERMINAUX WEB INTÉGRÉS',
        settingsDeck: 'TABLEAU // RÉGLAGES', settingsTitle: 'GESTIONNAIRE DE PRÉFÉRENCES SYSTÈME',
        hubExtras: 'EXTRAS DU HUB',
        search: 'Rechercher par nom, catégorie, description...', searchMedia: 'Rechercher films, séries, anime, sources...',
        favOnly: 'Favoris uniquement', random: 'ALÉATOIRE', lucky: "J'AI DE LA CHANCE",
        allCategories: 'Toutes les catégories', sortName: 'Trier : Nom', sortCategory: 'Trier : Catégorie',
        sortLaunches: 'Trier : Plus joués', sortRecent: 'Trier : Récents', sortAdded: 'Trier : Ajoutés',
        play: 'JOUER', launch: 'LANCER', launchNode: 'LANCER LE NŒUD', deploy: 'DÉPLOYER LE SANDBOX',
        attach: 'ATTACHER LA COUCHE', openClaude: 'OUVRIR CLAUDE', openAI: 'OUVRIR L\'IA', goToAIHub: 'ALLER À AI HUB', clear: 'EFFACER', reset: 'RÉINITIALISER', set: 'DÉFINIR',
        save: 'ENREGISTRER', cancel: 'ANNULER', close: 'FERMER', login: 'CONNEXION', logout: 'DÉCONNEXION', send: 'ENVOYER',
        settings: 'Paramètres', online: 'en ligne', install: "INSTALLER L'APP", feedback: 'COMMENTAIRES',
        updates: 'MISES À JOUR', news: 'ACTUALITÉS', txtSettings: 'RÉGLAGES .TXT', txtData: 'MES DONNÉES',
        txtImport: 'IMPORTER .TXT', importHint: 'Collez un fichier .txt de réglages à importer',
        watchNow: 'REGARDER', whereWatch: 'OÙ REGARDER', trailer: 'BANDE-ANNONCE',
        timeTitle: 'Heure locale', batteryTitle: 'Batterie', weatherTitle: 'Météo (open-meteo)',
        onlineTitle: 'Utilisateurs en ligne', volumeTitle: 'Volume', dayMode: 'Mode jour', nightMode: 'Mode nuit', darkLight: 'Sombre / Clair',
        language: 'Langue', animations: 'Animations', animFull: 'Animations complètes', animReduced: 'Mouvement réduit', animNone: 'Sans animations',
        defaultMirror: 'Miroir par défaut', soundPack: 'Pack sonore', wallpaper: 'Fond personnalisé',
        animatedBg: 'Fond animé', aiAssistant: 'Assistant IA', aiEnabled: 'Activé (local)', aiDisabled: 'Désactivé',
        aiPersonality: 'Personnalité IA', autoHide: 'Masquer la dock', compactMode: 'Mode compact', showFps: 'Afficher le compteur FPS',
        cloakPreset: 'Préréglage de camouflage d\'onglet', customTitle: "Titre d'onglet personnalisé", customFavicon: 'URL de favicon personnalisée',
        launcherTarget: 'Cible par défaut du lanceur', newTab: 'Fenêtre discrète (nouvel onglet)',
        liteMode: 'Mode léger (sans animations ni effets)', autoTheme: 'Thème automatique selon l\'heure', off: 'Désactivé', byTime: "Par heure",
        dockPos: 'Position de la dock', sidePos: 'Côté de la barre latérale', bottom: 'Bas', left: 'Gauche', right: 'Droite',
        unlocked: 'Déverrouillé (glisser)', noneOpt: 'Aucun',
        tagFree: 'GRATUIT', tagDiscover: 'DÉCOUVRIR', tagAnime: 'ANIME', tagWhere: 'OÙ REGARDER',
        tagFreeVideo: 'VIDÉO GRATUITE', tagLibrary: 'BIBLIOTHÈQUE', tagLive: 'TV GRATUITE', tagDocs: 'DOCS',
        watchBlurb: 'REGARDER diffuse le titre dans la visionneuse du hub quand c\'est possible. Bandes-annonces et films gratuits se voient ici. OÙ REGARDER s\'ouvre dans un onglet masqué (JustWatch refuse l\'intégration).',
        noStream: 'Pas encore de source de streaming pour ce titre.',
        noHosts: 'Aucun hôte vérifié sur ce réseau — le filtre les détournent peut-être. On essaie quand même.',
        guestChip: 'Invité', guestHint: 'Mode invité local — actions limitées tant que vous n\'êtes pas connecté.',
        epgTitle: 'Saison', epgEp: 'Épisode', langApplied: 'Langue appliquée.',
    },
    de: {
        navMedia: 'Medien', navMusic: 'Musik', navGames: 'Spiele', navProxy: 'Proxy', navTools: 'Werkzeuge', navSettings: 'Einstellungen',
        gateway: 'Sicheres Gateway-Interface', accessMirrors: 'MIRROR ZUGANG', latency: 'LATENZ:', status: 'STATUS:',
        mediaDeck: 'DASHBOARD // MEDIEN-DECK', mediaTitle: 'KURATIERTES DIGITALES MEDIEN-STREAMING',
        mediaBlurb: 'Filme, Musik, Serien-Zusammenfassungen und YouTube-Integration in geschützten Glas-Knoten.',
        musicDeck: 'DASHBOARD // MUSIK-DECK', musicTitle: 'MUSIK-STREAM-TERMINAL',
        gameDeck: 'DASHBOARD // SPIEL-DECK', gameTitle: 'CLOUD-LAUNCHER-ZENTRALE',
        activeLayers: 'AKTIVE SPEZ-EBENEN:',
        gatewayDeck: 'DASHBOARD // GATEWAY', gatewayTitle: 'GESICHERTE ENTWICKLUNGSRESSOURCEN',
        utilityDeck: 'DASHBOARD // WERKZEUGE', utilityTitle: 'INTEGRIERTE WEB-TERMINALS',
        settingsDeck: 'DASHBOARD // EINSTELLUNGEN', settingsTitle: 'SYSTEMEINSTELLUNGEN-MANAGER',
        hubExtras: 'HUB-EXTRAS',
        search: 'Spiele nach Name, Kategorie, Beschreibung suchen...', searchMedia: 'Filme, Serien, Anime, Quellen suchen...',
        favOnly: 'Nur Favoriten', random: 'ZUFÄLLIG', lucky: 'ICH HAB GLÜCK',
        allCategories: 'Alle Kategorien', sortName: 'Sortieren: Name', sortCategory: 'Sortieren: Kategorie',
        sortLaunches: 'Sortieren: Meistgespielt', sortRecent: 'Sortieren: Zuletzt gespielt', sortAdded: 'Sortieren: Zuletzt hinzugefügt',
        play: 'SPIELEN', launch: 'STARTEN', launchNode: 'KNOTEN STARTEN', deploy: 'SANDBOX DEPLOYN',
        attach: 'EBENE ANBINDEN', openClaude: 'CLAUDE ÖFFNEN', openAI: 'KI ÖFFNEN', goToAIHub: 'ZUM AI HUB', clear: 'LEEREN', reset: 'ZURÜCKSETZEN', set: 'FESTLEGEN',
        save: 'SPEICHERN', cancel: 'ABBRECHEN', close: 'SCHLIESSEN', login: 'ANMELDEN', logout: 'ABMELDEN', send: 'SENDEN',
        settings: 'Einstellungen', online: 'online', install: 'APP INSTALLIEREN', feedback: 'FEEDBACK',
        updates: 'AKTUALISIERUNGEN', news: 'NEWS & EVENTS', txtSettings: 'EINSTELLUNGEN .TXT', txtData: 'MEINE DATEN',
        txtImport: '.TXT IMPORTIEREN', importHint: 'Einstellungs-.txt zum Importieren einfügen',
        watchNow: 'JETZT ANSEHEN', whereWatch: 'WO ANSEHEN', trailer: 'TRAILER',
        timeTitle: 'Ortszeit', batteryTitle: 'Akku', weatherTitle: 'Wetter (open-meteo)',
        onlineTitle: 'Nutzer online', volumeTitle: 'Lautstärke', dayMode: 'Tagmodus', nightMode: 'Nachtmodus', darkLight: 'Dunkel / Hell',
        language: 'Sprache', animations: 'Animationen', animFull: 'Volle Animationen', animReduced: 'Reduzierte Bewegung', animNone: 'Keine Animationen',
        defaultMirror: 'Standard-Mirror', soundPack: 'Soundpaket', wallpaper: 'Eigenes Wallpaper',
        animatedBg: 'Animierter Hintergrund', aiAssistant: 'KI-Assistent', aiEnabled: 'Aktiviert (lokal)', aiDisabled: 'Deaktiviert',
        aiPersonality: 'KI-Persönlichkeit', autoHide: 'Dock automatisch ausblenden', compactMode: 'Kompaktmodus', showFps: 'FPS-Zähler anzeigen',
        cloakPreset: 'Tab-Tarnung-Vorlage', customTitle: 'Eigener Tab-Titel', customFavicon: 'Eigene Favicon-URL',
        launcherTarget: 'Standard-Ziel des Launchers', newTab: 'Diskretes Fenster (neuer Tab)',
        liteMode: 'Leichtmodus (Animationen & Effekte aus)', autoTheme: 'Auto-Theme nach Uhrzeit', off: 'Aus', byTime: 'Nach Uhrzeit',
        dockPos: 'Dock-Position', sidePos: 'Seitenleisten-Seite', bottom: 'Unten', left: 'Links', right: 'Rechts',
        unlocked: 'Frei (ziehen)', noneOpt: 'Keins',
        tagFree: 'GRATIS', tagDiscover: 'ENTDECKEN', tagAnime: 'ANIME', tagWhere: 'WO ANSEHEN',
        tagFreeVideo: 'KOSTENLOS', tagLibrary: 'BIBLIOTHEK', tagLive: 'FREES TV', tagDocs: 'DOCS',
        watchBlurb: 'JETZT ANSEHEN streamt den Titel im Hub-Viewer, wo verfügbar. Trailer und Gratis-Filme laufen hier. WO ANSEHEN öffnet in einem getarnten Tab (JustWatch verbietet Einbettung).',
        noStream: 'Noch keine Streaming-Quelle für diesen Titel.',
        noHosts: 'Kein Host in diesem Netzwerk verifiziert — der Filter leitet sie womöglich um. Versuchen wir es trotzdem.',
        guestChip: 'Gast', guestHint: 'Lokaler Gastmodus — Aktionen beschränkt bis zur Anmeldung.',
        epgTitle: 'Staffel', epgEp: 'Folge', langApplied: 'Sprache übernommen.',
    },
    ja: {
        navMedia: 'メディア', navMusic: 'ミュージック', navGames: 'ゲーム', navProxy: 'プロキシ', navTools: 'ツール', navSettings: '設定',
        gateway: 'セキュアゲートウェイ・インターフェース', accessMirrors: 'ミラーにアクセス', latency: 'レイテンシ：', status: 'ステータス：',
        mediaDeck: 'ダッシュボード // メディアデッキ', mediaTitle: 'キュレーション・デジタルメディアストリーミング',
        mediaBlurb: 'サンドボックス化されたグラスノード内で、映画・音楽・テレビシリーズ要約・YouTube連携にアクセスできます。',
        musicDeck: 'ダッシュボード // ミュージックデッキ', musicTitle: 'ミュージックストリーム端末',
        gameDeck: 'ダッシュボード // ゲームデッキ', gameTitle: 'クラウドラウンチャー・センター',
        activeLayers: 'アクティブ仕様レイヤー：',
        gatewayDeck: 'ダッシュボード // ゲートウェイ', gatewayTitle: '保護された開発リソース',
        utilityDeck: 'ダッシュボード // ユーティリティ', utilityTitle: '統合Webターミナル',
        settingsDeck: 'ダッシュボード // 設定', settingsTitle: 'システム設定マネージャー',
        hubExtras: 'ハブ追加機能',
        search: '名前・カテゴリ・説明でゲームを検索...', searchMedia: '映画・番組・アニメ・ソースを検索...',
        favOnly: 'お気に入りのみ', random: 'ランダム', lucky: 'ラッキーだ！',
        allCategories: 'すべてのカテゴリ', sortName: '並べ替え：名前', sortCategory: '並べ替え：カテゴリ',
        sortLaunches: '並べ替え：よく遊ばれる', sortRecent: '並べ替え：最近プレイ', sortAdded: '並べ替え：最近追加',
        play: 'ゲームを起動', launch: '起動', launchNode: 'ノード起動', deploy: 'サンドボックス展開',
        attach: 'レイヤー接続', openClaude: 'Claudeを開く', openAI: 'AIを開く', goToAIHub: 'AIハブへ', clear: 'クリア', reset: 'リセット', set: '設定',
        save: '保存', cancel: 'キャンセル', close: '閉じる', login: 'ログイン', logout: 'ログアウト', send: '送信',
        settings: '設定', online: 'オンライン', install: 'アプリをインストール', feedback: 'フィードバック',
        updates: 'アップデート', news: 'イベント＆ニュース', txtSettings: '設定 .TXT', txtData: 'マイデータファイル',
        txtImport: '.TXT をインポート', importHint: 'インポートする設定 .TXT を貼り付け',
        watchNow: '今すぐ見る', whereWatch: '視聴先', trailer: '予告編',
        timeTitle: 'ローカル時間', batteryTitle: 'バッテリー', weatherTitle: '天気 (open-meteo)',
        onlineTitle: 'オンラインユーザー', volumeTitle: '音量', dayMode: '昼モード', nightMode: '夜モード', darkLight: 'ダーク / ライト',
        language: '言語', animations: 'アニメーション', animFull: 'フルアニメーション', animReduced: 'モーション削減', animNone: 'アニメーションなし',
        defaultMirror: 'デフォルトミラー', soundPack: 'サウンドパック', wallpaper: 'カスタム壁紙',
        animatedBg: 'アニメーション背景', aiAssistant: 'AIアシスタント', aiEnabled: '有効（ローカル）', aiDisabled: '無効',
        aiPersonality: 'AIパーソナリティ', autoHide: 'ドックを自動非表示', compactMode: 'コンパクトモード', showFps: 'FPSカウンター表示',
        cloakPreset: 'タブ偽装プリセット', customTitle: 'カスタムタブタイトル', customFavicon: 'カスタムファビコンURL',
        launcherTarget: 'ランチャーのデフォルト起動先', newTab: 'ディスクリートウィンドウ（新しいタブ）',
        liteMode: 'ライトモード（アニメーションと演出を削減）', autoTheme: '時刻による自動テーマ', off: 'オフ', byTime: '時刻ベース',
        dockPos: 'ドックの位置', sidePos: 'サイドバーの位置', bottom: '下', left: '左', right: '右',
        unlocked: 'ロック解除（ドラッグ）', noneOpt: 'なし',
        tagFree: '無料', tagDiscover: 'ディスカバー', tagAnime: 'アニメ', tagWhere: '視聴先',
        tagFreeVideo: '無料動画', tagLibrary: 'ライブラリ', tagLive: '無料TV', tagDocs: 'ドキュメンタリー',
        watchBlurb: '「今すぐ見る」は対応タイトルをハブビューアでストリーミングします。予告編と無料映画はここで再生。視聴先はカモフラージュタブで開きます（JustWatchは埋め込み拒否）。',
        noStream: 'このタイトルのストリームソースはまだありません。',
        noHosts: 'このネットワークで生存確認されたストリームホストなし — フィルターが傍受している可能性。それでも試します。',
        guestChip: 'ゲスト', guestHint: 'ローカルゲストモード — ログインするまで一部の操作は制限されます。',
        epgTitle: 'シーズン', epgEp: 'エピソード', langApplied: '言語を適用しました。',
    },
    zh: {
        navMedia: '媒体', navMusic: '音乐', navGames: '游戏', navProxy: '代理', navTools: '工具', navSettings: '设置',
        gateway: '安全网关界面', accessMirrors: '访问镜像', latency: '延迟：', status: '状态：',
        mediaDeck: '仪表板 // 媒体台', mediaTitle: '精选数字媒体串流',
        mediaBlurb: '在沙盒玻璃节点中访问电影、音乐、剧集摘要和自定义 YouTube 集成。',
        musicDeck: '仪表板 // 音乐台', musicTitle: '音乐串流终端',
        gameDeck: '仪表板 // 游戏台', gameTitle: '云端启动中心',
        activeLayers: '活动规格层：',
        gatewayDeck: '仪表板 // 网关', gatewayTitle: '安全开发资源',
        utilityDeck: '仪表板 // 工具', utilityTitle: '集成网络终端',
        settingsDeck: '仪表板 // 设置', settingsTitle: '系统偏好管理器',
        hubExtras: '中心扩展',
        search: '按名称、类别、描述搜索游戏...', searchMedia: '搜索电影、剧集、动漫、来源...',
        favOnly: '仅收藏', random: '随机', lucky: '手气不错',
        allCategories: '所有类别', sortName: '排序：名称', sortCategory: '排序：类别',
        sortLaunches: '排序：最常玩', sortRecent: '排序：最近玩过', sortAdded: '排序：最近添加',
        play: '启动游戏', launch: '启动', launchNode: '启动节点', deploy: '部署沙盒',
        attach: '连接层', openClaude: '打开 Claude', openAI: '打开 AI', goToAIHub: '前往 AI 枢纽', clear: '清除', reset: '重置', set: '设置',
        save: '保存', cancel: '取消', close: '关闭', login: '登录', logout: '退出登录', send: '发送',
        settings: '设置', online: '在线', install: '安装应用', feedback: '反馈',
        updates: '更新', news: '活动与新闻', txtSettings: '设置 .TXT', txtData: '我的数据文件',
        txtImport: '导入 .TXT', importHint: '粘贴要导入的设置 .txt',
        watchNow: '立即观看', whereWatch: '观看渠道', trailer: '预告片',
        timeTitle: '本地时间', batteryTitle: '电池', weatherTitle: '天气 (open-meteo)',
        onlineTitle: '在线用户', volumeTitle: '音量', dayMode: '日间模式', nightMode: '夜间模式', darkLight: '深色 / 浅色',
        language: '语言', animations: '动画', animFull: '完整动画', animReduced: '减弱动效', animNone: '无动画',
        defaultMirror: '默认镜像', soundPack: '音效包', wallpaper: '自定义壁纸',
        animatedBg: '动态背景', aiAssistant: 'AI 助手', aiEnabled: '启用（本地）', aiDisabled: '禁用',
        aiPersonality: 'AI 性格', autoHide: '自动隐藏底栏', compactMode: '紧凑模式', showFps: '显示 FPS 计数',
        cloakPreset: '标签伪装预设', customTitle: '自定义标签标题', customFavicon: '自定义网站图标 URL',
        launcherTarget: '启动器默认目标', newTab: '独立窗口（新标签页）',
        liteMode: '轻量模式（去除动画与特效）', autoTheme: '按时间自动主题', off: '关', byTime: '按时间',
        dockPos: '底栏位置', sidePos: '侧栏位置', bottom: '底部', left: '左侧', right: '右侧',
        unlocked: '解锁（拖动）', noneOpt: '无',
        tagFree: '免费', tagDiscover: '发现', tagAnime: '动漫', tagWhere: '观看渠道',
        tagFreeVideo: '免费视频', tagLibrary: '图书馆', tagLive: '免费电视', tagDocs: '纪录片',
        watchBlurb: '“立即观看”会在中心播放器中串流该标题（如可用）。预告片和免费电影就在此处播放。“观看渠道”以伪装标签页打开（JustWatch 禁止嵌入）。',
        noStream: '该标题暂无串流来源。',
        noHosts: '此网络未验证到任何串流主机 — 过滤器可能正在劫持。仍尝试打开。',
        guestChip: '访客', guestHint: '本地访客模式 — 登录前操作受限。',
        epgTitle: '季', epgEp: '集', langApplied: '语言已应用。',
    },
};
const t = (app, key) => {
    const lang = (app.settings.language || 'en').slice(0, 2);
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
};
function applyI18n(app) {
    const lang = (app.settings.language || 'en').slice(0, 2);
    try { document.documentElement.lang = lang; } catch (e) {}
    // Static markup declared with data-i18n / data-i18n-ph.
    $$('[data-i18n]').forEach((el) => { el.textContent = t(app, el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(app, el.getAttribute('data-i18n-ph'))); });
    // Legacy direct mappings.
    const si = $('#game-search-input'); if (si) si.placeholder = t(app, 'search');
    const favLabel = $('#game-favorites-only')?.closest('label'); if (favLabel) {
        const txt = favLabel.childNodes[favLabel.childNodes.length - 1];
        if (txt && txt.nodeType === 3) txt.textContent = ` ${t(app, 'favOnly')}`;
    }
    const rb = $('#q-random-btn'); if (rb) rb.innerHTML = `<i class="fas fa-dice"></i> ${t(app, 'random')}`;
    const lb = $('#q-lucky-btn'); if (lb) lb.innerHTML = `<i class="fas fa-clover"></i> ${t(app, 'lucky')}`;
    // Sync both language pickers (settings panel + hub extras).
    const syncSel = (sel, v) => { const el = $(sel); if (el && el.value !== v) el.value = v; };
    syncSel('#setting-language', lang);
    syncSel('#q-lang', lang);
    // Dynamic surfaces re-render through registered refreshers.
    try { (window.__i18nRefresh || []).forEach((fn) => { try { fn(app); } catch (e) {} }); } catch (e) {}
}

/* ---------- api helper (device-local social backend, graceful offline) ---------- */
async function api(app, endpoint, body) {
    const token = app._authToken || store.get('hub_token', null);
    return localHubApi(endpoint, { token, ...(body || {}) });
}

/* ---------- status bar: clock, battery, weather, online, volume, day/night ---------- */
function buildStatusBar(app) {
    const bar = $('header .flex.items-center.gap-4');
    if (!bar || $('#q-status-extra')) return;
    const wrap = document.createElement('div');
    wrap.id = 'q-status-extra';
    wrap.className = 'flex items-center gap-4 text-xs font-mono';
    wrap.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full" title="Local time">
            <i class="fas fa-clock text-accent"></i><span id="q-clock" class="text-white">--:--</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full" title="Battery">
            <i class="fas fa-battery-half text-accent"></i><span id="q-battery" class="text-white">--%</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full" title="Weather (open-meteo)">
            <i class="fas fa-cloud-sun text-accent"></i><span id="q-weather" class="text-white">--°</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full" title="Users online">
            <span class="w-2 h-2 rounded-full bg-green-400"></span><span id="q-online" class="text-white">1</span><span class="text-gray-500">online</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-full" title="Volume">
            <i class="fas fa-volume-up text-accent"></i>
            <input id="q-volume" type="range" min="0" max="100" value="${Math.round((app.settings.volume ?? 0.8) * 100)}" class="w-20 accent-current" style="color:var(--accent)">
        </div>
        <div class="flex items-center gap-1">
            <button id="q-day-btn" class="btn-outline text-xs px-2 py-1" title="Day mode"><i class="fas fa-sun"></i></button>
            <button id="q-night-btn" class="btn-outline text-xs px-2 py-1" title="Night mode"><i class="fas fa-moon"></i></button>
            <button id="q-theme-toggle" class="btn-outline text-xs px-2 py-1" title="Dark / Light"><i class="fas fa-circle-half-stroke"></i></button>
        </div>`;
    bar.appendChild(wrap);
    const tickClock = () => {
        const d = new Date();
        const el = $('#q-clock');
        if (el) el.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    tickClock(); setInterval(tickClock, 15000);
    if (navigator.getBattery) {
        navigator.getBattery().then((b) => {
            const upd = () => { const el = $('#q-battery'); if (el) el.textContent = `${Math.round(b.level * 100)}%${b.charging ? '+' : ''}`; };
            upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
        }).catch(() => {});
    }
    const loadWeather = async (lat, lon) => {
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=celsius`);
            const j = await r.json();
            const el = $('#q-weather');
            if (el && j.current) el.textContent = `${Math.round(j.current.temperature_2m)}°C`;
        } catch (e) {}
    };
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (p) => loadWeather(p.coords.latitude.toFixed(2), p.coords.longitude.toFixed(2)),
            () => loadWeather(40.71, -74.0), { timeout: 8000 });
    } else loadWeather(40.71, -74.0);
    const vol = $('#q-volume');
    if (vol) vol.addEventListener('input', () => {
        app.settings.volume = vol.value / 100;
        app.saveSettings();
        if (app.synthAudioCtx && app._masterGain) {
            try { app._masterGain.gain.value = 0.02 * (app.settings.volume ?? 0.8); } catch (e) {}
        }
        const mv = $('#q-media-volume');
        if (mv) { mv.value = vol.value; const lbl = $('#q-media-volume-val'); if (lbl) lbl.textContent = vol.value + '%'; }
        applyMasterVolume(app.settings.volume);
    });
    const setThemePair = (mode) => {
        app.settings.dayNight = mode;
        app.settings.theme = mode === 'day' ? 'ice' : 'obsidian';
        app.saveSettings(); app.applyTheme();
        toast.show(mode === 'day' ? 'Day mode.' : 'Night mode.', 'success');
    };
    $('#q-day-btn')?.addEventListener('click', () => setThemePair('day'));
    $('#q-night-btn')?.addEventListener('click', () => setThemePair('night'));
    $('#q-theme-toggle')?.addEventListener('click', () => {
        const dark = ['obsidian', 'deepspace', 'cyberpunk', 'amethyst', 'cassian', 'forest', 'hacker', 'ocean', 'lava', 'rose', 'crimson', 'gold'];
        setThemePair(dark.includes(app.settings.theme) ? 'day' : 'night');
    });
}

function autoThemeTick(app) {
    if (app.settings.autoTheme !== 'time') return;
    const h = new Date().getHours();
    const want = (h >= 7 && h < 19) ? 'ice' : 'obsidian';
    if (app.settings.theme !== want && !store.get('q_theme_manual', false)) {
        app.settings.theme = want; app.saveSettings(); app.applyTheme();
    }
}

/* ---------- dock / sidebar position + unlock (position saved in a cookie) ---------- */
function dockCookieGet() {
    try {
        const m = document.cookie.match(/(?:^|;\s*)hub_dock=([^;]*)/);
        return m ? JSON.parse(decodeURIComponent(m[1])) : null;
    } catch (e) { return null; }
}
function dockCookieSet(state) {
    try {
        document.cookie = `hub_dock=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {}
}
function dockCookieSave(app, extra) {
    const dock = $('.bottom-dock');
    const r = dock ? dock.getBoundingClientRect() : null;
    dockCookieSet({
        pos: app.settings.dockPosition || 'bottom',
        side: app.settings.sidebarSide || 'left',
        x: (extra && extra.x != null) ? extra.x : (r ? Math.round(r.left) : null),
        y: (extra && extra.y != null) ? extra.y : (r ? Math.round(r.top) : null),
        at: Date.now(),
    });
}
function applyDockPosition(app) {
    const dock = $('.bottom-dock');
    if (!dock) return;
    // Cookie holds the freshest user change; settings are the fallback.
    const saved = dockCookieGet();
    let pos = app.settings.dockPosition || 'bottom';
    if (saved && saved.pos) {
        pos = saved.pos;
        app.settings.dockPosition = pos;
        if (saved.side) app.settings.sidebarSide = saved.side;
    }
    dock.classList.toggle('dock-left', pos === 'left');
    dock.classList.toggle('dock-right', pos === 'right');
    dock.classList.toggle('dock-free', pos === 'free');
    if (pos === 'free' && saved && saved.x != null && saved.y != null) {
        dock.style.left = `${saved.x}px`; dock.style.top = `${saved.y}px`;
        dock.style.bottom = 'auto'; dock.style.transform = 'none';
    } else {
        // docked modes always launch perfectly centered via CSS
        dock.style.left = ''; dock.style.top = ''; dock.style.bottom = ''; dock.style.transform = '';
    }
    const side = $('.tool-sidebar');
    if (side) {
        side.classList.toggle('sidebar-right', (app.settings.sidebarSide || 'left') === 'right');
    }
}
function makeDockDraggable() {
    const dock = $('.bottom-dock');
    if (!dock || dock.dataset.qdrag) return;
    dock.dataset.qdrag = '1';
    let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
    dock.addEventListener('pointerdown', (e) => {
        if ((window.app?.settings.dockPosition) !== 'free') return;
        if (e.target.closest('button')) return;
        drag = true; sx = e.clientX; sy = e.clientY;
        const r = dock.getBoundingClientRect(); ox = r.left; oy = r.top;
        dock.style.left = `${ox}px`; dock.style.top = `${oy}px`;
        dock.style.bottom = 'auto'; dock.style.transform = 'none';
    });
    window.addEventListener('pointermove', (e) => {
        if (!drag) return;
        dock.style.left = `${ox + e.clientX - sx}px`; dock.style.top = `${oy + e.clientY - sy}px`;
    });
    window.addEventListener('pointerup', () => {
        if (!drag) return;
        drag = false;
        const r = dock.getBoundingClientRect();
        dockCookieSave(window.app || {}, { x: Math.round(r.left), y: Math.round(r.top) });
    });
}

/* ---------- favorites (hover heart) + real fav filter ---------- */
function favsGet() { return new Set(store.get('hub_favorites', [])); }
function favsSet(s) { store.set('hub_favorites', Array.from(s)); }
const UNNAMED_ART = 'games/img/rayquaza-quantum.jpg';
const needsArt = (g) => !g || !String(g.name || '').trim() || !g.image;
function enhanceGameCards(app) {
    $$('.game-card').forEach((card, i) => {
        // staggered silky entrance (skipped automatically under lite/perf mode)
        card.style.setProperty('--q-d', `${(i % 24) * 28}ms`);
        // games with no picture get the Rayquaza art
        const g = app.games.find((x) => x.id === card.dataset.id);
        if (g && needsArt(g)) {
            const art = card.querySelector('.game-card-art');
            if (art && !art.style.backgroundImage.includes('rayquaza-quantum')) {
                art.style.backgroundImage = `url('${UNNAMED_ART}')`;
            }
        }
        if (card.querySelector('.fav-heart')) return;
        const id = card.dataset.id;
        if (!id) return;
        const b = document.createElement('button');
        const paint = () => {
            const on = favsGet().has(id);
            b.innerHTML = `<i class="${on ? 'fas' : 'far'} fa-heart"></i>`;
            b.classList.toggle('on', on);
        };
        b.className = 'fav-heart'; b.title = 'Favorite';
        paint();
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            const s = favsGet();
            if (s.has(id)) { s.delete(id); toast.show('Removed from favorites.', 'info'); }
            else { s.add(id); toast.show('Added to favorites.', 'success'); }
            favsSet(s); paint();
            if ($('#game-favorites-only')?.checked) app.renderGamesGrid();
        });
        card.appendChild(b);
    });
}

/* nameless games -> Rayquaza picture across grid-adjacent surfaces (hero, reco) */
function unnamedSweep(app) {
    $$('.continue-hero[data-id], .reco-card[data-id]').forEach((el) => {
        const g = app.games.find((x) => x.id === el.dataset.id);
        if (!g || !needsArt(g)) return;
        el.querySelectorAll('.continue-hero-art').forEach((a) => {
            if (!a.style.backgroundImage.includes('rayquaza-quantum')) {
                a.style.backgroundImage = `url('${UNNAMED_ART}')`;
            }
        });
        el.querySelectorAll('img').forEach((im) => {
            if (!im.src.includes('rayquaza-quantum')) im.src = UNNAMED_ART;
        });
    });
}

/* ---------- random / lucky / game-of-day / streaks ---------- */
function gameOfDay(app) {
    if (!app.games?.length) return null;
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return app.games[h % app.games.length];
}
function buildGamesHeader(app) {
    const bar = $('.glass-panel.p-4.mb-6');
    if (!bar || $('#q-random-btn')) return;
    const row = document.createElement('div');
    row.className = 'q-action-row';
    row.innerHTML = `
        <button id="q-random-btn" class="btn-outline text-xs px-3 py-1.5"><i class="fas fa-dice"></i> ${t(app, 'random')}</button>
        <span id="q-streak" class="text-xs font-mono text-gray-400"></span>`;
    bar.parentNode.insertBefore(row, bar.nextSibling);
    const pick = () => app.games[Math.floor(Math.random() * app.games.length)];
    $('#q-random-btn').addEventListener('click', () => {
        const g = pick(); if (g) app.launchGameById(g.id);
    });
    // daily streak
    const today = new Date().toISOString().slice(0, 10);
    const st = store.get('hub_streak', { count: 0, last: '' });
    if (st.last !== today) {
        const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        st.count = (st.last === y) ? st.count + 1 : 1;
        st.last = today; store.set('hub_streak', st);
        if (st.count > 1) setTimeout(() => toast.show(`Daily streak: ${st.count} days!`, 'success'), 2500);
    }
    const chip = $('#q-streak');
    if (chip) chip.innerHTML = `<i class="fas fa-fire text-accent"></i> ${st.count}-day streak`;
}

/* ---------- game detail: star rating + similar + competitive ranks ---------- */
const COMP_CATS = ['FPS', 'IO', 'RACING', 'SPORTS', 'ACTION', 'FIGHTING', 'ARCADE', 'ENDLESS RUNNER', 'PLATFORMER'];
function starRow(app, gameId) {
    const cur = app.gameStats[gameId]?.rating || 0;
    let html = `<div class="q-stars" data-game="${esc(gameId)}" title="Rate this game">`;
    for (let i = 1; i <= 5; i++) html += `<button data-star="${i}" class="${i <= cur ? 'lit' : ''}"><i class="fas fa-star"></i></button>`;
    html += `<span class="text-[11px] text-gray-500 ml-2">${cur ? `${cur}/5` : 'unrated'}</span></div>`;
    return html;
}
function bindStars(app, root) {
    $$('.q-stars button', root).forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = b.closest('.q-stars');
        const gid = row.dataset.game;
        const v = parseInt(b.dataset.star, 10);
        if (!app.gameStats[gid]) app.gameStats[gid] = { launches: 0, playTime: 0, lastPlayed: null, rating: 0 };
        app.gameStats[gid].rating = v;
        try { app.saveGameStats && app.saveGameStats(); } catch (err) {}
        $$('button', row).forEach((x) => x.classList.toggle('lit', parseInt(x.dataset.star, 10) <= v));
        const lbl = row.querySelector('span'); if (lbl) lbl.textContent = `${v}/5`;
        toast.show(`Rated ${v}/5.`, 'success');
    }));
}
function enhanceDetailModal(app, gameId) {
    const game = app.games.find((g) => g.id === gameId);
    if (!game) return;
    const panel = $('.modal-panel') || $('.modal-overlay .glass-panel') || $('.modal-overlay');
    if (!panel || panel.querySelector('.q-detail-extra')) return;
    // games with no picture get the Rayquaza art everywhere in the modal
    if (needsArt(game)) {
        panel.querySelectorAll('img').forEach((im) => {
            if (!im.src.includes('rayquaza-quantum')) im.src = UNNAMED_ART;
        });
    }
    const box = document.createElement('div');
    box.className = 'q-detail-extra mt-4 pt-4 border-t border-white/10 space-y-4';
    const sims = app.games.filter((g) => g.id !== gameId && g.category === game.category).slice(0, 6);
    box.innerHTML = `
        <div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Your rating</div>
            ${starRow(app, gameId)}
        </div>
        ${sims.length ? `<div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Similar games</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                ${sims.map((g) => `<button class="q-sim glass-panel p-2 flex items-center gap-2 text-left" data-id="${esc(g.id)}">
                    <span class="text-xs text-white truncate">${esc(g.name)}</span></button>`).join('')}
            </div></div>` : ''}
        ${COMP_CATS.includes(game.category) ? `<div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Competitive ranks — top 5</div>
            <div id="q-ranks" class="text-xs text-gray-400">Loading ranks…</div>
            ${app.isLoggedIn && app.isLoggedIn() ? `<div class="flex gap-2 mt-2">
                <input id="q-score-input" type="number" min="0" class="form-input text-xs" placeholder="Your score">
                <button id="q-score-send" class="btn-premium text-xs px-3">POST SCORE</button></div>` : '<div class="text-[11px] text-gray-600">Log in to post a score.</div>'}
        </div>` : ''}`;
    panel.appendChild(box);
    bindStars(app, box);
    $$('.q-sim', box).forEach((b) => b.addEventListener('click', () => {
        try { modals.close(); } catch (e) {}
        app.showGameDetail(b.dataset.id);
    }));
    const rk = $('#q-ranks', box);
    if (rk) {
        api(app, 'scores-top', { game: gameId }).then((j) => {
            const top = j.top || [];
            rk.innerHTML = top.length
                ? top.map((r, i) => `<div class="flex justify-between py-0.5"><span>#${i + 1} ${esc(r.user)}</span><span class="font-mono text-white">${r.score}</span></div>`).join('')
                : 'No scores yet — be the first.';
        }).catch(() => { rk.textContent = 'Ranks need the hub server (offline mode).'; });
        $('#q-score-send', box)?.addEventListener('click', async () => {
            const v = parseInt($('#q-score-input', box).value, 10);
            if (Number.isNaN(v)) { toast.show('Enter a score.', 'error'); return; }
            try { await api(app, 'scores-submit', { game: gameId, score: v }); toast.show('Score posted.', 'success'); enhanceRefreshRanks(app, gameId); }
            catch (e) { toast.show(e.message, 'error'); }
        });
    }
}
async function enhanceRefreshRanks(app, gameId) {
    try {
        const j = await api(app, 'scores-top', { game: gameId });
        const rk = $('#q-ranks');
        if (rk) rk.innerHTML = (j.top || []).map((r, i) => `<div class="flex justify-between py-0.5"><span>#${i + 1} ${esc(r.user)}</span><span class="font-mono text-white">${r.score}</span></div>`).join('') || 'No scores yet.';
    } catch (e) {}
}

/* ---------- account panel: profile, personal stats, social ---------- */
function personalStats(app) {
    const st = app.gameStats || {};
    const ids = Object.keys(st);
    const launches = ids.reduce((a, id) => a + (st[id].launches || 0), 0);
    const playTime = ids.reduce((a, id) => a + (st[id].playTime || 0), 0);
    const favs = favsGet().size;
    const streak = store.get('hub_streak', { count: 0 }).count || 0;
    const rated = ids.filter((id) => (st[id].rating || 0) > 0).length;
    const mins = Math.floor(playTime / 60);
    return { launches, playTime: mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`, favs, streak, rated, games: ids.length };
}
function renderAccountPlus(app) {
    const host = $('#account-content');
    if (!host) return;
    const logged = !!(app.isLoggedIn && app.isLoggedIn());
    const flag = logged ? '1' : '0';
    const existing = host.querySelector('#q-account-plus');
    // Render once per auth STATE: the boot-time box is always the logged-out
    // one (session restore is async), so a login/logout must replace it —
    // otherwise the profile/friends/polls section can never appear.
    if (existing && existing.dataset.logged === flag) return;
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'q-account-plus';
    box.className = 'mt-4 pt-4 border-t border-white/10 space-y-4';
    box.dataset.logged = flag;
    const s = personalStats(app);
    box.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
            ${[['Launches', s.launches], ['Play time', s.playTime], ['Favorites', s.favs], ['Streak', `${s.streak}d`], ['Rated', s.rated], ['Games tried', s.games]].map(([k, v]) => `<div class="glass-panel p-2"><div class="text-lg font-bold text-white">${v}</div><div class="text-[10px] text-gray-500 uppercase">${k}</div></div>`).join('')}
        </div>
        ${logged ? `
        <div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Profile (no NSFW — filtered)</div>
            <div class="flex flex-col gap-2">
                <input id="q-display" class="form-input text-xs" maxlength="40" placeholder="Display name">
                <textarea id="q-bio" class="form-textarea text-xs h-16" maxlength="300" placeholder="Bio — keep it clean"></textarea>
                <div class="flex items-center gap-2">
                    <input id="q-color" type="color" value="#39ff14" class="w-10 h-10 rounded cursor-pointer bg-transparent border border-white/10">
                    <button id="q-profile-save" class="btn-premium text-xs px-4 py-2">SAVE PROFILE</button>
                    <button id="q-profile-view" class="btn-outline text-xs px-3 py-2">VIEW</button>
                </div>
                <div id="q-profile-card" class="text-xs text-gray-400"></div>
            </div>
        </div>
        <div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Friends & chat</div>
            <div class="flex gap-2 mb-2">
                <input id="q-user-search" class="form-input text-xs" placeholder="Find user…">
                <button id="q-user-go" class="btn-outline text-xs px-3">SEARCH</button>
            </div>
            <div id="q-user-results" class="space-y-1 mb-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><div class="text-[11px] text-gray-500 mb-1">FRIENDS</div><div id="q-friends" class="space-y-1 text-xs"></div></div>
                <div><div class="text-[11px] text-gray-500 mb-1">REQUESTS</div><div id="q-requests" class="space-y-1 text-xs"></div></div>
            </div>
            <div id="q-chat" class="mt-2 hidden">
                <div class="text-[11px] text-gray-500 mb-1">CHAT WITH <span id="q-chat-who" class="text-white"></span></div>
                <div id="q-chat-log" class="h-36 overflow-y-auto bg-black/40 border border-white/5 rounded-lg p-2 text-xs space-y-1"></div>
                <div class="flex gap-2 mt-2">
                    <input id="q-chat-input" class="form-input text-xs" placeholder="Message…" maxlength="1000">
                    <button id="q-chat-emotes" class="btn-outline text-xs px-2" title="Emotes">😀</button>
                    <button id="q-chat-send" class="btn-premium text-xs px-3">${t(app, 'send')}</button>
                </div>
                <div id="q-emote-row" class="hidden flex-wrap gap-1 mt-2"></div>
            </div>
        </div>
        <div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Blocked users</div>
            <div id="q-blocks" class="space-y-1 text-xs text-gray-400"></div>
        </div>
        <div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Report a user</div>
            <div class="flex flex-col sm:flex-row gap-2">
                <input id="q-report-user" class="form-input text-xs" placeholder="Username">
                <select id="q-report-kind" class="form-select text-xs">
                    <option value="spam">Spam</option><option value="harassment">Harassment</option>
                    <option value="nsfw">NSFW content</option><option value="cheating">Cheating</option><option value="other">Other</option>
                </select>
                <input id="q-report-detail" class="form-input text-xs" placeholder="Details (optional)">
                <button id="q-report-send" class="btn-outline text-xs px-3">REPORT</button>
            </div>
        </div>
        <div>
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">Polls</div>
            <div id="q-polls" class="space-y-3"></div>
            <div class="flex flex-col sm:flex-row gap-2 mt-2">
                <input id="q-poll-q" class="form-input text-xs" placeholder="New poll question">
                <input id="q-poll-opts" class="form-input text-xs" placeholder="Options, comma separated">
                <button id="q-poll-new" class="btn-outline text-xs px-3">CREATE</button>
            </div>
        </div>` : '<div class="text-xs text-gray-500">Log in to unlock profiles, friends, chat, polls and ranks.</div>'}`;
    host.appendChild(box);
    if (!logged) return;
    const reload = () => loadSocial(app);
    $('#q-profile-save').addEventListener('click', async () => {
        const display = $('#q-display').value, bio = $('#q-bio').value, color = $('#q-color').value;
        if (!cleanText(`${display} ${bio}`)) { toast.show('Profile text blocked (keep it clean).', 'error'); return; }
        try { await api(app, 'profile-set', { display, bio, color }); toast.show('Profile saved.', 'success'); }
        catch (e) { toast.show(e.message, 'error'); }
    });
    $('#q-profile-view').addEventListener('click', async () => {
        try {
            const j = await api(app, 'profile-get', {});
            $('#q-profile-card').innerHTML = `<span style="color:${esc(j.color)}">◈</span> <b class="text-white">${esc(j.display || j.username)}</b> <span class="text-gray-600">@${esc(j.username)}</span><br>${esc(j.bio || 'No bio yet.')}`;
            if (j.display) $('#q-display').value = j.display;
            if (j.bio) $('#q-bio').value = j.bio;
            if (j.color) $('#q-color').value = j.color;
        } catch (e) { toast.show(e.message, 'error'); }
    });
    $('#q-user-go').addEventListener('click', async () => {
        const q = $('#q-user-search').value.trim();
        if (q.length < 2) return;
        try {
            const j = await api(app, 'users-search', { q });
            $('#q-user-results').innerHTML = j.users.length ? j.users.map((u) => `<div class="flex items-center justify-between glass-panel px-2 py-1">
                <span class="text-white">${esc(u.username)}</span>
                <span class="flex gap-1">
                    <button class="btn-outline text-[10px] px-2 py-0.5" data-add="${esc(u.username)}">ADD</button>
                    <button class="btn-outline text-[10px] px-2 py-0.5" data-chat="${esc(u.username)}">CHAT</button>
                    <button class="btn-outline text-[10px] px-2 py-0.5" data-block="${esc(u.username)}">BLOCK</button>
                </span></div>`).join('') : '<div class="text-gray-600">No users found.</div>';
            $$('#q-user-results [data-add]').forEach((b) => b.addEventListener('click', async () => {
                try { await api(app, 'friends', { action: 'request', user: b.dataset.add }); toast.show('Request sent.', 'success'); reload(); }
                catch (e) { toast.show(e.message, 'error'); }
            }));
            $$('#q-user-results [data-chat]').forEach((b) => b.addEventListener('click', () => openChat(app, b.dataset.chat)));
            $$('#q-user-results [data-block]').forEach((b) => b.addEventListener('click', async () => {
                try { await api(app, 'block', { action: 'block', user: b.dataset.block }); toast.show('User blocked.', 'success'); reload(); }
                catch (e) { toast.show(e.message, 'error'); }
            }));
        } catch (e) { toast.show(e.message, 'error'); }
    });
    $('#q-report-send').addEventListener('click', async () => {
        const target = $('#q-report-user').value.trim();
        if (!target) { toast.show('Enter a username.', 'error'); return; }
        try {
            await api(app, 'report', { target, kind: $('#q-report-kind').value, detail: $('#q-report-detail').value });
            toast.show('Report received.', 'success');
        } catch (e) { toast.show(e.message, 'error'); }
    });
    $('#q-poll-new').addEventListener('click', async () => {
        const question = $('#q-poll-q').value.trim();
        const options = $('#q-poll-opts').value.split(',').map((s) => s.trim()).filter(Boolean);
        if (!cleanText(`${question} ${options.join(' ')}`)) { toast.show('Poll text blocked.', 'error'); return; }
        try { await api(app, 'polls-create', { question, options }); toast.show('Poll created.', 'success'); loadPolls(app); }
        catch (e) { toast.show(e.message, 'error'); }
    });
    $('#q-chat-send').addEventListener('click', sendChat);
    $('#q-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
    // Emote picker (Vortex-style): one tap appends the emote to the draft.
    const erow = $('#q-emote-row');
    if (erow && !erow.dataset.q) {
        erow.dataset.q = '1';
        const EMOTES = ['😀', '😂', '😍', '🔥', '👍', '👎', '🎮', '🍿', '😢', '😮', '💀', '👏', '🙏', '💯', '❤️', '⭐', '🎉', '🤔'];
        erow.innerHTML = EMOTES.map((m) => `<button type="button" class="text-lg leading-none p-1 hover:scale-125 transition" data-e="${m}">${m}</button>`).join('');
        erow.addEventListener('click', (e) => {
            const b = e.target.closest ? e.target.closest('[data-e]') : null;
            if (!b) return;
            const inp = $('#q-chat-input');
            if (inp) { inp.value += b.dataset.e; inp.focus(); }
        });
        $('#q-chat-emotes').addEventListener('click', () => {
            erow.classList.toggle('hidden');
            erow.classList.toggle('flex');
        });
    }
    async function sendChat() {
        const who = $('#q-chat-who').textContent;
        const body = $('#q-chat-input').value.trim();
        if (!who || !body) return;
        if (!cleanText(body)) { toast.show('Message blocked (keep it clean).', 'error'); return; }
        try { await api(app, 'chat-send', { user: who, body }); $('#q-chat-input').value = ''; openChat(app, who); }
        catch (e) { toast.show(e.message, 'error'); }
    }
    loadSocial(app); loadPolls(app);
}
async function openChat(app, who) {
    $('#q-chat').classList.remove('hidden');
    $('#q-chat-who').textContent = who;
    try {
        const j = await api(app, 'chat-history', { user: who });
        $('#q-chat-log').innerHTML = j.messages.map((m) => `<div class="${m.me ? 'text-right' : ''}"><span class="text-gray-500">${esc(m.me ? 'you' : m.from)}:</span> <span class="text-gray-200">${esc(m.body)}</span></div>`).join('') || '<div class="text-gray-600">No messages yet.</div>';
        $('#q-chat-log').scrollTop = 1e6;
    } catch (e) { toast.show(e.message, 'error'); }
}
async function loadSocial(app) {
    try {
        const j = await api(app, 'friends', { action: 'list' });
        $('#q-friends').innerHTML = j.friends.length ? j.friends.map((f) => `<div class="flex items-center justify-between glass-panel px-2 py-1">
            <span class="text-white">${esc(f.username)}</span>
            <span class="flex gap-1"><button class="btn-outline text-[10px] px-2 py-0.5" data-c="${esc(f.username)}">CHAT</button>
            <button class="btn-outline text-[10px] px-2 py-0.5" data-r="${esc(f.username)}">REMOVE</button></span></div>`).join('') : '<div class="text-gray-600">No friends yet.</div>';
        $('#q-requests').innerHTML = j.incoming.length ? j.incoming.map((f) => `<div class="flex items-center justify-between glass-panel px-2 py-1">
            <span class="text-white">${esc(f.username)}</span>
            <span class="flex gap-1"><button class="btn-outline text-[10px] px-2 py-0.5" data-a="${esc(f.username)}">ACCEPT</button>
            <button class="btn-outline text-[10px] px-2 py-0.5" data-d="${esc(f.username)}">DECLINE</button></span></div>`).join('') : '<div class="text-gray-600">No requests.</div>';
        $$('#q-friends [data-c]').forEach((b) => b.addEventListener('click', () => openChat(app, b.dataset.c)));
        $$('#q-friends [data-r]').forEach((b) => b.addEventListener('click', async () => {
            await api(app, 'friends', { action: 'remove', user: b.dataset.r }); loadSocial(app);
        }));
        $$('#q-requests [data-a]').forEach((b) => b.addEventListener('click', async () => {
            await api(app, 'friends', { action: 'accept', user: b.dataset.a }); toast.show('Friend added.', 'success'); loadSocial(app);
        }));
        $$('#q-requests [data-d]').forEach((b) => b.addEventListener('click', async () => {
            await api(app, 'friends', { action: 'decline', user: b.dataset.d }); loadSocial(app);
        }));
    } catch (e) {}
    try {
        const b = await api(app, 'blocks-list', {});
        $('#q-blocks').innerHTML = b.blocked.length ? b.blocked.map((u) => `<div class="flex items-center justify-between glass-panel px-2 py-1">
            <span>${esc(u)}</span><button class="btn-outline text-[10px] px-2 py-0.5" data-u="${esc(u)}">UNBLOCK</button></div>`).join('') : 'Nobody blocked.';
        $$('#q-blocks [data-u]').forEach((x) => x.addEventListener('click', async () => {
            await api(app, 'block', { action: 'unblock', user: x.dataset.u }); loadSocial(app);
        }));
    } catch (e) {}
}
async function loadPolls(app) {
    try {
        const j = await api(app, 'polls-list', {});
        $('#q-polls').innerHTML = j.polls.map((p) => {
            const total = p.counts.reduce((a, b) => a + b, 0) || 1;
            return `<div class="glass-panel p-2"><div class="text-xs text-white font-bold mb-1">${esc(p.question)}</div>
                ${p.options.map((o, i) => {
                    const pct = Math.round((p.counts[i] / total) * 100);
                    return `<button class="w-full text-left mb-1" data-poll="${p.id}" data-opt="${i}">
                        <div class="flex justify-between text-[11px] text-gray-300"><span>${p.mine === i ? '◈ ' : ''}${esc(o)}</span><span>${pct}% (${p.counts[i]})</span></div>
                        <div class="h-1.5 bg-white/5 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:var(--accent)"></div></div>
                    </button>`;
                }).join('')}</div>`;
        }).join('') || '<div class="text-gray-600 text-xs">No polls yet.</div>';
        $$('#q-polls [data-poll]').forEach((b) => b.addEventListener('click', async () => {
            try { await api(app, 'polls-vote', { id: b.dataset.poll, opt: parseInt(b.dataset.opt, 10) }); loadPolls(app); }
            catch (e) { toast.show(e.message, 'error'); }
        }));
    } catch (e) { $('#q-polls').innerHTML = '<div class="text-gray-600 text-xs">Polls need the hub server.</div>'; }
}

/* ---------- settings: lite, auto-theme, language, dock, txt backup, updates, feedback, install ---------- */
function applyLite(app) {
    const lite = !!app.settings.lite;
    document.documentElement.classList.toggle('q-lite', lite);
    if (lite) {
        document.body.classList.add('animations-none');
        document.body.classList.remove('animations-reduced');
        try { window.QuantumStealth?.setPerfMode?.(true); } catch (e) {}
        const cv = $('#particles-canvas'); if (cv) cv.style.display = 'none';
    } else {
        document.body.classList.remove('animations-none');
        const cv = $('#particles-canvas'); if (cv) cv.style.display = '';
    }
}
function buildSettingsPlus(app) {
    const host = $('#settings-account')?.parentElement;
    if (!host || $('#q-settings-plus')) return;
    const box = document.createElement('div');
    box.id = 'q-settings-plus';
    box.className = 'glass-panel p-6 space-y-4';
    box.innerHTML = `
        <h4 class="text-md font-bold text-white font-logo flex items-center gap-2"><i class="fas fa-sliders text-accent"></i> <span data-i18n="hubExtras">HUB EXTRAS</span></h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label class="flex items-center justify-between gap-2 text-gray-300"><span data-i18n="liteMode">Lite mode (strip animations & effects)</span>
                <input id="q-lite" type="checkbox" class="w-4 h-4" ${app.settings.lite ? 'checked' : ''}></label>
            <label class="flex items-center justify-between gap-2 text-gray-300"><span data-i18n="autoTheme">Auto theme by time</span>
                <select id="q-autotheme" class="form-select text-xs w-32">
                    <option value="off" data-i18n="off">Off</option><option value="time" data-i18n="byTime">By time</option>
                </select></label>
            <label class="flex items-center justify-between gap-2 text-gray-300"><span data-i18n="language">Language</span>
                <select id="q-lang" class="form-select text-xs w-32">
                    <option value="en">English</option><option value="es">Español</option>
                    <option value="fr">Français</option><option value="de">Deutsch</option>
                    <option value="ja">日本語</option><option value="zh">中文</option>
                </select></label>
            <label class="flex items-center justify-between gap-2 text-gray-300"><span data-i18n="dockPos">Dock position</span>
                <select id="q-dockpos" class="form-select text-xs w-32">
                    <option value="bottom" data-i18n="bottom">Bottom</option><option value="left" data-i18n="left">Left</option>
                    <option value="right" data-i18n="right">Right</option><option value="free" data-i18n="unlocked">Unlocked (drag)</option>
                </select></label>
            <label class="flex items-center justify-between gap-2 text-gray-300"><span data-i18n="sidePos">Sidebar side</span>
                <select id="q-sidepos" class="form-select text-xs w-32">
                    <option value="left" data-i18n="left">Left</option><option value="right" data-i18n="right">Right</option>
                </select></label>
        </div>
        <div class="flex flex-wrap gap-2">
            <button id="q-txt-down" class="btn-outline text-xs px-3 py-2"><i class="fas fa-download"></i> <span data-i18n="txtSettings">SETTINGS .TXT</span></button>
            <button id="q-data-down" class="btn-outline text-xs px-3 py-2"><i class="fas fa-hdd"></i> <span data-i18n="txtData">MY DATA FILE</span></button>
            <button id="q-updates" class="btn-outline text-xs px-3 py-2"><i class="fas fa-bell"></i> <span data-i18n="updates">UPDATES</span></button>
            <button id="q-news" class="btn-outline text-xs px-3 py-2"><i class="fas fa-newspaper"></i> <span data-i18n="news">EVENTS & NEWS</span></button>
            <button id="q-feedback" class="btn-outline text-xs px-3 py-2"><i class="fas fa-comment"></i> <span data-i18n="feedback">FEEDBACK</span></button>
            <button id="q-install" class="btn-premium text-xs px-3 py-2"><i class="fas fa-arrow-down"></i> <span data-i18n="install">INSTALL APP</span></button>
        </div>
        <div>
            <div class="text-[11px] text-gray-500 mb-1" data-i18n="importHint">Paste a settings .txt to import</div>
            <textarea id="q-txt-paste" class="form-textarea h-20 font-mono text-[10px]" placeholder="Paste settings file content here…"></textarea>
            <button id="q-txt-import" class="btn-outline text-xs px-3 py-1.5 mt-2"><span data-i18n="txtImport">IMPORT .TXT</span></button>
        </div>`;
    host.appendChild(box);
    $('#q-autotheme').value = app.settings.autoTheme || 'off';
    $('#q-lang').value = app.settings.language || 'en';
    $('#q-dockpos').value = app.settings.dockPosition || 'bottom';
    $('#q-sidepos').value = app.settings.sidebarSide || 'left';
    $('#q-lite').addEventListener('change', (e) => {
        app.settings.lite = e.target.checked; app.saveSettings(); applyLite(app);
        toast.show(e.target.checked ? 'Lite mode ON.' : 'Lite mode OFF.', 'success');
    });
    $('#q-autotheme').addEventListener('change', (e) => {
        app.settings.autoTheme = e.target.value; app.saveSettings();
        store.set('q_theme_manual', false); autoThemeTick(app);
    });
    const setLang = (v) => {
        app.settings.language = v; app.saveSettings(); applyI18n(app);
        toast.show(t(app, 'langApplied'), 'success');
    };
    $('#q-lang').addEventListener('change', (e) => setLang(e.target.value));
    const sl = $('#setting-language');
    if (sl && !sl.dataset.q) {
        sl.dataset.q = '1';
        sl.value = app.settings.language || 'en';
        sl.addEventListener('change', (e) => setLang(e.target.value));
    }
    $('#q-dockpos').addEventListener('change', (e) => {
        app.settings.dockPosition = e.target.value; app.saveSettings();
        dockCookieSave(app); applyDockPosition(app);
        toast.show(`Dock: ${e.target.value}.`, 'success');
    });
    $('#q-sidepos').addEventListener('change', (e) => {
        app.settings.sidebarSide = e.target.value; app.saveSettings();
        dockCookieSave(app); applyDockPosition(app);
    });
    const collectSettings = () => ({ settings: app.settings, favorites: Array.from(favsGet()), streak: store.get('hub_streak', null), exported_at: new Date().toISOString() });
    const download = (name, text) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    $('#q-txt-down').addEventListener('click', () => {
        download('quantum-settings.txt', `QUANTUM_HUB_SETTINGS v1\n${JSON.stringify(collectSettings(), null, 2)}`);
        toast.show('Settings .txt downloaded.', 'success');
    });
    $('#q-data-down').addEventListener('click', () => {
        download('quantum-mydata.txt', `QUANTUM_HUB_DATA v1\n${JSON.stringify({ ...collectSettings(), stats: app.gameStats }, null, 2)}`);
        toast.show('Data file downloaded.', 'success');
    });
    $('#q-txt-import').addEventListener('click', () => {
        try {
            const raw = $('#q-txt-paste').value;
            const json = JSON.parse(raw.slice(raw.indexOf('{')));
            if (json.settings) { app.settings = { ...app.settings, ...json.settings }; app.saveSettings(); app.applyVisuals(); applyLite(app); applyDockPosition(app); applyI18n(app); }
            if (json.favorites) favsSet(new Set(json.favorites));
            if (json.streak) store.set('hub_streak', json.streak);
            toast.show('Settings imported.', 'success');
        } catch (e) { toast.show('Invalid settings file.', 'error'); }
    });
    $('#q-updates').addEventListener('click', () => modals.open(`
        <h2 class="text-xl font-bold text-white font-logo mb-3"><i class="fas fa-bell text-accent"></i> HUB UPDATES</h2>
        <div class="space-y-2 text-xs text-gray-300">
            <div class="glass-panel p-3"><b class="text-white">Basics pack</b> — volume, clock, battery, weather, online count, day/night, dock & sidebar move, working login, hover favorites, random + lucky, star ratings, similar games, ranks, profiles, stats, polls, friends, chat, blocks, reports, feedback, forms, install, lite mode, .txt backup, Netflix previews, i18n, auto-theme.</div>
            <div class="glass-panel p-3"><b class="text-white">Catalog wave</b> — 84 gamesite + 264 fifty-five-GMS games with per-game CDN mirrors.</div>
            <div class="glass-panel p-3"><b class="text-white">Quantum pass</b> — full-scheme theming, per-game artwork, branded popups.</div>
        </div>`));
    $('#q-news').addEventListener('click', async () => {
        let pollLine = 'No active polls right now.';
        try {
            const j = await api(app, 'polls-list', {});
            if (j.polls?.length) {
                const p = j.polls[0];
                const total = p.counts.reduce((a, b) => a + b, 0);
                const lead = p.options[p.counts.indexOf(Math.max(...p.counts))];
                pollLine = `Latest poll: "${p.question}" — leading: ${lead} (${total} votes).`;
            }
        } catch (e) { pollLine = 'Polls need the hub server (offline mode).'; }
        const gotd = (() => { try { const g = gameOfDay(app); return g ? g.name : '—'; } catch (e) { return '—'; } })();
        const day = new Date().toISOString().slice(0, 10);
        modals.open(`
        <h2 class="text-xl font-bold text-white font-logo mb-3"><i class="fas fa-newspaper text-accent"></i> EVENTS & NEWS</h2>
        <div class="space-y-2 text-xs text-gray-300">
            <div class="glass-panel p-3"><div class="text-[10px] text-gray-500 uppercase mb-1">Today · ${day}</div>
                <b class="text-white">Game of the day: ${esc(gotd)}</b><br>One featured pick, fresh every morning.</div>
            <div class="glass-panel p-3"><div class="text-[10px] text-gray-500 uppercase mb-1">Community</div>${esc(pollLine)}</div>
            <div class="glass-panel p-3"><div class="text-[10px] text-gray-500 uppercase mb-1">Event · FPS Friday</div>
                Post your best FPS scores on the competitive ranks boards every Friday — top 5 make the card.</div>
            <div class="glass-panel p-3"><div class="text-[10px] text-gray-500 uppercase mb-1">Event · Racing Weekend</div>
                Weekend time-trials on RACING titles. Fastest posted scores take the leaderboard.</div>
            <div class="glass-panel p-3"><div class="text-[10px] text-gray-500 uppercase mb-1">Shipped</div>
                Basics pack is live: volume, clock, battery, weather, online count, day/night, dock & sidebar move, working login, hover favorites, random + lucky, ratings, similar games, ranks, profiles, stats, polls, friends, chat, blocks, reports, feedback, forms, install, lite mode, .txt backup, previews, languages, auto-theme.</div>
        </div>`);
    });
    $('#q-feedback').addEventListener('click', () => modals.open(`
        <h2 class="text-xl font-bold text-white font-logo mb-3"><i class="fas fa-comment text-accent"></i> SEND FEEDBACK</h2>
        <textarea id="q-fb-text" class="form-textarea h-28 text-xs" maxlength="2000" placeholder="Tell us what to improve…"></textarea>
        <button id="q-fb-send" class="btn-premium text-xs px-4 py-2 mt-3">SUBMIT</button>`, {
        '#q-fb-send': async () => {
            const body = $('#q-fb-text').value.trim();
            if (!body) return;
            if (!cleanText(body)) { toast.show('Feedback blocked (keep it clean).', 'error'); return; }
            try { await api(app, 'feedback', { body }); toast.show('Feedback sent.', 'success'); modals.close(); }
            catch (e) { toast.show(e.message, 'error'); }
        },
    }));
    $('#q-install').addEventListener('click', async () => {
        if (window._qInstallPrompt) {
            window._qInstallPrompt.prompt();
            await window._qInstallPrompt.userChoice;
            window._qInstallPrompt = null;
        } else toast.show('No install prompt available in this browser.', 'info');
    });
}

/* ---------- media grids + Netflix-style hover previews ---------- */
// Playable media opens inside the hub viewer (an iframe overlay) — fewer
// popup/blank-window failure modes. launchContent is viewer-first now, so it
// also wires the Pop-out button straight to the popup path (no recursion).
function openInHub(url, title) {
    // file:// clips (hub running from disk) and other non-http(s) URLs:
    // launchContent only takes http(s), so they go straight to the in-hub
    // viewer, which plays media files via the media-player page.
    if (!/^https?:/i.test(url)) {
        try { openGameViewer({ title, url, mirrors: [url] }); return; }
        catch (e) { /* fall through */ }
    }
    try {
        // launchContent returns false (not throws) for URLs it cannot take
        // — e.g. file:// media clips when the hub runs from disk. Fall
        // through to the direct viewer in that case instead of silently
        // opening nothing.
        const ok = window.app.launchContent(url, 'about-blank', title);
        if (ok) return;
    } catch (e) { /* fall through to the direct viewer */ }
    try {
        try { openGameViewer({ title, url, mirrors: [url] }); }
        catch (err) {
            try { launchViaAboutBlank(url, title); } catch (e2) {}
        }
    } catch (e) {}
}

function buildMedia(app, mod) {
    const movies = $('.movie-grid'), tv = $('.tv-grid'), pods = $('.podcast-grid');
    if (!movies && !tv && !pods) return;
    if (movies && !movies.dataset.q) {
        movies.dataset.q = '1';
        movies.innerHTML = mod.movies.map((m, i) => `<div class="media-card" data-mi="${i}">
            <div class="media-art" style="background-image:url('${esc(m.thumb)}')">
                ${m.url && (m.url.indexOf('media/') === 0 || /\.mp4($|\?)/i.test(m.url)) ? `<video class="media-preview" muted loop playsinline preload="none" src="${esc(m.url)}"></video>` : ''}
                <span class="media-play"><i class="fas fa-play"></i></span>
            </div>
            <div class="media-meta"><div class="media-title">${esc(m.title)}</div>
            <div class="media-sub">${esc(m.year || '')} · ${esc(m.genre || '')} · ${esc(m.duration || '')}</div></div>
        </div>`).join('');
        movies.addEventListener('click', (e) => {
            const card = e.target.closest('.media-card'); if (!card) return;
            const m = mod.movies[parseInt(card.dataset.mi, 10)];
            if (m) {
                // Local clips (media/*.mp4) need an absolute http URL to launch.
                const u = /^https?:/i.test(m.url) ? m.url : new URL(m.url, location.href).href;
                openInHub(u, m.title);
            }
        });
        movies.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.media-card'); if (!card) return;
            const v = card.querySelector('video.media-preview');
            if (v) { try { v.volume = app.settings.volume ?? 0.8; } catch (err) {} }
            if (v && v.paused) { v.play().catch(() => {}); }
        });
        movies.addEventListener('mouseout', (e) => {
            const card = e.target.closest('.media-card'); if (!card) return;
            const v = card.querySelector('video.media-preview');
            if (v && !v.paused) { v.pause(); }
        });
    }
    if (tv && !tv.dataset.q) {
        tv.dataset.q = '1';
        // No TV demos left (pre-1980 clips removed): hide the whole section
        // instead of leaving an empty grid under its header.
        if (!mod.tv.length) {
            const sec = tv.parentElement;
            if (sec) sec.style.display = 'none';
            return;
        }
        tv.innerHTML = mod.tv.map((s, i) => `<div class="media-card" data-tvi="${i}"><div class="media-art" style="background-image:url('${esc(s.thumb)}')">
            <span class="media-play"><i class="fas fa-play"></i></span></div>
            <div class="media-meta"><div class="media-title">${esc(s.title)}</div>
            <div class="media-sub">${esc(s.season || '')} · ${esc(s.episodes || '')} · ★ ${esc(s.rating || '')}</div></div></div>`).join('');
        tv.addEventListener('click', (e) => {
            const card = e.target.closest('.media-card'); if (!card) return;
            const s = mod.tv[parseInt(card.dataset.tvi, 10)];
            if (!s) return;
            if (s.url) {
                // Playable episodes open in the in-hub viewer (less error-prone than popups).
                const u = /^https?:/i.test(s.url) ? s.url : new URL(s.url, location.href).href;
                openInHub(u, s.title);
            } else {
                openTitleInfo(app, s.title, 'TV');
            }
        });
    }
    const playTrack = (s) => {
        const box = $('.audio-player-box');
        let audio = box?.querySelector('audio');
        if (!audio && box) { audio = document.createElement('audio'); audio.preload = 'metadata'; box.appendChild(audio); }
        if (!audio) return;
        audio.src = s.file; audio.volume = app.settings.volume ?? 0.8; audio.play().catch(() => {});
        $('#ambient-track-title').textContent = s.title;
        $('#ambient-track-artist').textContent = s.artist || '';
        const btn = $('.audio-btn.play-pause'); if (btn) btn.innerHTML = '<i class="fas fa-pause"></i>';
        audio.ontimeupdate = () => {
            const f = $('#ambient-progress-fill');
            if (f && audio.duration) f.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        };
        audio.onended = () => { if (btn) btn.innerHTML = '<i class="fas fa-play"></i>'; };
    };
    if (pods && !pods.dataset.q) {
        pods.dataset.q = '1';
        pods.innerHTML = mod.music.map((s, i) => `<button class="glass-panel p-3 flex items-center gap-3 text-left w-full q-track" data-ti="${i}">
            <img src="${esc(s.thumb)}" class="w-10 h-10 rounded-lg" alt=""><div class="flex-1 min-w-0">
            <div class="text-xs text-white font-bold truncate">${esc(s.title)}</div>
            <div class="text-[11px] text-gray-500">${esc(s.artist || '')} · ${esc(s.duration || '')}</div></div>
            <i class="fas fa-play text-accent"></i></button>`).join('');
        pods.addEventListener('click', (e) => {
            const b = e.target.closest('.q-track'); if (!b) return;
            playTrack(mod.music[parseInt(b.dataset.ti, 10)]);
        });
    }
    /* Music tracks grid (was never rendered — section sat empty) */
    const music = $('.music-grid');
    if (music && !music.dataset.q) {
        music.dataset.q = '1';
        music.innerHTML = mod.music.map((s, i) => `<button class="glass-panel p-3 flex items-center gap-3 text-left w-full q-track" data-ti="${i}">
            <img src="${esc(s.thumb)}" class="w-10 h-10 rounded-lg" alt=""><div class="flex-1 min-w-0">
            <div class="text-xs text-white font-bold truncate">${esc(s.title)}</div>
            <div class="text-[11px] text-gray-500">${esc(s.artist || '')} · ${esc(s.duration || '')}</div></div>
            <i class="fas fa-play text-accent"></i></button>`).join('');
        music.addEventListener('click', (e) => {
            const b = e.target.closest('.q-track'); if (!b) return;
            playTrack(mod.music[parseInt(b.dataset.ti, 10)]);
        });
    }
    /* Favorites strip (was never rendered either) */
    const favs = $('.favorites-grid');
    if (favs && !favs.dataset.q) {
        favs.dataset.q = '1';
        const drawFavs = () => {
            const items = (mod.favorites || []).filter(f => f && cleanText(f.title));
            favs.innerHTML = items.length ? items.map((f, i) => `<div class="media-card" data-fi="${i}">
                <div class="media-art"><span class="media-play"><i class="fas fa-${f.type === 'Game' ? 'gamepad' : 'film'}"></i></span></div>
                <div class="media-meta"><div class="media-title">${esc(f.title)}</div><div class="media-sub">${esc(f.type || '')}</div></div>
            </div>`).join('') : '<div class="text-xs text-gray-500">No favorites yet.</div>';
        };
        drawFavs();
        favs.addEventListener('click', (e) => {
            const card = e.target.closest('.media-card'); if (!card) return;
            const f = (mod.favorites || [])[parseInt(card.dataset.fi, 10)];
            if (!f) return;
            if (f.type === 'Media') openTitleInfo(app, f.title, 'Movie');
            else { const el = $('.nav-item[data-target="panel-games"]'); if (el) el.click(); toast.show(`${f.title} — open it from the games grid.`, 'info'); }
        });
    }
}

/* ---------- title catalogs (TV / Movies / Anime) with working clicks ---------- */
function openTitleInfo(app, title, type) {
    const tier = TOP_TIER.find(t => t.title === title);
    const w = TMDB_IDS[title];
    modals.open(`
        <div class="text-center">
            <div class="text-xs font-bold text-accent tracking-widest uppercase mb-1">${esc(type)}${tier ? ` · TIER ${tier.tier}` : ''}</div>
            <h3 class="text-2xl font-bold text-white font-logo mb-2">${esc(title)}</h3>
            <p class="text-gray-400 text-xs mb-5">${esc(t(app, 'watchBlurb'))}</p>
            <div class="flex flex-wrap gap-3 justify-center">
                ${w ? `<button class="btn-premium px-5 py-2 text-xs q-play">${esc(t(app, 'watchNow'))}</button>` : ''}
                <button class="btn-outline px-5 py-2 text-xs q-watch" data-kind="watch">${esc(t(app, 'whereWatch'))}</button>
                <button class="btn-outline px-5 py-2 text-xs q-watch2" data-kind="trailer">${esc(t(app, 'trailer'))}</button>
            </div>
            ${w && w.kind === 'tv' ? `<div class="flex gap-3 justify-center mt-3 text-xs text-gray-400">
                <label>${esc(t(app, 'epgTitle'))} <input id="q-watch-s" type="number" min="1" value="1" class="form-input text-xs" style="width:4.5rem;display:inline-block"></label>
                <label>${esc(t(app, 'epgEp'))} <input id="q-watch-e" type="number" min="1" value="1" class="form-input text-xs" style="width:4.5rem;display:inline-block"></label>
            </div>` : ''}
        </div>`, {
        '.q-watch': (e, el) => { openTitleUrl(app, title, el.dataset.kind); },
        '.q-watch2': (e, el) => { openTitleUrl(app, title, el.dataset.kind); },
        '.q-play': () => { openWatch(app, title); },
    });
}

/* VidSrc embeds need a TMDB id (TMDB_IDS — every id verified: correct
   title+year and actually carried by the player backend). Three separate
   infrastructures so one blocklist entry can't kill them all: vidsrc.me,
   multiembed.mov, videasy. Opens UNSANDBOXED: stream embeds detect
   frameElement.hasAttribute('sandbox') and bounce to an error page, so the
   sandbox attribute is dropped for WATCH only (games stay locked down).
   Tradeoff: an unsandboxed player can pop ads — close the viewer if so. */
function watchEmbeds(w, s, e) {
    const path = w.kind === 'tv' ? `tv/${w.id}/${s}/${e}` : `movie/${w.id}`;
    return [
        `https://vidsrc.me/embed/${path}`,
        w.kind === 'tv'
            ? `https://multiembed.mov/?video_id=${w.id}&tmdb=1&s=${s}&e=${e}`
            : `https://multiembed.mov/?video_id=${w.id}&tmdb=1`,
        w.kind === 'tv'
            ? `https://player.videasy.net/tv/${w.id}/${s}/${e}`
            : `https://player.videasy.net/movie/${w.id}`,
    ];
}
/* Hijack-proof host check: school filters answer DNS for blocked stream
   hosts with a Google search page (HTTP 200!), so fetch-probing "verifies"
   dead hosts. Instead we load a real same-host asset and read the element
   event — verified semantics in-browser: real JS/image → load, ANY HTML
   (hijack page or SPA fallback) → error, 404 → error. Probe assets were
   each hand-verified (vidsrc's /assets/sbx.js = real JS, a top-level no-op;
   videasy's logo.png = PNG). multiembed ships no probeable asset of its own
   (its referenced js/css paths 404 even for real browsers), so it stays
   'unknown' — ranked between live and dead, never silently buried. */
function probeWatchHosts() {
    const probes = [
        { host: 'vidsrc.me', kind: 'script', url: 'https://vidsrc.me/assets/sbx.js' },
        { host: 'multiembed.mov', kind: null },
        { host: 'player.videasy.net', kind: 'image', url: 'https://player.videasy.net/logo.png' },
    ];
    const tryOne = (p, ms) => new Promise((resolve) => {
        if (!p.kind) { resolve('unknown'); return; }
        let done = false;
        const finish = (state) => { if (!done) { done = true; resolve(state); } };
        const timer = setTimeout(() => finish('unknown'), ms);
        try {
            const el = document.createElement(p.kind === 'image' ? 'img' : 'script');
            el.onload = () => { clearTimeout(timer); finish('live'); };
            el.onerror = () => { clearTimeout(timer); finish('dead'); };
            el.src = p.url + (p.url.indexOf('?') === -1 ? '?_=' : '&_=') + Date.now();
            // Scripts only fetch once inserted — append BOTH kinds.
            document.body.appendChild(el);
            setTimeout(() => { try { el.remove(); } catch (e2) {} }, ms + 500);
        } catch (e) { clearTimeout(timer); finish('unknown'); }
    });
    return Promise.race([
        Promise.all(probes.map((p) => tryOne(p, 4000))),
        new Promise((resolve) => setTimeout(() => resolve(probes.map((p) => 'unknown')), 4500)),
    ]).then((states) => probes.map((p, i) => ({ host: p.host, state: (states || [])[i] || 'unknown' })));
}
async function openWatch(app, title) {
    const w = TMDB_IDS[title];
    if (!w) { toast.show(t(app, 'noStream'), 'error'); return; }
    let s = 1, e = 1;
    if (w.kind === 'tv') {
        s = Math.max(1, parseInt((document.getElementById('q-watch-s') || {}).value, 10) || 1);
        e = Math.max(1, parseInt((document.getElementById('q-watch-e') || {}).value, 10) || 1);
    }
    const urls = watchEmbeds(w, s, e);
    const hostsOf = urls.map((u) => { try { return new URL(u).hostname; } catch (err) { return ''; } });
    let order = [0, 1, 2];
    try {
        const probe = await probeWatchHosts();
        const stateOf = {};
        (probe || []).forEach((p) => { stateOf[p.host] = p.state; });
        const weight = (s2) => (s2 === 'live' ? 0 : s2 === 'unknown' ? 1 : 2);
        order = order.slice().sort((a, b) => weight(stateOf[hostsOf[a]]) - weight(stateOf[hostsOf[b]]));
        if (!(probe || []).some((p) => p.state === 'live')) {
            toast.show(t(app, 'noHosts'), 'error');
        }
    } catch (err) {}
    openGameViewer({
        title: `${title} — watch`,
        url: urls[order[0]],
        mirrors: order.map((i) => urls[i]),
        sandbox: false,
        skipProbe: true,
        shield: true,
        // TV: the viewer's S/E controls call this to jump episodes while
        // keeping the probe-ranked mirror order (same permutation).
        tv: w.kind === 'tv'
            ? { s, e, rebuild: (s2, e2) => { const u2 = watchEmbeds(w, s2, e2); return order.map((i) => u2[i]); } }
            : null,
    });
}

// Framing-blocked sites (verified X-Frame-Options/CSP denies) can't render
// in the viewer, and a bare tab leaks the real URL to history logs — so open
// them in a cloaked about:blank tab instead. The shell's topbar keeps an
// "Open directly" fallback link for when the frame refuses to load.
// (A blob: URL can't carry cross-origin HTML at all — CORS forbids reading
// the target page — so about:blank + iframe is the workable path.)
function openBlockedSite(app, url, label) {
    try {
        // onFallback: the anchor-click fallback can't confirm a tab opened —
        // say so plainly instead of going silent when popups are blocked.
        if (launchViaAboutBlank(url, label, {
            onFallback: () => { try { toast.show(`If no new tab appeared, allow popups for this site and retry.`, 'error', 6000); } catch (e2) {} },
        })) return;
    } catch (e) {}
    app.launchContent(url, 'about-blank', label);
}

// Title lookups: trailers use YouTube's embed-search endpoint (framable —
// youtube.com/results sends X-Frame-Options: SAMEORIGIN and renders blank).
// JustWatch sends X-Frame-Options: DENY everywhere, so where-to-watch goes
// through the cloaked about:blank tab instead of a bare tab.
function openTitleUrl(app, title, kind) {
    const q = encodeURIComponent(title);
    if (kind === 'trailer') {
        // enablejsapi=1 lets the viewer's pause button drive the trailer
        // via postMessage (pauseVideo/playVideo) — no API library needed.
        app.launchContent(`https://www.youtube.com/embed?listType=search&list=${q}+trailer&enablejsapi=1`, 'about-blank', `${title} — trailer`);
        return;
    }
    openBlockedSite(app, `https://www.justwatch.com/us/search?q=${q}`, `${title} — where to watch`);
}

function buildCatalogs(app) {
    const tiers = new Map(TOP_TIER.map(t => [t.title, t.tier]));    const specs = [
        { grid: '.tv-catalog-grid', count: '#tv-catalog-count', items: TV_CATALOG, type: 'TV' },
        { grid: '.movie-catalog-grid', count: '#movie-catalog-count', items: MOVIE_CATALOG, type: 'Movie' },
        { grid: '.anime-catalog-grid', count: '#anime-catalog-count', items: ANIME_CATALOG, type: 'Anime' },
    ];
    for (const s of specs) {
        const g = $(s.grid);
        if (!g || g.dataset.q) continue;
        g.dataset.q = '1';
        const items = s.items.filter(t => cleanText(t));
        g.innerHTML = items.map((title, i) => `<div class="media-card catalog-card" data-ci="${i}" title="${esc(title)}">
            <div class="catalog-art">
                <span class="catalog-title">${esc(title)}</span>
                <span class="catalog-tier">${tiers.has(title) ? `TIER ${tiers.get(title)}` : esc(s.type)}</span>
            </div></div>`).join('');
        g.addEventListener('click', (e) => {
            const card = e.target.closest('.catalog-card'); if (!card) return;
            const title = items[parseInt(card.dataset.ci, 10)];
            if (title) openTitleInfo(app, title, s.type);
        });
        if (s.count) $(s.count).textContent = `(${items.length})`;
    }
    buildSources(app);
}

/* ---------- discovery / streaming source cards ---------- */
// shell: true = the site sends X-Frame-Options/CSP frame-ancestors (verified
// 2026-10: JustWatch DENY, YouTube/Tubi/AniList/MAL SAMEORIGIN, RetroCrush
// DENY), so the in-hub viewer would render blank. Those open in the cloaked
// about:blank popup shell instead — never a bare tab. Everything else plays
// inside the hub viewer.
const MEDIA_SOURCES = [
    { name: 'movies.nuxt.space', tag: 'DISCOVER', url: 'https://movies.nuxt.space', desc: 'TMDB-powered movie discovery (the nuxt/movies demo).' },
    { name: 'JustWatch', tag: 'WHERE TO WATCH', url: 'https://www.justwatch.com/us', desc: 'Legal streaming availability across services.', shell: true },
    { name: 'YouTube Free Movies', tag: 'FREE', url: 'https://www.youtube.com/movies', desc: 'Free, ad-supported movies on YouTube.', shell: true },
    { name: 'Tubi', tag: 'FREE', url: 'https://tubitv.com', desc: 'Free legal streaming (US).', shell: true },
    { name: 'Internet Archive Films', tag: 'FREE', url: 'https://archive.org/details/feature_films', desc: 'Public-domain feature films.' },
    { name: 'Plex', tag: 'FREE', url: 'https://watch.plex.tv', desc: 'Free movies and shows, no account needed.' },
    { name: 'Pluto TV', tag: 'FREE', url: 'https://pluto.tv', desc: 'Free live TV and on-demand.' },
    { name: 'Cineverse', tag: 'FREE', url: 'https://www.cineverse.com', desc: 'Free movies and series, no account needed.' },
    { name: 'Odysee', tag: 'FREE VIDEO', url: 'https://odysee.com', desc: 'Decentralized free video, full films and docs.' },
    { name: 'Open Culture', tag: 'DISCOVER', url: 'https://www.openculture.com', desc: 'Curated directory of free movies and culture.' },
    { name: 'RetroCrush', tag: 'ANIME', url: 'https://www.retrocrush.tv', desc: 'Free classic anime streaming (US).', shell: true },
    { name: 'AniList', tag: 'ANIME', url: 'https://anilist.co', desc: 'Anime discovery and tracking.', shell: true },
    { name: 'MyAnimeList', tag: 'ANIME', url: 'https://myanimelist.net', desc: 'Anime and manga database with community lists.', shell: true },
    // --- round 2026-10-10: legal sources (each probed for XFO/CSP) ---
    // Framable (render inside the in-hub viewer):
    { name: 'HIDIVE', tag: 'ANIME', url: 'https://www.hidive.com', desc: 'Legal anime and dubs streaming (account for full catalog).' },
    { name: 'Bilibili', tag: 'ANIME', url: 'https://www.bilibili.tv/en/anime', desc: 'Legal anime and Asian shows (international free tier).' },
    { name: 'Samsung TV Plus', tag: 'FREE LIVE', url: 'https://www.samsungtvplus.com', desc: 'Free live channels and on-demand movies, no account.' },
    { name: 'DOCUMENTARY+', tag: 'DOCS', url: 'https://docplus.com', desc: 'Free ad-supported documentary streaming.' },
    { name: 'Hoopla', tag: 'LIBRARY', url: 'https://www.hoopladigital.com', desc: 'Free movies with a library card (US/CA/AU).' },
    // Framing-blocked (XFO/CSP verified) — cloaked about:blank shell:
    { name: 'Crunchyroll', tag: 'ANIME', url: 'https://www.crunchyroll.com', desc: 'Legal anime simulcasts (free tier + premium).', shell: true },
    { name: 'Kanopy', tag: 'LIBRARY', url: 'https://www.kanopy.com', desc: 'Free films and docs with a library card.' , shell: true },
    { name: 'Reelgood', tag: 'DISCOVER', url: 'https://reelgood.com', desc: 'Streaming guide: where every title is legal to watch.', shell: true },
    { name: 'NBC', tag: 'FREE', url: 'https://www.nbc.com/full-episodes', desc: 'Free full episodes of NBC shows.', shell: true },
    { name: 'ABC', tag: 'FREE', url: 'https://abc.com', desc: 'Free full episodes of ABC shows.', shell: true },
    { name: 'Popcornflix', tag: 'FREE', url: 'https://www.popcornflix.com', desc: 'Free ad-supported movies and TV.', shell: true },
    { name: 'Midnight Pulp', tag: 'FREE', url: 'https://midnightpulp.com', desc: 'Free cult, genre and Asian cinema streaming.', shell: true },
    { name: 'AsianCrush', tag: 'FREE', url: 'https://www.asiancrush.com', desc: 'Free Asian film and drama streaming (US).', shell: true },
];

// Tag labels are translated through i18n (unknown tags pass through as-is).
const SOURCE_TAG_KEYS = {
    'FREE': 'tagFree', 'DISCOVER': 'tagDiscover', 'ANIME': 'tagAnime',
    'WHERE TO WATCH': 'tagWhere', 'FREE VIDEO': 'tagFreeVideo',
    'LIBRARY': 'tagLibrary', 'FREE LIVE': 'tagLive', 'DOCS': 'tagDocs',
};

function openSourceUrl(app, s) {
    if (!s.shell) { app.launchContent(s.url, 'about-blank', s.name); return; }
    openBlockedSite(app, s.url, s.name);
}

function buildSources(app) {
    const g = $('.source-grid');
    if (!g || g.dataset.q) return;
    g.dataset.q = '1';
    const render = () => {
        g.innerHTML = MEDIA_SOURCES.map((s, i) => `<div class="media-card catalog-card" data-si="${i}" title="${esc(s.desc)}">
        <div class="catalog-art">
            <span class="catalog-title">${esc(s.name)}</span>
            <span class="catalog-tier">${esc(t(app, SOURCE_TAG_KEYS[s.tag] || s.tag))}</span>
        </div></div>`).join('');
    };
    render();
    // Re-render on language change (the click listener lives on the grid, so
    // replacing innerHTML keeps it bound).
    (window.__i18nRefresh = window.__i18nRefresh || []).push(render);
    g.addEventListener('click', (e) => {
        const card = e.target.closest('.catalog-card'); if (!card) return;
        const s = MEDIA_SOURCES[parseInt(card.dataset.si, 10)];
        if (s) openSourceUrl(app, s);
    });
}

/* ---------- media search bar + master volume bar ---------- */
function buildMediaSearch(app) {
    const input = $('#media-search');
    if (input && !input.dataset.q) {
        input.dataset.q = '1';
        const count = $('#media-search-count');
        const sel = '.movie-catalog-grid .catalog-card, .tv-catalog-grid .catalog-card, ' +
            '.anime-catalog-grid .catalog-card, .source-grid .catalog-card, ' +
            '.movie-grid .media-card, .tv-grid .media-card';
        const run = () => {
            const q = input.value.trim().toLowerCase();
            let shown = 0, total = 0;
            $$(sel).forEach(c => {
                const titleEl = c.querySelector('.media-title');
                const hay = ((c.getAttribute('title') || '') + ' ' + (titleEl ? titleEl.textContent : '')).toLowerCase();
                const hit = !q || hay.indexOf(q) !== -1;
                c.style.display = hit ? '' : 'none';
                total += 1; if (hit) shown += 1;
            });
            if (count) count.textContent = q ? `${shown}/${total}` : '';
        };
        input.addEventListener('input', run);
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; run(); } });
    }
    const mv = $('#q-media-volume');
    if (mv && !mv.dataset.q) {
        mv.dataset.q = '1';
        mv.value = Math.round((app.settings.volume ?? 0.8) * 100);
        const val = $('#q-media-volume-val');
        if (val) val.textContent = mv.value + '%';
        mv.addEventListener('input', () => {
            const v = mv.value / 100;
            app.settings.volume = v;
            app.saveSettings();
            const sv = $('#q-volume'); if (sv) sv.value = mv.value;
            if (val) val.textContent = mv.value + '%';
            if (app.synthAudioCtx && app._masterGain) { try { app._masterGain.gain.value = 0.02 * v; } catch (e) {} }
            applyMasterVolume(v);
        });
    }
}

/* ---------- forms box tool ---------- */
function buildFormsTool(app) {
    const side = $('.tool-menu-container') || $('.tool-sidebar');
    if (!side || $('[data-tool="forms"]')) return;
    const btn = document.createElement('button');
    btn.className = 'tool-menu-btn'; btn.dataset.tool = 'forms';
    btn.innerHTML = `<i class="fas fa-clipboard-list text-accent"></i> FORMS BOX`;
    btn.addEventListener('click', () => app.showTool && app.showTool('forms'));
    side.appendChild(btn);
    const grid = $('.tool-grid > div:last-child') || $('#panel-tools');
    const panel = document.createElement('div');
    panel.id = 'tool-forms'; panel.className = 'tool-panel';
    panel.innerHTML = `
        <h4 class="text-lg font-bold font-logo text-white mb-4"><i class="fas fa-clipboard-list text-accent mr-2"></i> FORMS BOX</h4>
        <div class="glass-panel p-4 mb-4">
            <div class="text-xs font-bold text-gray-400 uppercase mb-2">New form</div>
            <input id="q-form-title" class="form-input text-xs mb-2" placeholder="Form title">
            <input id="q-form-fields" class="form-input text-xs mb-2" placeholder="Fields, comma separated (e.g. Name, Age, Favorite game)">
            <button id="q-form-make" class="btn-premium text-xs px-4 py-2">CREATE FORM</button>
        </div>
        <div id="q-forms-list" class="space-y-3"></div>`;
    grid.appendChild(panel);
    const draw = () => {
        const forms = store.get('hub_forms', []);
        $('#q-forms-list').innerHTML = forms.length ? forms.map((f, fi) => `
            <div class="glass-panel p-4"><div class="text-sm text-white font-bold mb-2">${esc(f.title)}</div>
            ${f.fields.map((fld, i) => `<input class="form-input text-xs mb-2" data-ff="${fi}-${i}" placeholder="${esc(fld)}">`).join('')}
            <div class="flex gap-2"><button class="btn-premium text-xs px-3 py-1.5" data-fsub="${fi}">SUBMIT</button>
            <button class="btn-outline text-xs px-3 py-1.5" data-fview="${fi}">RESPONSES (${f.responses.length})</button>
            <button class="btn-outline text-xs px-3 py-1.5" data-fdel="${fi}">DELETE</button></div>
            <div class="q-fresp text-xs text-gray-400 mt-2" id="q-fresp-${fi}"></div></div>`).join('')
            : '<div class="text-xs text-gray-500">No forms yet — create one above.</div>';
        $$('#q-forms-list [data-fsub]').forEach((b) => b.addEventListener('click', () => {
            const forms2 = store.get('hub_forms', []);
            const f = forms2[parseInt(b.dataset.fsub, 10)];
            const ans = f.fields.map((fld, i) => $(`[data-ff="${b.dataset.fsub}-${i}"]`)?.value || '');
            f.responses.push({ at: Date.now(), ans }); store.set('hub_forms', forms2); draw();
            toast.show('Response saved.', 'success');
        }));
        $$('#q-forms-list [data-fview]').forEach((b) => b.addEventListener('click', () => {
            const forms2 = store.get('hub_forms', []);
            const f = forms2[parseInt(b.dataset.fview, 10)];
            $(`#q-fresp-${b.dataset.fview}`).innerHTML = f.responses.length
                ? f.responses.map((r) => `<div class="py-1 border-b border-white/5">${r.ans.map((a, i) => `<b>${esc(f.fields[i])}:</b> ${esc(a)}`).join(' · ')}</div>`).join('')
                : 'No responses yet.';
        }));
        $$('#q-forms-list [data-fdel]').forEach((b) => b.addEventListener('click', () => {
            const forms2 = store.get('hub_forms', []);
            forms2.splice(parseInt(b.dataset.fdel, 10), 1); store.set('hub_forms', forms2); draw();
        }));
    };
    $('#q-form-make').addEventListener('click', () => {
        const title = $('#q-form-title').value.trim();
        const fields = $('#q-form-fields').value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (!title || !fields.length) { toast.show('Title + at least one field.', 'error'); return; }
        if (!cleanText(`${title} ${fields.join(' ')}`)) { toast.show('Form text blocked.', 'error'); return; }
        const forms = store.get('hub_forms', []);
        forms.push({ title, fields, responses: [] }); store.set('hub_forms', forms);
        $('#q-form-title').value = ''; $('#q-form-fields').value = ''; draw();
    });
    draw();
}

/* ---------- suggestions floating button (bottom) ---------- */
function buildSuggestButton(app) {
    if ($('#q-suggest-fab')) return;
    const b = document.createElement('button');
    b.id = 'q-suggest-fab';
    b.className = 'q-suggest-fab';
    b.title = 'Suggest a game or feature';
    b.innerHTML = '<i class="fas fa-lightbulb"></i>';
    b.addEventListener('click', () => modals.open(`
        <h2 class="text-xl font-bold text-white font-logo mb-3"><i class="fas fa-lightbulb text-accent"></i> SUGGESTIONS</h2>
        <p class="text-xs text-gray-400 mb-3">Suggest a game, feature, or improvement. Keep it clean.</p>
        <textarea id="q-sug-text" class="form-textarea h-28 text-xs" maxlength="2000" placeholder="I suggest…"></textarea>
        <button id="q-sug-send" class="btn-premium text-xs px-4 py-2 mt-3">SEND SUGGESTION</button>`, {
        '#q-sug-send': async () => {
            const body = `[suggestion] ${$('#q-sug-text').value.trim()}`;
            if (body.length < 15) { toast.show('Write your suggestion first.', 'error'); return; }
            if (!cleanText(body)) { toast.show('Suggestion blocked (keep it clean).', 'error'); return; }
            try { await api(app, 'feedback', { body }); toast.show('Suggestion sent.', 'success'); modals.close(); }
            catch (e) { toast.show(e.message, 'error'); }
        },
    }));
    document.body.appendChild(b);
}

/* ---------- init ---------- */
export function initHubPlus(app, media) {
    try {
        buildStatusBar(app);
        applyDockPosition(app); makeDockDraggable();
        applyI18n(app);
        // AI provider picker: remember the last choice across sessions so the
        // "OPEN AI" button always launches the model the user picked.
        try {
            const provSel = $('#ai-provider-select');
            if (provSel) {
                const saved = localStorage.getItem('hub_ai_provider');
                if (saved && Array.from(provSel.options).some(o => o.value === saved)) provSel.value = saved;
                provSel.addEventListener('change', () => {
                    try { localStorage.setItem('hub_ai_provider', provSel.value); } catch (e) {}
                });
            }
        } catch (e) {}
        // real favorites filter (was: rating>=4 misuse)
        const origFilter = app.getFilteredGames.bind(app);
        app.getFilteredGames = () => {
            const favs = $('#game-favorites-only')?.checked || false;
            if (!favs) return origFilter();
            const favSet = favsGet();
            const all = app.games.filter((g) => favSet.has(g.id));
            const search = $('#game-search-input')?.value.toLowerCase().trim() || '';
            const cat = $('#game-category-filter')?.value || 'all';
            return all.filter((g) => (!search || g.name.toLowerCase().includes(search)) && (cat === 'all' || g.category === cat));
        };
        const origGrid = app.renderGamesGrid.bind(app);
        app.renderGamesGrid = () => { origGrid(); enhanceGameCards(app); unnamedSweep(app); };
        buildGamesHeader(app); enhanceGameCards(app);
        const origDetail = app.showGameDetail.bind(app);
        app.showGameDetail = (id) => { origDetail(id); enhanceDetailModal(app, id); };
        renderAccountPlus(app);
        buildSettingsPlus(app);
        if (media) buildMedia(app, media);
        try { buildCatalogs(app); } catch (e) { console.error('catalog grids failed:', e); }
        try { buildMediaSearch(app); } catch (e) { console.error('media search failed:', e); }
        buildFormsTool(app);
        buildSuggestButton(app);
        applyLite(app);
        autoThemeTick(app); setInterval(() => autoThemeTick(app), 60000);
        // presence heartbeat -> online count
        const beat = async () => {
            try {
                const j = await api(app, 'heartbeat', {});
                const el = $('#q-online'); if (el) el.textContent = j.online;
            } catch (e) {}
        };
        if (app.isLoggedIn && app.isLoggedIn()) beat();
        setInterval(() => { if (app.isLoggedIn && app.isLoggedIn()) beat(); }, 45000);
        // PWA install plumbing
        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window._qInstallPrompt = e; });
        const origAuth = app.updateAuthUI.bind(app);
        app.updateAuthUI = () => { origAuth(); renderAccountPlus(app); };
        window.app = window.app || app;
        // Late-built boxes (settings plus, status bar, grids) carry data-i18n
        // spans — run the walker once more after every builder has run.
        applyI18n(app);
        return true;
    } catch (e) {
        console.error('hub-plus failed:', e);
        return false;
    }
}


