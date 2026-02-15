import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '@/lib/logger';
import type { LogContext } from '@/lib/logger';

describe('logger', () => {
    beforeEach(() => {
        logger.clearLogs();
        vi.restoreAllMocks();
    });

    // ─── Log Levels ─────────────────────────────────────────────────────

    it('has debug, info, warn, and error methods', () => {
        expect(typeof logger.debug).toBe('function');
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.error).toBe('function');
    });

    it('logs error-level messages', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        logger.error('Test error message');
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs warn-level messages', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        logger.warn('Test warning');
        expect(consoleSpy).toHaveBeenCalled();
    });

    // ─── Log Buffer ─────────────────────────────────────────────────────

    it('stores logs in the buffer', () => {
        logger.error('buffered error');
        const logs = logger.getRecentLogs();
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[logs.length - 1].message).toBe('buffered error');
        expect(logs[logs.length - 1].level).toBe('error');
    });

    it('clearLogs empties the buffer', () => {
        logger.error('will be cleared');
        logger.clearLogs();
        expect(logger.getRecentLogs().length).toBe(0);
    });

    it('getRecentLogs limits count', () => {
        for (let i = 0; i < 10; i++) {
            logger.error(`msg-${i}`);
        }
        const recent = logger.getRecentLogs(3);
        expect(recent.length).toBe(3);
    });

    // ─── Context & Redaction ────────────────────────────────────────────

    it('redacts sensitive keys in metadata', () => {
        logger.error('sensitive test', {
            metadata: {
                username: 'visible',
                password: 'secret123',
                mySecret: 'hidden-secret',
                token: 'tok-xyz',
                normalField: 42,
            },
        });

        const logs = logger.getRecentLogs(1);
        const entry = logs[0];
        const meta = entry.context?.metadata as Record<string, unknown>;

        expect(meta?.username).toBe('visible');
        expect(meta?.normalField).toBe(42);
        expect(meta?.password).toBe('[REDACTED]');
        expect(meta?.mySecret).toBe('[REDACTED]');
        expect(meta?.token).toBe('[REDACTED]');
    });

    it('includes component in context', () => {
        logger.error('component test', { component: 'AuthService' });
        const logs = logger.getRecentLogs(1);
        expect(logs[0].context?.component).toBe('AuthService');
    });

    // ─── Scoped Logger ──────────────────────────────────────────────────

    it('scope() creates a logger with fixed component', () => {
        const scoped = logger.scope('CopierEngine');
        scoped.error('scoped error');

        const logs = logger.getRecentLogs(1);
        expect(logs[0].context?.component).toBe('CopierEngine');
        expect(logs[0].message).toBe('scoped error');
    });

    // ─── Log Entry Structure ────────────────────────────────────────────

    it('log entries have timestamp and level', () => {
        logger.error('structure test');
        const entry = logger.getRecentLogs(1)[0];
        expect(entry.timestamp).toBeDefined();
        expect(entry.level).toBe('error');
        expect(entry.message).toBe('structure test');
    });
});
