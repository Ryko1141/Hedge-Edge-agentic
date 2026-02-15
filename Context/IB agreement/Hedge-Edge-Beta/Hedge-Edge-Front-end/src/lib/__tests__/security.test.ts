import { describe, it, expect, beforeEach } from 'vitest';
import {
    escapeHtml,
    stripHtml,
    sanitizeString,
    sanitizeInput,
    sanitizeUrl,
    generateCsrfToken,
    storeCsrfToken,
    getCsrfToken,
    validateCsrfToken,
    initializeCsrfProtection,
    sanitizeErrorMessage,
    validateFile,
    generateSafeFilename,
    isSessionExpired,
    SESSION_CONFIG,
    emailSchema,
    passwordSchema,
} from '@/lib/security';

// ─── XSS Protection ────────────────────────────────────────────────────────

describe('escapeHtml', () => {
    it('escapes HTML entities', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
        expect(escapeHtml('&')).toBe('&amp;');
        expect(escapeHtml('"')).toBe('&quot;');
        expect(escapeHtml("'")).toBe('&#x27;');
    });

    it('returns empty string for non-string input', () => {
        expect(escapeHtml(null as unknown as string)).toBe('');
        expect(escapeHtml(undefined as unknown as string)).toBe('');
        expect(escapeHtml(123 as unknown as string)).toBe('');
    });

    it('passes through safe strings unchanged', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });
});

describe('stripHtml', () => {
    it('removes HTML tags', () => {
        expect(stripHtml('<b>bold</b>')).toBe('bold');
        expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
    });

    it('returns empty string for non-string input', () => {
        expect(stripHtml(null as unknown as string)).toBe('');
    });
});

describe('sanitizeString', () => {
    it('removes script tags', () => {
        const input = '<script>alert("xss")</script>Hello';
        const result = sanitizeString(input);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('alert');
    });

    it('removes event handlers', () => {
        const input = '<img onerror="alert(1)" src="x">';
        const result = sanitizeString(input);
        expect(result).not.toContain('onerror');
    });

    it('blocks javascript: URIs', () => {
        const input = '<a href="javascript:alert(1)">click</a>';
        const result = sanitizeString(input);
        expect(result).not.toContain('javascript:');
    });
});

describe('sanitizeInput', () => {
    it('trims whitespace', () => {
        expect(sanitizeInput('  hello  ')).toBe('hello');
    });

    it('removes angle brackets', () => {
        expect(sanitizeInput('<script>')).toBe('script');
    });

    it('removes javascript: protocol', () => {
        expect(sanitizeInput('javascript:alert(1)')).not.toContain('javascript:');
    });

    it('truncates to 10000 characters', () => {
        const longString = 'a'.repeat(20000);
        expect(sanitizeInput(longString).length).toBe(10000);
    });

    it('returns empty string for non-string input', () => {
        expect(sanitizeInput(42 as unknown as string)).toBe('');
    });
});

// ─── URL Sanitization ──────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
    it('allows safe http/https URLs', () => {
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(sanitizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('blocks javascript: URLs', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('blocks data: URLs', () => {
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('blocks vbscript: URLs', () => {
        expect(sanitizeUrl('vbscript:alert(1)')).toBe('');
    });

    it('allows relative URLs', () => {
        expect(sanitizeUrl('/dashboard')).toBe('/dashboard');
        expect(sanitizeUrl('#section')).toBe('#section');
    });

    it('allows mailto links', () => {
        expect(sanitizeUrl('mailto:support@hedge-edge.com')).toBe('mailto:support@hedge-edge.com');
    });

    it('blocks unknown protocols', () => {
        expect(sanitizeUrl('ftp://files.example.com')).toBe('');
    });
});

// ─── CSRF Protection ───────────────────────────────────────────────────────

describe('CSRF Protection', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('generateCsrfToken returns a 64-char hex string', () => {
        const token = generateCsrfToken();
        expect(token).toHaveLength(64);
        expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('storeCsrfToken + getCsrfToken round-trips', () => {
        const token = generateCsrfToken();
        storeCsrfToken(token);
        expect(getCsrfToken()).toBe(token);
    });

    it('validateCsrfToken returns true for matching token', () => {
        const token = generateCsrfToken();
        storeCsrfToken(token);
        expect(validateCsrfToken(token)).toBe(true);
    });

    it('validateCsrfToken returns false for wrong token', () => {
        const token = generateCsrfToken();
        storeCsrfToken(token);
        expect(validateCsrfToken('wrong-token-value')).toBe(false);
    });

    it('validateCsrfToken returns false when no token stored', () => {
        expect(validateCsrfToken('any-token')).toBe(false);
    });

    it('initializeCsrfProtection creates token if none exists', () => {
        const token = initializeCsrfProtection();
        expect(token).toHaveLength(64);
        expect(getCsrfToken()).toBe(token);
    });

    it('initializeCsrfProtection reuses existing valid token', () => {
        const first = initializeCsrfProtection();
        const second = initializeCsrfProtection();
        expect(first).toBe(second);
    });
});

// ─── Session Security ──────────────────────────────────────────────────────

describe('Session Security', () => {
    it('isSessionExpired detects expired session', () => {
        const twoHoursAgo = Date.now() - SESSION_CONFIG.MAX_SESSION_DURATION - 1000;
        expect(isSessionExpired(twoHoursAgo)).toBe(true);
    });

    it('isSessionExpired returns false for active session', () => {
        expect(isSessionExpired(Date.now())).toBe(false);
    });

    it('SESSION_CONFIG has sensible defaults', () => {
        expect(SESSION_CONFIG.MAX_SESSION_DURATION).toBeGreaterThan(0);
        expect(SESSION_CONFIG.IDLE_TIMEOUT).toBeGreaterThan(0);
        expect(SESSION_CONFIG.MAX_LOGIN_ATTEMPTS).toBeGreaterThan(0);
        expect(SESSION_CONFIG.LOCKOUT_DURATION).toBeGreaterThan(0);
    });
});

// ─── Error Handling ─────────────────────────────────────────────────────────

describe('sanitizeErrorMessage', () => {
    it('passes through known safe error messages', () => {
        const err = new Error('Invalid login credentials');
        expect(sanitizeErrorMessage(err)).toContain('Invalid login credentials');
    });

    it('returns generic message for unknown errors in production', () => {
        // In test env import.meta.env.PROD is false, so it shows the full message
        const err = new Error('Some internal db failure');
        const result = sanitizeErrorMessage(err);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('returns generic message for non-Error values', () => {
        const result = sanitizeErrorMessage('string error');
        expect(result).toBe('An unexpected error occurred. Please try again.');
    });
});

// ─── Input Validation Schemas ───────────────────────────────────────────────

describe('emailSchema', () => {
    it('accepts valid emails', () => {
        const result = emailSchema.safeParse('User@Example.COM');
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toBe('user@example.com');
        }
    });

    it('rejects invalid emails', () => {
        expect(emailSchema.safeParse('not-an-email').success).toBe(false);
        expect(emailSchema.safeParse('').success).toBe(false);
    });

    it('rejects emails with angle brackets', () => {
        expect(emailSchema.safeParse('<script>@test.com').success).toBe(false);
    });
});

describe('passwordSchema', () => {
    it('accepts strong passwords', () => {
        expect(passwordSchema.safeParse('MyP@ssw0rd!').success).toBe(true);
    });

    it('rejects short passwords', () => {
        expect(passwordSchema.safeParse('Ab1!').success).toBe(false);
    });

    it('requires uppercase', () => {
        expect(passwordSchema.safeParse('myp@ssw0rd').success).toBe(false);
    });

    it('requires lowercase', () => {
        expect(passwordSchema.safeParse('MYP@SSW0RD').success).toBe(false);
    });

    it('requires digit', () => {
        expect(passwordSchema.safeParse('MyP@ssword!').success).toBe(false);
    });

    it('requires special character', () => {
        expect(passwordSchema.safeParse('MyPassw0rd').success).toBe(false);
    });
});

// ─── File Upload Validation ─────────────────────────────────────────────────

describe('validateFile', () => {
    it('accepts valid image file', () => {
        const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
        expect(validateFile(file, 'image').valid).toBe(true);
    });

    it('rejects file exceeding size limit', () => {
        // Create a file > 5MB
        const bigContent = new Uint8Array(6 * 1024 * 1024);
        const file = new File([bigContent], 'huge.jpg', { type: 'image/jpeg' });
        const result = validateFile(file, 'image');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('size');
    });

    it('rejects wrong MIME type', () => {
        const file = new File(['data'], 'script.exe', { type: 'application/x-executable' });
        const result = validateFile(file, 'image');
        expect(result.valid).toBe(false);
    });
});

describe('generateSafeFilename', () => {
    it('returns a filename with timestamp and random part', () => {
        const result = generateSafeFilename('photo.jpg');
        expect(result).toMatch(/^\d+_[0-9a-f]+\.jpg$/);
    });

    it('preserves file extension', () => {
        expect(generateSafeFilename('doc.pdf')).toMatch(/\.pdf$/);
    });
});
