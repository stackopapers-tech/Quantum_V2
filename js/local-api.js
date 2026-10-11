// (c) Quantum Hub — proprietary hub build. All rights reserved.
/* Device-local backend — replaces the server /api layer so the hub runs
   from any static root (GitHub Pages) or straight off file:// with no
   backend at all. Accounts, OTP codes, the fake dev inbox, sessions,
   profiles, scores, friends, chat, blocks, polls, reports and feedback
   all live in localStorage on this device. */

const K = {
    users: 'hub_local_users',
    otps: 'hub_local_otps',
    sessions: 'hub_local_sessions',
    inbox: 'hub_local_inbox',
    scores: 'hub_local_scores',
    social: 'hub_local_social',
    polls: 'hub_local_polls',
    seeded: 'hub_local_seeded',
    reports: 'hub_local_reports',
    feedback: 'hub_local_feedback'
};

/* Same rules the server enforced, so the UX (messages included) is unchanged. */
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL = 600 * 1000; // 10 minutes
const BOT_REPLY = ['nice one 👌', 'brb, pushing a build…', 'ha! agreed.', 'check the polls tab, wild results today', 'gl on that run 🎮'];

function load(key, fb) {
    try { const v = localStorage.getItem(key); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; }
}
function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
}
function ids(n) {
    let s = '';
    try {
        const a = new Uint8Array(n);
        crypto.getRandomValues(a);
        for (let i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
    } catch (e) {
        while (s.length < n * 2) s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
}
function passwordError(pw) {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password needs an uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password needs a lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password needs a digit.';
    return null;
}
/* PBKDF2-SHA256 when WebCrypto is around (it is on https, localhost and
   file://); a small keyed FNV mix as the sync fallback. localStorage is
   device-only anyway — this guards the file at rest, not a network. */
async function hashPw(pw, salt) {
    try {
        if (self.crypto && crypto.subtle && self.TextEncoder) {
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
            const bits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: enc.encode(salt), iterations: 60000, hash: 'SHA-256' }, key, 256);
            let out = '';
            new Uint8Array(bits).forEach(b => { out += b.toString(16).padStart(2, '0'); });
            return 'pbkdf2:' + out;
        }
    } catch (e) {}
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    const s = salt + '|' + pw + '|' + salt;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = (Math.imul(h2 ^ (c + i), 2246822519) + ((h1 << 5) | (h1 >>> 27))) >>> 0;
    }
    return 'fnv:' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ---------- the fake dev inbox: codes land here, never in a real mailbox ---------- */
function issueCode(ident, purpose) {
    const otps = load(K.otps, {});
    const id = ids(16);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otps[id] = { code, purpose, ident, exp: Date.now() + OTP_TTL };
    save(K.otps, otps);
    const inbox = load(K.inbox, []);
    inbox.unshift({ to: ident, code, purpose, at: Date.now() });
    save(K.inbox, inbox.slice(0, 8));
    return id;
}
function takeCode(otpId, code, purpose) {
    const otps = load(K.otps, {});
    const id = String(otpId || '');
    const rec = otps[id];
    if (!rec) return null;
    if (rec.exp < Date.now()) { delete otps[id]; save(K.otps, otps); return null; }
    const ok = rec.purpose === purpose && String(rec.code) === String(code == null ? '' : code).trim();
    // Wrong code keeps the entry alive (no resend button to rescue a burned
    // code); expiry is the only kill switch — it is device-local anyway.
    if (!ok) return null;
    delete otps[id];
    save(K.otps, otps);
    return rec;
}
export function localInbox() {
    return load(K.inbox, []);
}

/* ---------- users / sessions ---------- */
function allUsers() { return load(K.users, {}); }
function byName(n) { return allUsers()[String(n || '').trim().toLowerCase()] || null; }
function byEmail(e) {
    const low = String(e || '').trim().toLowerCase();
    const users = allUsers();
    for (const k in users) if (users[k].email && users[k].email.toLowerCase() === low) return users[k];
    return null;
}
function sessions() { return load(K.sessions, {}); }
/* Find a user inside a GIVEN users snapshot — mutations must stick to the
   same object that later gets saved, or localStorage re-reads discard them. */
function findUser(users, ident) {
    const s = String(ident || '').trim().toLowerCase();
    if (!s) return null;
    if (users[s]) return users[s];
    for (const k in users) if ((users[k].email || '').toLowerCase() === s) return users[k];
    return null;
}
function authed(token) {
    const s = sessions()[String(token || '')];
    if (!s || s.exp < Date.now()) throw new Error('Sign in first.');
    const u = findUser(allUsers(), s.username);
    if (!u) throw new Error('Sign in first.');
    return u;
}

/* Decoy cast: a few bot accounts + one pending friend request + a poll, so a
   fresh device doesn't show three empty panels. Runs once per browser. */
function ensureSeeded() {
    if (load(K.seeded, false)) return;
    const users = allUsers();
    [['pixel_pilot', 'Pixel Pilot', '#00ff41', 'Racing games > everything. Top times on Escape Road.'],
     ['nova_dev', 'Nova', '#ff007f', 'Ships the hub theme engine. Ask me about the schemes.'],
     ['mia_chen', 'Mia Chen', '#0abde3', 'Podcasts, pixel art and a very slow connection.']
    ].forEach(([u, display, color, bio]) => {
        if (!users[u]) {
            users[u] = {
                username: u, email: u + '@quantum.local', bot: true, verified: true,
                preferences: {}, profile: { display, bio, color, avatar: null }, created: Date.now()
            };
        }
    });
    save(K.users, users);
    if (load(K.polls, null) == null) {
        save(K.polls, [{
            id: 'p-seed-1', question: 'Which scheme should ship as default?',
            options: ['Obsidian', 'Cyberpunk', 'Ice'], counts: [5, 3, 2], votes: {}
        }]);
    }
    save(K.seeded, true);
}
function getSocial(name) {
    const all = load(K.social, {});
    const k = String(name || '').toLowerCase();
    if (!all[k]) {
        all[k] = {
            friends: [], incoming: ['pixel_pilot'], blocks: [],
            chats: {
                pixel_pilot: [{ me: false, from: 'pixel_pilot', body: 'hey — saw your invite. gg on the last run!', at: Date.now() }],
                nova_dev: [{ me: false, from: 'nova_dev', body: 'welcome aboard 🚀 ping me if a theme breaks.', at: Date.now() }]
            }
        };
        save(K.social, all);
    }
    return all[k];
}
function putSocial(name, obj) {
    const all = load(K.social, {});
    all[String(name || '').toLowerCase()] = obj;
    save(K.social, all);
}

/* ---------- auth endpoints (same contract as the old server) ---------- */
async function hRegister(b) {
    ensureSeeded();
    const username = String(b.username || '').trim();
    const email = String(b.email || '').trim();
    const password = String(b.password || '');
    if (!USERNAME_RE.test(username)) throw new Error('Username must be 3-20 characters (letters, digits, _ . -).');
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
    const pe = passwordError(password);
    if (pe) throw new Error(pe);
    const users = allUsers();
    if (users[username.toLowerCase()]) throw new Error('That username is taken.');
    if (byEmail(email)) throw new Error('An account already uses that email.');
    const salt = ids(16);
    const hash = await hashPw(password, salt);
    users[username.toLowerCase()] = {
        username, email, salt, hash, verified: false,
        preferences: {}, profile: { display: '', bio: '', color: '#39ff14', avatar: null },
        created: Date.now()
    };
    save(K.users, users);
    const otp_id = issueCode(email, 'verify');
    return { otp_id, email_sent: true };
}
async function hVerifyEmail(b) {
    const rec = takeCode(b.otp_id, b.code, 'verify');
    if (!rec) throw new Error('Invalid or expired code.');
    const users = allUsers();
    const u = findUser(users, rec.ident);
    if (u) { u.verified = true; save(K.users, users); }
    return {};
}
async function hResend(b) {
    const u = byEmail(String(b.email || '').trim());
    if (!u) throw new Error('No account uses that email.');
    const otp_id = issueCode(u.email, b.purpose === 'login' ? 'login' : 'verify');
    return { otp_id, email_sent: true };
}
async function hLogin(b) {
    ensureSeeded();
    const u = byName(String(b.username || '').trim());
    if (!u) throw new Error('Invalid username or password.');
    const hash = await hashPw(String(b.password || ''), u.salt);
    if (hash !== u.hash) throw new Error('Invalid username or password.');
    // OTP always required — no password-only path.
    const otp_id = issueCode(u.email, 'login');
    return { step: 'code', otp_id, email_sent: true };
}
async function hLoginVerify(b) {
    const rec = takeCode(b.otp_id, b.code, 'login');
    if (!rec) throw new Error('Invalid or expired code.');
    const users = allUsers();
    const u = findUser(users, rec.ident);
    if (!u) throw new Error('Account not found.');
    u.verified = true;
    save(K.users, users);
    const ttl = b.remember === false ? 12 * 3600 : 30 * 86400; // remember me = 30d
    const token = ids(24);
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const all = sessions();
    all[token] = { username: u.username, exp: expiry * 1000 };
    save(K.sessions, all);
    getSocial(u.username); // lazily seeds the decoy friend request/chat
    return { token, expiry, username: u.username, email: u.email, preferences: u.preferences || {} };
}
async function hLogout(b) {
    const all = sessions();
    if (all[String(b.token || '')]) { delete all[String(b.token || '')]; save(K.sessions, all); }
    return {};
}
async function hSession(b) {
    const u = authed(b.token);
    return { username: u.username, email: u.email, preferences: u.preferences || {} };
}
async function hProfileGet(b) {
    const u = authed(b.token);
    const p = u.profile || {};
    return { username: u.username, display: p.display || '', bio: p.bio || '', color: p.color || '#39ff14', avatar: p.avatar || null };
}
async function hProfileSet(b) {
    authed(b.token); // validates the session (throws)
    const users = allUsers();
    const sess = sessions()[String(b.token || '')];
    const u = findUser(users, sess ? sess.username : '');
    if (!u) throw new Error('Sign in first.');
    u.profile = u.profile || {};
    // merge only the keys actually sent (hub-plus omits avatar, app.js may clear it)
    if ('display' in b) u.profile.display = String(b.display || '');
    if ('bio' in b) u.profile.bio = String(b.bio || '');
    if ('color' in b) u.profile.color = String(b.color || '');
    if ('avatar' in b) u.profile.avatar = b.avatar || null;
    save(K.users, users);
    return {};
}

/* ---------- hub-plus endpoints (scores / social / polls / chat) ---------- */
function meMaybe(token) {
    try { return authed(token); } catch (e) { return null; }
}
async function hHub(endpoint, b) {
    const users = allUsers();
    switch (endpoint) {
        case 'scores-top': {
            const list = (load(K.scores, {})[String(b.game || '')] || []).slice()
                .sort((a, c) => c.score - a.score).slice(0, 10);
            return { top: list };
        }
        case 'scores-submit': {
            const me = meMaybe(b.token);
            const who = me ? me.username : 'guest';
            const score = parseInt(b.score, 10);
            if (Number.isNaN(score)) throw new Error('Enter a score.');
            const all = load(K.scores, {});
            const g = String(b.game || '');
            const list = (all[g] || []).filter(r => r.user !== who); // one board slot per player
            list.push({ user: who, score });
            all[g] = list.sort((a, c) => c.score - a.score).slice(0, 50);
            save(K.scores, all);
            return {};
        }
        // hub-plus speaks profile-* too (same handlers as the /api path)
        case 'profile-get':
            return hProfileGet(b);
        case 'profile-set':
            return hProfileSet(b);
        case 'users-search': {
            const me = authed(b.token);
            const q = String(b.q || '').trim().toLowerCase();
            if (q.length < 2) return { users: [] };
            const list = Object.keys(users)
                .map(k => users[k])
                .filter(x => x.username.toLowerCase() !== me.username.toLowerCase() && x.username.toLowerCase().indexOf(q) !== -1)
                .slice(0, 12)
                .map(x => ({ username: x.username }));
            return { users: list };
        }
        case 'friends': {
            const me = authed(b.token);
            const soc = getSocial(me.username);
            const act = String(b.action || '');
            if (act === 'list') {
                return { friends: soc.friends.map(n => ({ username: n })), incoming: soc.incoming.map(n => ({ username: n })) };
            }
            const target = String(b.user || '').trim();
            const tu = users[target.toLowerCase()];
            if (act === 'request') {
                if (!tu) throw new Error('No such user.');
                if (tu.username === me.username) throw new Error("You can't add yourself.");
                if (tu.bot) { // the decoy world answers instantly
                    if (soc.friends.indexOf(tu.username) === -1) soc.friends.push(tu.username);
                } else {
                    const ts = getSocial(tu.username);
                    if (ts.incoming.indexOf(me.username) === -1 && ts.friends.indexOf(me.username) === -1) ts.incoming.push(me.username);
                    putSocial(tu.username, ts);
                }
                putSocial(me.username, soc);
                return {};
            }
            if (act === 'accept') {
                const i = soc.incoming.indexOf(target);
                if (i !== -1) soc.incoming.splice(i, 1);
                if (soc.friends.indexOf(target) === -1) soc.friends.push(target);
                putSocial(me.username, soc);
                return {};
            }
            if (act === 'decline') {
                const i = soc.incoming.indexOf(target);
                if (i !== -1) soc.incoming.splice(i, 1);
                putSocial(me.username, soc);
                return {};
            }
            if (act === 'remove') {
                const i = soc.friends.indexOf(target);
                if (i !== -1) soc.friends.splice(i, 1);
                putSocial(me.username, soc);
                return {};
            }
            throw new Error('Unknown friends action.');
        }
        case 'block': {
            const me = authed(b.token);
            const soc = getSocial(me.username);
            const target = String(b.user || '').trim();
            if (String(b.action || '') === 'block') {
                if (target && soc.blocks.indexOf(target) === -1) soc.blocks.push(target);
                let i = soc.friends.indexOf(target); if (i !== -1) soc.friends.splice(i, 1);
                i = soc.incoming.indexOf(target); if (i !== -1) soc.incoming.splice(i, 1);
            } else {
                const i = soc.blocks.indexOf(target);
                if (i !== -1) soc.blocks.splice(i, 1);
            }
            putSocial(me.username, soc);
            return {};
        }
        case 'blocks-list': {
            const me = authed(b.token);
            return { blocked: getSocial(me.username).blocks.slice() };
        }
        case 'report': {
            const me = meMaybe(b.token);
            const list = load(K.reports, []);
            list.push({ by: me ? me.username : 'guest', target: String(b.target || ''), kind: String(b.kind || ''), detail: String(b.detail || ''), at: Date.now() });
            save(K.reports, list.slice(-200));
            return {};
        }
        case 'polls-list': {
            const me = meMaybe(b.token);
            const who = me ? me.username.toLowerCase() : 'guest';
            const polls = load(K.polls, []);
            return {
                polls: polls.map(p => ({
                    id: p.id, question: p.question, options: p.options, counts: p.counts,
                    mine: (p.votes && p.votes[who] != null) ? p.votes[who] : null
                }))
            };
        }
        case 'polls-create': {
            const me = meMaybe(b.token);
            const question = String(b.question || '').trim();
            const opts = (b.options || []).map(s => String(s).trim()).filter(Boolean);
            if (!question || opts.length < 2) throw new Error('A poll needs a question and 2+ options.');
            const polls = load(K.polls, []);
            polls.unshift({ id: 'p-' + ids(6), question, options: opts, counts: opts.map(() => 0), votes: {} });
            save(K.polls, polls.slice(0, 30));
            void me;
            return {};
        }
        case 'polls-vote': {
            const me = meMaybe(b.token);
            const who = me ? me.username.toLowerCase() : 'guest';
            const polls = load(K.polls, []);
            const p = polls.filter(x => String(x.id) === String(b.id))[0];
            if (!p) throw new Error('Poll not found.');
            const opt = parseInt(b.opt, 10);
            if (!(opt >= 0 && opt < p.options.length)) throw new Error('Bad option.');
            p.votes = p.votes || {};
            const prev = p.votes[who];
            if (prev != null && p.counts[prev] > 0) p.counts[prev]--;
            p.counts[opt] = (p.counts[opt] || 0) + 1;
            p.votes[who] = opt;
            save(K.polls, polls);
            return {};
        }
        case 'chat-history': {
            const me = authed(b.token);
            const soc = getSocial(me.username);
            const who = String(b.user || '');
            return { messages: (soc.chats[who.toLowerCase()] || []).slice() };
        }
        case 'chat-send': {
            const me = authed(b.token);
            const who = String(b.user || '').trim();
            const body = String(b.body || '');
            if (!who || !body) throw new Error('Message not sent.');
            const soc = getSocial(me.username);
            const key = who.toLowerCase();
            soc.chats[key] = soc.chats[key] || [];
            soc.chats[key].push({ me: true, from: me.username, body, at: Date.now() });
            // decoy bots answer immediately so the thread feels alive
            const tu = users[key];
            if (tu && tu.bot) {
                soc.chats[key].push({ me: false, from: tu.username, body: BOT_REPLY[Math.floor(Math.random() * BOT_REPLY.length)], at: Date.now() });
            }
            putSocial(me.username, soc);
            return {};
        }
        case 'feedback': {
            const me = meMaybe(b.token);
            const list = load(K.feedback, []);
            list.push({ by: me ? me.username : 'guest', body: String(b.body || ''), at: Date.now() });
            save(K.feedback, list.slice(-200));
            return {};
        }
        case 'heartbeat': {
            const live = Object.keys(sessions()).filter(k => sessions()[k].exp >= Date.now()).length;
            return { online: Math.max(1, live) };
        }
        default:
            throw new Error('Unknown endpoint: ' + endpoint);
    }
}

/* ---------- entry points used by app.js and hub-plus.js ---------- */
export async function localApi(path, body = {}) {
    ensureSeeded();
    const p = String(path || '').replace(/^\/+/, '');
    const b = body || {};
    switch (p) {
        case 'register': return { ok: true, ...(await hRegister(b)) };
        case 'verify-email': return { ok: true, ...(await hVerifyEmail(b)) };
        case 'resend-code': return { ok: true, ...(await hResend(b)) };
        case 'login': return { ok: true, ...(await hLogin(b)) };
        case 'login/verify': return { ok: true, ...(await hLoginVerify(b)) };
        case 'logout': return { ok: true, ...(await hLogout(b)) };
        case 'session': return { ok: true, ...(await hSession(b)) };
        case 'profile-get': return { ok: true, ...(await hProfileGet(b)) };
        case 'profile-set': return { ok: true, ...(await hProfileSet(b)) };
        default: throw new Error('Unknown endpoint: ' + p);
    }
}

export async function localHubApi(endpoint, body = {}) {
    ensureSeeded();
    return { ok: true, ...(await hHub(String(endpoint || ''), body || {})) };
}
