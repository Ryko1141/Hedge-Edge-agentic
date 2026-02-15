import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

interface PageBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  showLogo?: boolean;
}

export function PageBackground({ className, children, showLogo = true }: PageBackgroundProps) {
  return (
    <div className={cn("relative min-h-full", className)}>
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary green glow - top right */}
        <div
          className="absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'pulse-glow 4s ease-in-out infinite',
          }}
        />
        
        {/* Secondary green glow - bottom left */}
        <div
          className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full opacity-10"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)',
            filter: 'blur(100px)',
            animation: 'pulse-glow 5s ease-in-out infinite reverse',
          }}
        />
        
        {/* Center accent glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 60%)',
            filter: 'blur(120px)',
          }}
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--primary) / 0.5) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--primary) / 0.5) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
          }}
        />
        
        {/* Diagonal lines accent */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 100px,
              hsl(var(--primary) / 0.3) 100px,
              hsl(var(--primary) / 0.3) 101px
            )`,
          }}
        />
        
        {/* Corner accent shapes */}
        <svg 
          className="absolute top-0 left-0 w-64 h-64 opacity-[0.03] text-primary"
          viewBox="0 0 200 200"
          fill="none"
        >
          <circle cx="0" cy="0" r="150" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="100" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="50" stroke="currentColor" strokeWidth="0.5" />
        </svg>
        
        <svg 
          className="absolute bottom-0 right-0 w-48 h-48 opacity-[0.03] text-primary"
          viewBox="0 0 200 200"
          fill="none"
        >
          <circle cx="200" cy="200" r="150" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="200" cy="200" r="100" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="200" cy="200" r="50" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Logo watermark - top right */}
      {showLogo && (
        <div className="absolute top-6 right-6 pointer-events-none z-[1]">
          <TrendingUp className="w-32 h-32 text-primary opacity-[0.07]" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.15;
            transform: scale(1);
          }
          50% {
            opacity: 0.25;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}
