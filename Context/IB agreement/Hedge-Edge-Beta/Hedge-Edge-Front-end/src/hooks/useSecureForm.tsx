/**
 * Security-focused React hooks for form handling
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  sanitizeInput, 
  validateCsrfToken, 
  getCsrfToken,
  logSecurityEvent 
} from '@/lib/security';

/**
 * Hook for rate-limited form submissions
 * Prevents rapid-fire submissions that could indicate a bot or attack
 */
export function useRateLimitedSubmit(
  minDelayMs: number = 1000,
  maxAttemptsPerMinute: number = 10
) {
  const lastSubmitRef = useRef<number>(0);
  const attemptsRef = useRef<{ timestamp: number }[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  // Cleanup old attempts periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const oneMinuteAgo = Date.now() - 60000;
      attemptsRef.current = attemptsRef.current.filter(
        (attempt) => attempt.timestamp > oneMinuteAgo
      );
      
      if (attemptsRef.current.length < maxAttemptsPerMinute) {
        setIsBlocked(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [maxAttemptsPerMinute]);

  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    
    // Check minimum delay between submissions
    if (now - lastSubmitRef.current < minDelayMs) {
      setRemainingTime(Math.ceil((minDelayMs - (now - lastSubmitRef.current)) / 1000));
      return false;
    }

    // Check rate limit per minute
    const oneMinuteAgo = now - 60000;
    attemptsRef.current = attemptsRef.current.filter(
      (attempt) => attempt.timestamp > oneMinuteAgo
    );

    if (attemptsRef.current.length >= maxAttemptsPerMinute) {
      setIsBlocked(true);
      logSecurityEvent('csrf_failure', { reason: 'rate_limit_exceeded' });
      return false;
    }

    // Record this attempt
    attemptsRef.current.push({ timestamp: now });
    lastSubmitRef.current = now;
    
    return true;
  }, [minDelayMs, maxAttemptsPerMinute]);

  return { checkRateLimit, isBlocked, remainingTime };
}

/**
 * Hook for secure form handling with CSRF validation
 */
export function useSecureForm<T extends Record<string, string | number | boolean>>(
  initialValues: T,
  onSubmit: (values: T) => Promise<void>,
  options?: {
    validateCsrf?: boolean;
    sanitizeStrings?: boolean;
    rateLimit?: boolean;
  }
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { checkRateLimit, isBlocked } = useRateLimitedSubmit();

  const {
    validateCsrf = true,
    sanitizeStrings = true,
    rateLimit = true,
  } = options || {};

  const handleChange = useCallback(
    (field: keyof T) => (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
      let value: string | number | boolean = e.target.value;
      
      // Handle different input types
      if (e.target.type === 'checkbox') {
        value = (e.target as HTMLInputElement).checked;
      } else if (e.target.type === 'number') {
        value = parseFloat(e.target.value) || 0;
      } else if (sanitizeStrings && typeof value === 'string') {
        value = sanitizeInput(value);
      }

      setValues((prev) => ({ ...prev, [field]: value }));
      
      // Clear error when user starts typing
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [sanitizeStrings, errors]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Rate limit check
      if (rateLimit && !checkRateLimit()) {
        setErrors({ 
          _form: 'Please wait before submitting again' 
        } as Partial<Record<keyof T, string>>);
        return;
      }

      // CSRF validation
      if (validateCsrf) {
        const token = getCsrfToken();
        if (!token || !validateCsrfToken(token)) {
          logSecurityEvent('csrf_failure', { reason: 'invalid_token' });
          setErrors({ 
            _form: 'Security validation failed. Please refresh the page and try again.' 
          } as Partial<Record<keyof T, string>>);
          return;
        }
      }

      setIsSubmitting(true);
      setErrors({});

      try {
        await onSubmit(values);
      } catch (error) {
        console.error('Form submission error:', error);
        setErrors({ 
          _form: error instanceof Error ? error.message : 'An error occurred' 
        } as Partial<Record<keyof T, string>>);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, onSubmit, validateCsrf, rateLimit, checkRateLimit]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  const setFieldValue = useCallback(
    (field: keyof T, value: T[keyof T]) => {
      if (sanitizeStrings && typeof value === 'string') {
        value = sanitizeInput(value) as T[keyof T];
      }
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    [sanitizeStrings]
  );

  const setFieldError = useCallback(
    (field: keyof T, error: string) => {
      setErrors((prev) => ({ ...prev, [field]: error }));
    },
    []
  );

  return {
    values,
    errors,
    isSubmitting,
    isBlocked,
    handleChange,
    handleSubmit,
    reset,
    setFieldValue,
    setFieldError,
  };
}

/**
 * Hook for debounced input to prevent excessive API calls
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for honeypot field detection (bot protection)
 */
export function useHoneypot() {
  const [honeypotValue, setHoneypotValue] = useState('');
  
  const isBot = useCallback(() => {
    // If honeypot field has a value, it's likely a bot
    if (honeypotValue) {
      logSecurityEvent('xss_attempt', { reason: 'honeypot_triggered' });
      return true;
    }
    return false;
  }, [honeypotValue]);

  const HoneypotField = useCallback(
    () => (
      <input
        type="text"
        name="website_url"
        value={honeypotValue}
        onChange={(e) => setHoneypotValue(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        style={{
          position: 'absolute',
          left: '-9999px',
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />
    ),
    [honeypotValue]
  );

  return { isBot, HoneypotField };
}
