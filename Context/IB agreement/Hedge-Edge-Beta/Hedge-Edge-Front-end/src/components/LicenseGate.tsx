import { useEffect, useState, useRef } from "react";
import { Loader2, Key, AlertCircle, CheckCircle, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GradientText } from "@/components/ui/gradient-text";
import { isElectron } from "@/lib/desktop";

interface LicenseGateProps {
  children: React.ReactNode;
}

type GateState = "loading" | "needs-license" | "validating" | "valid" | "error";

/* ──────────────────────────────────────────────────────────
   Background — matches AnimatedBackground used in Dashboard
   ────────────────────────────────────────────────────────── */
function LicenseBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Base dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(224,18%,4%)] via-[hsl(224,15%,2%)] to-[hsl(224,25%,1%)]" />

      {/* Primary lime glow — top right */}
      <div
        className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full opacity-25 animate-float-fast"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, hsl(var(--primary) / 0.2) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Secondary lime glow — bottom left */}
      <div
        className="absolute -bottom-48 -left-40 w-[650px] h-[650px] rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, hsl(var(--primary) / 0.15) 40%, transparent 70%)",
          filter: "blur(80px)",
          animation: "float-reverse-fast 3.5s ease-in-out infinite",
        }}
      />

      {/* Gold accent — top left */}
      <div
        className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--secondary) / 0.4) 0%, transparent 65%)",
          filter: "blur(70px)",
          animation: "float-fast 4s ease-in-out infinite",
          animationDelay: "0.5s",
        }}
      />

      {/* Small pulsing accent — center */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full opacity-10 animate-pulse-glow"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 60%)",
          filter: "blur(50px)",
        }}
      />

      {/* Pulsing grid */}
      <div
        className="absolute inset-0 opacity-[0.04] animate-grid-pulse"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.3) 0.5px, transparent 0.5px),
            linear-gradient(90deg, hsl(var(--primary) / 0.3) 0.5px, transparent 0.5px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      {/* Diagonal energy lines */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 80px,
            hsl(var(--primary) / 0.4) 80px,
            hsl(var(--primary) / 0.4) 82px
          )`,
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, hsl(224 9% 6% / 0.6) 100%)",
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────────────────── */
export function LicenseGate({ children }: LicenseGateProps) {
  const [state, setState] = useState<GateState>("loading");
  const [licenseKey, setLicenseKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [licenseInfo, setLicenseInfo] = useState<{ plan?: string; expiresAt?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('[LicenseGate] Component mounted, checking license...');
    const timeoutId = setTimeout(() => {
      console.warn('[LicenseGate] License check timeout after 10s');
      if (state === 'loading') {
        setState('needs-license');
      }
    }, 10000);

    checkExistingLicense().finally(() => clearTimeout(timeoutId));
  }, []);

  // Auto-focus input when form appears
  useEffect(() => {
    if (state === "needs-license" || state === "error") {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [state]);

  const checkExistingLicense = async () => {
    setState("loading");
    setErrorMessage("");

    if (!isElectron()) {
      console.log('[LicenseGate] Not running in Electron, skipping license check');
      setState("valid");
      return;
    }

    try {
      console.log('[LicenseGate] Calling window.electronAPI.license.getStatus()');
      const result = await window.electronAPI?.license?.getStatus();
      console.log('[LicenseGate] getStatus result:', result);

      if (result?.success && result.data) {
        const { status, plan, expiresAt } = result.data;

        if (status === "valid") {
          console.log('[LicenseGate] License is valid, allowing access');
          setLicenseInfo({ plan, expiresAt });
          setState("valid");
          return;
        }

        if (status === "expired") {
          setErrorMessage("Your license has expired. Please renew or enter a new license key.");
        } else if (status === "error") {
          setErrorMessage(result.data.errorMessage || "License validation error");
        }
      }

      console.log('[LicenseGate] No valid license, showing input form');
      setState("needs-license");
    } catch (err) {
      console.error("[LicenseGate] Error checking license:", err);
      setState("needs-license");
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanKey = licenseKey.trim().toUpperCase();
    if (!cleanKey) {
      setErrorMessage("Please enter a license key");
      return;
    }

    setState("validating");
    setErrorMessage("");

    try {
      const result = await window.electronAPI?.license?.activate(cleanKey);

      if (result?.success && result.license) {
        const { status, plan, expiresAt } = result.license;

        if (status === "valid") {
          setLicenseInfo({ plan, expiresAt });
          setState("valid");
          return;
        }

        setErrorMessage(result.license.errorMessage || "License validation failed");
        setState("error");
      } else {
        setErrorMessage(result?.error || "Failed to activate license");
        setState("error");
      }
    } catch (err) {
      console.error("[LicenseGate] Activation error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Activation failed");
      setState("error");
    }
  };

  const handleRetry = () => {
    setErrorMessage("");
    setState("needs-license");
  };

  /* ── Valid: pass through ────────────────────────────── */
  if (state === "valid") {
    return <>{children}</>;
  }

  /* ── Loading state ──────────────────────────────────── */
  if (state === "loading") {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <LicenseBackground />
        <motion.div
          className="relative z-10 text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-4 rounded-full border border-primary/20"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-7 rounded-full border border-primary/10 border-dashed"
              />
              <TrendingUp className="w-12 h-12 text-primary" strokeWidth={2.5} />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <h2 className="text-lg font-semibold text-foreground mb-1">Checking License</h2>
            <p className="text-sm text-muted-foreground">Verifying your access…</p>
          </motion.div>
          <motion.div
            className="mt-6 flex justify-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block w-1.5 h-1.5 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
              />
            ))}
          </motion.div>
        </motion.div>
      </div>
    );
  }

  /* ── License form ───────────────────────────────────── */
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <LicenseBackground />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* ── Brand header ─────────────────────────────── */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="inline-flex items-center justify-center mb-5"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="relative">
              {/* Outer orbit ring */}
              <motion.div
                className="absolute -inset-5 rounded-full border border-primary/15"
                animate={{ rotate: 360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              />
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center backdrop-blur-sm">
                <TrendingUp className="w-7 h-7 text-primary" strokeWidth={2.5} />
              </div>
            </div>
          </motion.div>

          <GradientText
            colors={["hsl(120, 100%, 54%)", "hsl(45, 100%, 56%)", "hsl(120, 100%, 54%)"]}
            animationSpeed={5}
            className="text-3xl font-bold tracking-tight"
          >
            HedgeEdge
          </GradientText>
          <p className="text-sm text-muted-foreground mt-1.5 tracking-wide uppercase font-medium">
            Trade Copier
          </p>
        </motion.div>

        {/* ── Card ──────────────────────────────────────── */}
        <motion.div
          className="glass-card rounded-2xl p-7 border border-border/30 relative overflow-hidden"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Subtle top-edge glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent)",
            }}
          />

          {/* Section header */}
          <motion.div
            className="flex items-center gap-3 mb-7"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Key className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground leading-tight">
                Enter License Key
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Activate your HedgeEdge license
              </p>
            </div>
          </motion.div>

          <form onSubmit={handleActivate} className="space-y-5">
            {/* Input */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              <Input
                ref={inputRef}
                type="text"
                placeholder="XXXX - XXXX - XXXX - XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                className="bg-background/60 border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-center text-base tracking-[0.2em] h-12 rounded-xl transition-all duration-200 focus:border-primary/50 focus:ring-1 focus:ring-primary/30 focus:bg-background/80"
                disabled={state === "validating"}
              />
            </motion.div>

            {/* Error message */}
            <AnimatePresence mode="wait">
              {errorMessage && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2.5 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="text-sm text-destructive leading-snug">{errorMessage}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action button */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              {state === "error" ? (
                <Button
                  type="button"
                  onClick={handleRetry}
                  variant="outline"
                  className="w-full h-11 rounded-xl border-border hover:bg-muted/50 transition-all duration-200 active:scale-[0.98]"
                >
                  Try Again
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={state === "validating" || !licenseKey.trim()}
                  className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed glow-primary"
                >
                  {state === "validating" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validating…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
                      Activate License
                    </>
                  )}
                </Button>
              )}
            </motion.div>
          </form>

          {/* Footer */}
          <motion.div
            className="mt-7 pt-5 border-t border-border/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <p className="text-[11px] text-muted-foreground/70 text-center leading-relaxed">
              Your license key was sent to your email after purchase.
              <br />
              Need help?{" "}
              <span className="text-primary/70 hover:text-primary transition-colors cursor-pointer">
                support@hedge-edge.com
              </span>
            </p>
            {licenseInfo?.plan && (
              <p className="text-[11px] text-muted-foreground text-center mt-2.5">
                Plan: {licenseInfo.plan}
                {licenseInfo.expiresAt
                  ? ` · Expires ${new Date(licenseInfo.expiresAt).toLocaleDateString()}`
                  : ""}
              </p>
            )}
          </motion.div>
        </motion.div>

        {/* Version tag */}
        <motion.p
          className="text-center text-[10px] text-muted-foreground/40 mt-6 tracking-wider uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          v1.0.0
        </motion.p>
      </div>
    </div>
  );
}
