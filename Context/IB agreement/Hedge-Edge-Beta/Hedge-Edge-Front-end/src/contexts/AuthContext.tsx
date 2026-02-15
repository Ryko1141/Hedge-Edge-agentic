import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseEnabled, secureSignOut, startSessionMonitoring } from '@/integrations/supabase/client';
import { 
  initializeCsrfProtection,
  isAccountLocked,
  recordLoginAttempt,
  getRemainingLockoutTime,
  sanitizeErrorMessage,
  logSecurityEvent,
  emailSchema,
  loginPasswordSchema,
} from '@/lib/security';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isCloudEnabled: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  csrfToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Initialize CSRF protection on mount
  useEffect(() => {
    const token = initializeCsrfProtection();
    setCsrfToken(token);
  }, []);

  useEffect(() => {
    // If Supabase is not enabled, just mark as loaded (local-only mode)
    if (!isSupabaseEnabled || !supabase) {
      setLoading(false);
      return;
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Start session monitoring when user signs in
        if (event === 'SIGNED_IN' && session) {
          startSessionMonitoring();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Start monitoring if already logged in
      if (session) {
        startSessionMonitoring();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseEnabled || !supabase) {
      return { error: new Error('Cloud authentication is not configured. App runs in local-only mode.') };
    }

    // Validate inputs
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      return { error: new Error(emailResult.error.errors[0].message) };
    }
    
    const passwordResult = loginPasswordSchema.safeParse(password);
    if (!passwordResult.success) {
      return { error: new Error(passwordResult.error.errors[0].message) };
    }

    // Check for account lockout
    if (isAccountLocked(email)) {
      const remainingTime = getRemainingLockoutTime(email);
      const minutes = Math.ceil(remainingTime / 60000);
      logSecurityEvent('login_attempt', { email, blocked: true, reason: 'lockout' });
      return { 
        error: new Error(`Account temporarily locked. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`)
      };
    }

    logSecurityEvent('login_attempt', { email });

    const { error } = await supabase.auth.signInWithPassword({ 
      email: emailResult.data, 
      password 
    });
    
    if (error) {
      recordLoginAttempt(email, false);
      logSecurityEvent('login_failure', { email, error: sanitizeErrorMessage(error) });
      return { error: new Error(sanitizeErrorMessage(error)) };
    }
    
    recordLoginAttempt(email, true);
    logSecurityEvent('login_success', { email });
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    if (!isSupabaseEnabled || !supabase) {
      return { error: new Error('Cloud authentication is not configured. App runs in local-only mode.') };
    }

    // Validate inputs
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      return { error: new Error(emailResult.error.errors[0].message) };
    }
    
    const passwordResult = loginPasswordSchema.safeParse(password);
    if (!passwordResult.success) {
      return { error: new Error(passwordResult.error.errors[0].message) };
    }

    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email: emailResult.data,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    
    if (error) {
      return { error: new Error(sanitizeErrorMessage(error)) };
    }
    
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await secureSignOut();
    // Regenerate CSRF token after logout
    const token = initializeCsrfProtection();
    setCsrfToken(token);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      isCloudEnabled: isSupabaseEnabled,
      signIn, 
      signUp, 
      signOut, 
      csrfToken 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
