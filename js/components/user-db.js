/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * UserDatabase — private, origin-scoped credential store backed by IndexedDB.
 *
 * Why IndexedDB instead of localStorage:
 *  - It is a real database (object store, transactions), not a flat string map.
 *  - It is origin-scoped and never synced anywhere: data stays in this browser.
 *  - Values are structured clones, not plain-text strings sitting in storage.
 *
 * SECURITY MODEL (unchanged):
 *  - Passwords are NEVER stored. Only PBKDF2 hashes + per-user salts live here.
 *  - There is no way to recover a password from this database — only to verify
 *    a login attempt or overwrite the hash via change-password (which requires
 *    the current password).
 *
 * Behavior:
 *  - loadAll() returns the { lowerUsername: userRecord } map the app expects.
 *  - saveAll(map) rewrites the store in a single transaction (clear + bulk put),
 *    so deletions propagate.
 *  - First run migrates any legacy `hub_users` localStorage entry into the
 *    database, then deletes the localStorage key.
 *  - If IndexedDB is unavailable (very old browser / blocked storage), it falls
 *    back to the legacy localStorage entry so the app keeps working.
 */

const DB_NAME = 'quantum_hub';
const DB_VERSION = 1;
const STORE_NAME = 'users';
const LEGACY_KEY = 'hub_users';

function hasIndexedDB() {
    try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
        return false;
    }
}

function wrapRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
}

class UserDatabase {
    constructor() {
        this._dbPromise = null;
        this._useFallback = !hasIndexedDB();
        this._fallbackCache = null;
    }

    /* Open (and create/upgrade) the database. Cached after first open. */
    open() {
        if (this._useFallback) return Promise.resolve(null);
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            let req;
            try {
                req = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                this._useFallback = true;
                this._dbPromise = null;
                resolve(null);
                return;
            }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                this._useFallback = true;
                this._dbPromise = null;
                resolve(null);
            };
            req.onblocked = () => {
                // Another tab holds the DB open; proceed with what we have.
                try { if (req.result) resolve(req.result); else resolve(null); } catch (e) { resolve(null); }
            };
        });
        return this._dbPromise;
    }

    /* Read a legacy localStorage map, if one exists. */
    _readLegacy() {
        try {
            const raw = localStorage.getItem(LEGACY_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    _writeLegacy(map) {
        try {
            localStorage.setItem(LEGACY_KEY, JSON.stringify(map));
        } catch (e) {}
    }

    _clearLegacy() {
        try {
            localStorage.removeItem(LEGACY_KEY);
        } catch (e) {}
    }

    /* Load the full user map. Migrates legacy storage on first use. */
    async loadAll() {
        const db = await this.open();
        if (!db) {
            if (this._fallbackCache) return this._fallbackCache;
            this._fallbackCache = this._readLegacy();
            return this._fallbackCache;
        }
        try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const [keys, values] = await Promise.all([
                wrapRequest(store.getAllKeys()),
                wrapRequest(store.getAll())
            ]);
            const map = {};
            for (let i = 0; i < keys.length; i++) {
                map[keys[i]] = values[i];
            }
            // One-time migration: import legacy localStorage users (if any),
            // legacy entries win only for usernames not already in the DB.
            const legacy = this._readLegacy();
            const legacyKeys = Object.keys(legacy);
            if (legacyKeys.length > 0) {
                let merged = false;
                for (const k of legacyKeys) {
                    if (!map[k]) { map[k] = legacy[k]; merged = true; }
                }
                this._clearLegacy();
                if (merged) {
                    await this.saveAll(map);
                }
            }
            return map;
        } catch (e) {
            // Storage failure mid-read: fall back, never crash auth.
            this._useFallback = true;
            this._fallbackCache = this._readLegacy();
            return this._fallbackCache;
        }
    }

    /* Persist the full user map in one transaction. */
    async saveAll(map) {
        const safe = (map && typeof map === 'object') ? map : {};
        const db = await this.open();
        if (!db) {
            this._fallbackCache = safe;
            this._writeLegacy(safe);
            return;
        }
        try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.clear();
            for (const key of Object.keys(safe)) {
                store.put(safe[key], key);
            }
            await new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
            });
        } catch (e) {
            // Emergency fallback so credentials are never silently lost.
            this._fallbackCache = safe;
            this._writeLegacy(safe);
        }
    }

    /* Where are credentials currently stored? 'indexeddb' or 'localstorage'. */
    async backend() {
        const db = await this.open();
        return db ? 'indexeddb' : 'localstorage';
    }
}

export const userDB = new UserDatabase();
export default userDB;
