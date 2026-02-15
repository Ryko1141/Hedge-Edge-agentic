/**
 * Security Utilities for Hedge Edge
 * 
 * This module provides comprehensive security functions to protect against:
 * - XSS (Cross-Site Scripting)
 * - SQL Injection (handled by Supabase ORM, but we add extra sanitization)
 * - CSRF (Cross-Site Request Forgery)
 * - Input validation attacks
 * - Session hijacking
 */

import { z } from 'zod';
import { logger } from './logger';

// ============================================================================
// XSS PROTECTION
// ============================================================================

/**
 * HTML entities map for encoding
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML entities to prevent XSS attacks
 * Use this when displaying user-generated content
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove all HTML tags from a string
 * More aggressive than escaping - removes tags entirely
 */
export function stripHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a string for safe display
 * Combines stripping dangerous content and escaping
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return '';
  
  // Remove script tags and event handlers
  let sanitized = str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, 'data-blocked:');
  
  return escapeHtml(sanitized);
}

/**
 * Sanitize user input for form fields
 * Less aggressive - allows basic formatting but prevents XSS
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .slice(0, 10000); // Limit length to prevent DoS
}

/**
 * Sanitize URL to prevent javascript: and data: URLs
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  
  const trimmed = url.trim().toLowerCase();
  
  // Block dangerous URL schemes
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return '';
  }
  
  // Only allow http, https, mailto, and relative URLs
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('mailto:') &&
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('#')
  ) {
    // If it doesn't match any safe protocol, assume it's a relative path
    if (trimmed.includes(':')) {
      return ''; // Has a protocol but not a safe one
    }
  }
  
  return url.trim();
}

// ============================================================================
// CSRF PROTECTION
// ============================================================================

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store CSRF token in session storage
 */
export function storeCsrfToken(token: string): void {
  try {
    sessionStorage.setItem('csrf_token', token);
    sessionStorage.setItem('csrf_token_timestamp', Date.now().toString());
  } catch {
    console.error('Failed to store CSRF token');
  }
}

/**
 * Get the current CSRF token
 */
export function getCsrfToken(): string | null {
  try {
    const token = sessionStorage.getItem('csrf_token');
    const timestamp = sessionStorage.getItem('csrf_token_timestamp');
    
    if (!token || !timestamp) return null;
    
    // Token expires after 1 hour
    const tokenAge = Date.now() - parseInt(timestamp, 10);
    if (tokenAge > 3600000) {
      sessionStorage.removeItem('csrf_token');
      sessionStorage.removeItem('csrf_token_timestamp');
      return null;
    }
    
    return token;
  } catch {
    return null;
  }
}

/**
 * Validate a CSRF token
 */
export function validateCsrfToken(token: string): boolean {
  const storedToken = getCsrfToken();
  if (!storedToken || !token) return false;
  
  // Use constant-time comparison to prevent timing attacks
  if (storedToken.length !== token.length) return false;
  
  let result = 0;
  for (let i = 0; i < storedToken.length; i++) {
    result |= storedToken.charCodeAt(i) ^ token.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Initialize CSRF protection - call this on app start
 */
export function initializeCsrfProtection(): string {
  let token = getCsrfToken();
  if (!token) {
    token = generateCsrfToken();
    storeCsrfToken(token);
  }
  return token;
}

// ============================================================================
// SESSION SECURITY
// ============================================================================

/**
 * Session configuration constants
 */
export const SESSION_CONFIG = {
  // Maximum session duration (24 hours)
  MAX_SESSION_DURATION: 24 * 60 * 60 * 1000,
  
  // Idle timeout (30 minutes)
  IDLE_TIMEOUT: 30 * 60 * 1000,
  
  // Token refresh threshold (5 minutes before expiry)
  REFRESH_THRESHOLD: 5 * 60 * 1000,
  
  // Maximum failed login attempts before lockout
  MAX_LOGIN_ATTEMPTS: 5,
  
  // Lockout duration (15 minutes)
  LOCKOUT_DURATION: 15 * 60 * 1000,
};

/**
 * Track last activity timestamp for idle timeout
 */
export function updateLastActivity(): void {
  try {
    sessionStorage.setItem('last_activity', Date.now().toString());
  } catch {
    // Session storage not available
  }
}

/**
 * Check if the session has been idle too long
 */
export function isSessionIdle(): boolean {
  try {
    const lastActivity = sessionStorage.getItem('last_activity');
    if (!lastActivity) return false;
    
    const idleTime = Date.now() - parseInt(lastActivity, 10);
    return idleTime > SESSION_CONFIG.IDLE_TIMEOUT;
  } catch {
    return false;
  }
}

/**
 * Check if the session has exceeded maximum duration
 */
export function isSessionExpired(sessionStart: number): boolean {
  return Date.now() - sessionStart > SESSION_CONFIG.MAX_SESSION_DURATION;
}

/**
 * Rate limiting for login attempts
 *
 * SECURITY NOTE: These localStorage-based functions are a **UX convenience only**.
 * Users CAN clear localStorage to bypass client-side lockout — that's acceptable
 * because the actual security controls are:
 *   1. Supabase Auth's built-in server-side rate limiting
 *   2. The `login_attempts` table + `record_login_attempt()` / `check_account_locked()`
 *      Postgres RPC functions (see fix-14 migration), which are REVOKE'd from anon
 *      and callable only by service_role or authenticated users.
 *   3. Supabase's GoTrue rate limits on /auth/v1/token
 *
 * The server-side RPC is fire-and-forget from here — it runs post-auth via
 * service_role in edge functions or backend, not from the anon-key frontend.
 */
interface LoginAttempt {
  count: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

export function getLoginAttempts(email: string): LoginAttempt {
  try {
    const key = `login_attempts_${email.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return { count: 0, lastAttempt: 0, lockedUntil: null };
}

export function recordLoginAttempt(email: string, success: boolean): void {
  // Client-side UX hint (clearable by user — see security note above)
  try {
    const key = `login_attempts_${email.toLowerCase()}`;
    const attempts = getLoginAttempts(email);
    
    if (success) {
      localStorage.removeItem(key);
      return;
    }
    
    attempts.count++;
    attempts.lastAttempt = Date.now();
    
    if (attempts.count >= SESSION_CONFIG.MAX_LOGIN_ATTEMPTS) {
      attempts.lockedUntil = Date.now() + SESSION_CONFIG.LOCKOUT_DURATION;
    }
    
    localStorage.setItem(key, JSON.stringify(attempts));
  } catch {
    // Ignore storage errors
  }
}

export function isAccountLocked(email: string): boolean {
  const attempts = getLoginAttempts(email);
  if (!attempts.lockedUntil) return false;
  
  if (Date.now() > attempts.lockedUntil) {
    // Lockout expired, clear it
    try {
      localStorage.removeItem(`login_attempts_${email.toLowerCase()}`);
    } catch {
      // Ignore errors
    }
    return false;
  }
  
  return true;
}

export function getRemainingLockoutTime(email: string): number {
  const attempts = getLoginAttempts(email);
  if (!attempts.lockedUntil) return 0;
  return Math.max(0, attempts.lockedUntil - Date.now());
}

// ============================================================================
// INPUT VALIDATION SCHEMAS
// ============================================================================

/**
 * Email validation schema with additional security checks
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Please enter a valid email address')
  .transform((email) => email.toLowerCase().trim())
  .refine(
    (email) => !email.includes('<') && !email.includes('>'),
    'Email contains invalid characters'
  );

/**
 * Password validation schema with strength requirements
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine(
    (password) => /[A-Z]/.test(password),
    'Password must contain at least one uppercase letter'
  )
  .refine(
    (password) => /[a-z]/.test(password),
    'Password must contain at least one lowercase letter'
  )
  .refine(
    (password) => /[0-9]/.test(password),
    'Password must contain at least one number'
  )
  .refine(
    (password) => /[^A-Za-z0-9]/.test(password),
    'Password must contain at least one special character'
  );

/**
 * Simple password schema for login (less strict than registration)
 */
export const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(128, 'Password is too long');

/**
 * Full name validation schema
 */
export const fullNameSchema = z
  .string()
  .max(100, 'Name is too long')
  .transform((name) => sanitizeInput(name))
  .optional();

/**
 * Account name validation schema
 */
export const accountNameSchema = z
  .string()
  .min(1, 'Account name is required')
  .max(100, 'Account name is too long')
  .transform((name) => sanitizeInput(name));

/**
 * Server address validation schema
 */
export const serverAddressSchema = z
  .string()
  .max(255, 'Server address is too long')
  .transform((server) => sanitizeInput(server))
  .optional();

/**
 * Login ID validation (for trading accounts)
 */
export const tradingLoginSchema = z
  .string()
  .max(50, 'Login ID is too long')
  .regex(/^[a-zA-Z0-9_-]*$/, 'Login ID contains invalid characters')
  .optional();

/**
 * Numeric amount validation
 */
export const amountSchema = z
  .number()
  .min(0, 'Amount must be positive')
  .max(100000000, 'Amount is too large');

/**
 * Percentage validation (0-100)
 */
export const percentageSchema = z
  .number()
  .min(0, 'Percentage must be at least 0')
  .max(100, 'Percentage cannot exceed 100');

// ============================================================================
// FILE UPLOAD SECURITY
// ============================================================================

/**
 * Allowed file types and their MIME types
 */
export const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  document: ['application/pdf'],
};

/**
 * Maximum file sizes in bytes
 */
export const MAX_FILE_SIZES: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5MB
  document: 10 * 1024 * 1024, // 10MB
};

/**
 * Validate a file for upload
 */
export function validateFile(
  file: File,
  allowedTypes: 'image' | 'document'
): { valid: boolean; error?: string } {
  // Check file size
  const maxSize = MAX_FILE_SIZES[allowedTypes];
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
    };
  }

  // Check MIME type
  const allowedMimes = ALLOWED_FILE_TYPES[allowedTypes];
  if (!allowedMimes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed`,
    };
  }

  // Check file extension matches MIME type
  const extension = file.name.split('.').pop()?.toLowerCase();
  const validExtensions: Record<string, string[]> = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    document: ['pdf'],
  };

  if (!extension || !validExtensions[allowedTypes].includes(extension)) {
    return {
      valid: false,
      error: 'File extension does not match allowed types',
    };
  }

  // Check for double extensions (e.g., file.jpg.exe)
  const nameParts = file.name.split('.');
  if (nameParts.length > 2) {
    const dangerousExtensions = ['exe', 'js', 'html', 'php', 'sh', 'bat', 'cmd'];
    for (const part of nameParts.slice(0, -1)) {
      if (dangerousExtensions.includes(part.toLowerCase())) {
        return {
          valid: false,
          error: 'Suspicious file name detected',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Generate a safe filename for storage
 */
export function generateSafeFilename(originalName: string): string {
  const extension = originalName.split('.').pop()?.toLowerCase() || '';
  const timestamp = Date.now();
  const randomPart = crypto.getRandomValues(new Uint8Array(8))
    .reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
  
  return `${timestamp}_${randomPart}.${extension}`;
}

// ============================================================================
// SECURITY HEADERS (for reference - set these server-side)
// ============================================================================

/**
 * Recommended security headers
 * These should be set in vercel.json or your server configuration
 */
export const RECOMMENDED_SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Sanitize error messages to prevent information disclosure
 */
export function sanitizeErrorMessage(error: unknown): string {
  // In production, return generic messages
  const isProduction = import.meta.env.PROD;
  
  if (error instanceof Error) {
    // Known safe error messages
    const safeMessages = [
      'Invalid login credentials',
      'Email not confirmed',
      'User already registered',
      'Invalid email or password',
      'Session expired',
      'Network error',
    ];
    
    if (safeMessages.some(msg => error.message.includes(msg))) {
      return error.message;
    }
    
    // In development, show full error
    if (!isProduction) {
      return error.message;
    }
  }
  
  // Generic error for production
  return 'An unexpected error occurred. Please try again.';
}

// --- Security event pipeline (production-capable) ---
interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  details: Record<string, unknown>;
}

const securityEventBuffer: SecurityEvent[] = [];
const MAX_SECURITY_BUFFER = 50;
let securityFlushTimer: ReturnType<typeof setTimeout> | null = null;

function inferSeverity(event: string): SecurityEvent['severity'] {
  if (['xss_attempt', 'csrf_failure'].includes(event)) return 'critical';
  if (['login_failure'].includes(event)) return 'high';
  if (['session_expired'].includes(event)) return 'medium';
  return 'low';
}

async function flushSecurityEvents(): Promise<void> {
  if (securityFlushTimer) {
    clearTimeout(securityFlushTimer);
    securityFlushTimer = null;
  }
  if (securityEventBuffer.length === 0) return;

  const events = securityEventBuffer.splice(0);
  try {
    const bridge = (window as any).electronAPI;
    if (bridge?.security?.logEvents) {
      await bridge.security.logEvents(events);
    }
  } catch {
    // Re-add on failure so events aren't lost
    securityEventBuffer.unshift(...events);
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => flushSecurityEvents());
}

/**
 * Log security events — production-capable with IPC pipeline
 */
export function logSecurityEvent(
  event: 'login_attempt' | 'login_success' | 'login_failure' | 'session_expired' | 'csrf_failure' | 'xss_attempt',
  details?: Record<string, unknown>
): void {
  const severity = inferSeverity(event);
  const secEvent: SecurityEvent = {
    type: event,
    severity,
    timestamp: new Date().toISOString(),
    details: { ...details, userAgent: navigator.userAgent },
  };

  // Always log through centralized logger
  logger.warn(`[Security] ${event}`, secEvent);

  // Buffer for IPC flush
  securityEventBuffer.push(secEvent);

  // Flush immediately for critical events
  if (severity === 'critical') {
    flushSecurityEvents();
    return;
  }

  // Batch flush every 30 seconds
  if (!securityFlushTimer) {
    securityFlushTimer = setTimeout(flushSecurityEvents, 30_000);
  }

  // Flush if buffer full
  if (securityEventBuffer.length >= MAX_SECURITY_BUFFER) {
    flushSecurityEvents();
  }
}
