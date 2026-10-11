/* (c) Quantum Hub — proprietary hub build. All rights reserved. */
/**
 * Password Policy Module
 * 
 * Comprehensive, modern password requirements balancing security and usability.
 * Based on NIST SP 800-63B, OWASP ASVS, and current best practices.
 * 
 * Design principles:
 * - Minimum 8 chars, no arbitrary maximum (allow passphrases)
 * - Require diversity but not specific character classes
 * - Block common/breached passwords, sequential patterns, personal info
 * - No forced rotation (expiration only on breach)
 * - Support password managers (paste allowed, no restrictive fields)
 * - Clear, actionable feedback for users
 */

// ============================================================
// Core Data
// ============================================================

// Top 10,000 most common passwords (truncated for bundle size - use full list in production)
const COMMON_PASSWORDS = new Set([
    'password', '123456', '123456789', 'qwerty', 'abc123', 'password1',
    'admin', 'letmein', 'welcome', 'monkey', 'dragon', 'master',
    'shadow', 'superman', 'michael', 'football', 'baseball', 'sunshine',
    'princess', 'starwars', 'whatever', 'trustno1', 'jordan', 'hunter',
    'killer', 'soccer', 'harley', 'batman', 'andrew', 'charlie',
    'ashley', 'daniel', 'thomas', 'michelle', 'jessica', 'mickey',
    'mustang', 'bailey', 'matrix', 'computer', 'internet', 'summer',
    'george', 'christina', 'jennifer', 'robert', 'joshua', 'amanda',
    'stephanie', 'brandon', 'joseph', 'jonathan', 'matthew', 'megan',
    'rachel', 'justin', 'maria', 'heather', 'amanda', 'steven',
    'patrick', 'jack', 'samuel', 'nicole', 'alexander', 'tyler',
    'emily', 'zachary', 'kayla', 'david', 'brittany', 'andrea',
    'melissa', 'kimberly', 'jacob', 'victor', 'william', 'eric',
    'chris', 'ryan', 'pokemon', 'naruto', 'gaming', 'legend',
    'freedom', 'fuckyou', 'iloveyou', 'lovely', 'secret', 'sexy',
    'samsung', 'apple', 'google', 'microsoft', 'amazon', 'facebook',
    'instagram', 'twitter', 'youtube', 'netflix', 'spotify', 'discord',
    'twitch', 'reddit', 'github', 'gitlab', 'stackoverflow', 'steam',
    'epic', 'origin', 'uplay', 'battle', 'arena', 'champion',
    'victory', 'winner', 'loser', 'player', 'gamer', 'pro', 'noob',
    'admin123', 'root', 'administrator', 'test', 'demo', 'guest',
    'user', 'login', 'signin', 'signup', 'register', 'account',
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qazwsx', '1qaz2wsx',
    '1qaz@wsx', '!qaz2wsx', 'password123', 'password1234', 'passw0rd',
    'p@ssw0rd', 'p@$$w0rd', 'pass123', 'pass1234', '123abc', 'abc123!'
]);

// Common keyboard patterns (QWERTY)
const KEYBOARD_PATTERNS = [
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    'qwerty', 'asdfgh', 'zxcvbn',
    'qazwsx', 'wsxedc', 'edcrfv', 'rfvtgb', 'tgbhyn', 'yhnujm',
    'ujmik', 'ikol', 'olp', 'pl',
    '1234567890', '123456789', '12345678', '1234567', '123456',
    '0987654321', '987654321', '87654321', '7654321', '654321',
    '1qaz', '2wsx', '3edc', '4rfv', '5tgb', '6yhn', '7ujm', '8ik', '9ol', '0p'
];

// Sequential characters (ascending/descending)
const SEQUENTIAL_RUNS = [
    'abcdefghijklmnopqrstuvwxyz',
    'zyxwvutsrqponmlkjihgfedcba',
    '0123456789',
    '9876543210'
];

// ============================================================
// Password Validator Class
// ============================================================

export class PasswordPolicy {
    constructor(options = {}) {
        this.minLength = options.minLength || 8;
        this.maxLength = options.maxLength || 128;
        this.requireDiversity = options.requireDiversity !== false;
        this.minUniqueChars = options.minUniqueChars || 4;
        this.checkCommon = options.checkCommon !== false;
        this.checkSequential = options.checkSequential !== false;
        this.checkKeyboard = options.checkKeyboard !== false;
        this.checkPersonalInfo = options.checkPersonalInfo !== false;
        this.maxRepeatedChars = options.maxRepeatedChars || 3;
        this.maxSequentialChars = options.maxSequentialChars || 4;
        
        // For scoring
        this.commonPasswords = options.commonPasswords || COMMON_PASSWORDS;
        this.keyboardPatterns = options.keyboardPatterns || KEYBOARD_PATTERNS;
    }

    /**
     * Validate a password against all policies.
     * @returns {Object} { valid: boolean, errors: string[], warnings: string[], score: number, feedback: string[] }
     */
    validate(password, userContext = {}) {
        const errors = [];
        const warnings = [];
        const feedback = [];
        let score = 0;

        // --- Core Length & Complexity ---
        if (!password || password.length === 0) {
            errors.push('Password is required');
            return { valid: false, errors, warnings, score: 0, feedback: ['Enter a password'] };
        }

        if (password.length < this.minLength) {
            errors.push(`Password must be at least ${this.minLength} characters (currently ${password.length})`);
        } else {
            score += Math.min(20, password.length * 2);
        }

        if (password.length > this.maxLength) {
            errors.push(`Password cannot exceed ${this.maxLength} characters`);
        }

        // Character diversity (NIST: don't require specific classes, but reward variety)
        const hasLower = /[a-z]/.test(password);
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSymbol = /[^a-zA-Z0-9]/.test(password);
        const charTypes = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
        const uniqueChars = new Set(password).size;

        if (this.requireDiversity) {
            if (charTypes < 3) {
                errors.push('Password must contain at least 3 of: lowercase, uppercase, numbers, symbols');
            }
            if (uniqueChars < this.minUniqueChars) {
                warnings.push(`Use more varied characters (${uniqueChars} unique)`);
            }
        }

        // Score for diversity
        score += charTypes * 8;
        score += Math.min(20, uniqueChars * 2);

        // --- Forbidden Elements ---
        
        // Common/breached passwords
        if (this.checkCommon && this.commonPasswords.has(password.toLowerCase())) {
            errors.push('This password is too common. Choose something less predictable.');
        }

        // Personal info
        if (this.checkPersonalInfo && userContext) {
            const personalChecks = [
                { value: userContext.username, label: 'username' },
                { value: userContext.email, label: 'email' },
                { value: userContext.name, label: 'name' },
                { value: userContext.displayName, label: 'display name' }
            ].filter(c => c.value);

            for (const check of personalChecks) {
                const clean = check.value.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (clean.length >= 3 && password.toLowerCase().includes(clean)) {
                    errors.push(`Password cannot contain your ${check.label}`);
                }
            }
        }

        // Repeated characters (aaa, 111, !!!)
        if (this.maxRepeatedChars > 0) {
            const repeatMatch = password.match(new RegExp(`(.)\\1{${this.maxRepeatedChars},}`));
            if (repeatMatch) {
                warnings.push(`Avoid repeating the same character ${this.maxRepeatedChars + 1}+ times`);
            }
        }

        // Sequential characters (abcd, 1234, qwer)
        if (this.checkSequential) {
            const sequential = this._findSequential(password, this.maxSequentialChars);
            if (sequential) {
                warnings.push(`Avoid sequential characters like "${sequential}"`);
            }
        }

        // Keyboard patterns
        if (this.checkKeyboard) {
            const pattern = this._findKeyboardPattern(password);
            if (pattern) {
                warnings.push(`Avoid keyboard patterns like "${pattern}"`);
            }
        }

        // --- Scoring & Feedback ---
        if (password.length >= 16) {
            feedback.push('✓ Excellent length');
            score += 10;
        } else if (password.length >= 12) {
            feedback.push('✓ Good length');
        } else if (password.length >= this.minLength) {
            feedback.push('✓ Meets minimum length');
        }

        if (charTypes === 4) {
            feedback.push('✓ Uses all character types');
        } else if (charTypes === 3) {
            feedback.push('✓ Good character variety');
        }

        if (uniqueChars >= 12) {
            feedback.push('✓ High character diversity');
        }

        // Entropy estimation (rough)
        let pool = 0;
        if (hasLower) pool += 26;
        if (hasUpper) pool += 26;
        if (hasNumber) pool += 10;
        if (hasSymbol) pool += 32;
        const entropy = Math.log2(Math.pow(pool, password.length));
        
        if (entropy >= 80) {
            feedback.push('✓ Very strong (resistant to offline attacks)');
        } else if (entropy >= 60) {
            feedback.push('✓ Strong');
        } else if (entropy >= 40) {
            feedback.push('⚠ Moderate — consider a longer passphrase');
        } else {
            feedback.push('⚠ Weak — use a longer passphrase or more variety');
        }

        // Normalize score 0-100
        score = Math.min(100, Math.max(0, score));

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            score,
            feedback,
            entropy: Math.round(entropy),
            strength: this._strengthLabel(score)
        };
    }

    /**
     * Check for sequential runs (abcd, 1234, etc.)
     */
    _findSequential(str, minLength) {
        const lower = str.toLowerCase();
        for (const run of SEQUENTIAL_RUNS) {
            for (let i = 0; i <= run.length - minLength; i++) {
                const seq = run.slice(i, i + minLength);
                if (lower.includes(seq)) return seq;
            }
        }
        return null;
    }

    /**
     * Check for keyboard patterns
     */
    _findKeyboardPattern(str) {
        const lower = str.toLowerCase();
        for (const pattern of this.keyboardPatterns) {
            if (lower.includes(pattern)) return pattern;
        }
        return null;
    }

    _strengthLabel(score) {
        if (score >= 80) return 'Very Strong';
        if (score >= 60) return 'Strong';
        if (score >= 40) return 'Moderate';
        if (score >= 20) return 'Weak';
        return 'Very Weak';
    }

    /**
     * Get real-time feedback for a password input (for strength meter)
     */
    getStrengthMeter(password, userContext = {}) {
        const result = this.validate(password, userContext);
        return {
            score: result.score,
            strength: result.strength,
            color: this._scoreColor(result.score),
            feedback: result.feedback,
            entropy: result.entropy
        };
    }

    _scoreColor(score) {
        if (score >= 80) return '#22c55e'; // green
        if (score >= 60) return '#84cc16'; // lime
        if (score >= 40) return '#f59e0b'; // amber
        if (score >= 20) return '#f97316'; // orange
        return '#ef4444'; // red
    }
}

// ============================================================
// Failed Attempt Tracker (for lockout)
// ============================================================

export class FailedAttemptTracker {
    constructor(options = {}) {
        this.maxAttempts = options.maxAttempts || 5;
        this.lockoutDuration = options.lockoutDuration || 15 * 60 * 1000; // 15 min
        this.storageKey = options.storageKey || 'hub_failed_logins';
        this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1 hour
    }

    _getStore() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) return JSON.parse(stored);
        } catch (_) {}
        return {};
    }

    _saveStore(store) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(store));
        } catch (_) {}
    }

    _cleanup(store) {
        const now = Date.now();
        for (const [key, data] of Object.entries(store)) {
            if (data.lockedUntil && data.lockedUntil < now) {
                delete store[key];
            } else if (data.attempts && data.lastAttempt < now - this.cleanupInterval) {
                delete store[key];
            }
        }
    }

    /**
     * Record a failed attempt for identifier (username/email/IP)
     * @returns {Object} { locked: boolean, remainingAttempts: number, lockedUntil: number|null }
     */
    recordFailure(identifier) {
        const key = identifier.toLowerCase();
        const store = this._getStore();
        this._cleanup(store);

        const now = Date.now();
        const entry = store[key] || { attempts: 0, lastAttempt: 0, lockedUntil: null };

        // If already locked, extend lockout
        if (entry.lockedUntil && entry.lockedUntil > now) {
            return { 
                locked: true, 
                remainingAttempts: 0, 
                lockedUntil: entry.lockedUntil 
            };
        }

        entry.attempts += 1;
        entry.lastAttempt = now;

        if (entry.attempts >= this.maxAttempts) {
            entry.lockedUntil = now + this.lockoutDuration;
            this._saveStore(store);
            return { 
                locked: true, 
                remainingAttempts: 0, 
                lockedUntil: entry.lockedUntil 
            };
        }

        this._saveStore(store);
        return { 
            locked: false, 
            remainingAttempts: this.maxAttempts - entry.attempts, 
            lockedUntil: null 
        };
    }

    /**
     * Record successful login - clears failure count
     */
    recordSuccess(identifier) {
        const key = identifier.toLowerCase();
        const store = this._getStore();
        if (store[key]) {
            delete store[key];
            this._saveStore(store);
        }
    }

    /**
     * Check if identifier is currently locked
     */
    isLocked(identifier) {
        const key = identifier.toLowerCase();
        const store = this._getStore();
        const entry = store[key];
        if (!entry) return { locked: false, remainingAttempts: this.maxAttempts, lockedUntil: null };
        if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
            return { locked: true, remainingAttempts: 0, lockedUntil: entry.lockedUntil };
        }
        return { locked: false, remainingAttempts: Math.max(0, this.maxAttempts - (entry.attempts || 0)), lockedUntil: null };
    }

    /**
     * Get lockout message for UI
     */
    getLockoutMessage(identifier) {
        const status = this.isLocked(identifier);
        if (!status.locked) return null;
        
        const minutes = Math.ceil((status.lockedUntil - Date.now()) / 60000);
        return `Too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
    }
}

// ============================================================
// Security & Lifecycle
// ============================================================

export const SecurityPolicy = {
    // Session settings
    session: {
        defaultTimeout: 24 * 60 * 60 * 1000,        // 24 hours
        rememberTimeout: 30 * 24 * 60 * 60 * 1000,   // 30 days
        absoluteTimeout: 90 * 24 * 60 * 60 * 1000,   // 90 days max (force re-auth)
        rotateThreshold: 12 * 60 * 60 * 1000         // rotate token after 12h activity
    },

    // Password lifecycle
    password: {
        // No forced expiration (NIST 800-63B)
        // Only require change on: breach, user request, admin reset
        requireChangeOnBreach: true,
        minAge: 0,                    // No minimum age
        historyCount: 5,              // Remember last 5 passwords
        breachCheckEnabled: true      // Integrate with HaveIBeenPwned API in production
    },

    // Rate limiting (per IP/session)
    rateLimit: {
        login: { max: 10, window: 15 * 60 * 1000 },      // 10 per 15 min
        register: { max: 3, window: 60 * 60 * 1000 },    // 3 per hour
        passwordReset: { max: 2, window: 60 * 60 * 1000 } // 2 per hour
    },

    // Client-side storage
    storage: {
        // Never store passwords/tokens in plaintext
        encryptSensitive: true,
        clearOnLogout: true,
        clearOnLockout: false
    },

    // Paste behavior
    paste: {
        allowPaste: true,              // Allow password managers
        allowDragDrop: true,
        warnOnPaste: false             // Don't warn - it's user-friendly
    }
};

// ============================================================
// Convenience: Create default instances
// ============================================================

export const defaultPasswordPolicy = new PasswordPolicy();
export const defaultFailedTracker = new FailedAttemptTracker();

// Export all
export default {
    PasswordPolicy,
    FailedAttemptTracker,
    SecurityPolicy,
    defaultPasswordPolicy,
    defaultFailedTracker,
    COMMON_PASSWORDS,
    KEYBOARD_PATTERNS
};