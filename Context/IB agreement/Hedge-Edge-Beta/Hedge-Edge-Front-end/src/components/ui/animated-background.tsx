import { cn } from "@/lib/utils";

interface AnimatedBackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

export function AnimatedBackground({ className, children }: AnimatedBackgroundProps) {
  return (
    <div className={cn("relative min-h-screen overflow-hidden", className)}>
      {/* Base dark gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-[hsl(224,18%,4%)] via-[hsl(224,15%,2%)] to-[hsl(224,25%,1%)]" />
      
      {/* Animated energetic orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Primary lime glow - top right with faster movement */}
        <div 
          className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full opacity-25 animate-float-fast"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, hsl(var(--primary) / 0.2) 40%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        
        {/* Secondary lime glow - bottom left */}
        <div 
          className="absolute -bottom-48 -left-40 w-[650px] h-[650px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, hsl(var(--primary) / 0.15) 40%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float-reverse-fast 3.5s ease-in-out infinite',
          }}
        />
        
        {/* Gold accent glow - top left */}
        <div 
          className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, hsl(var(--secondary) / 0.4) 0%, transparent 65%)',
            filter: 'blur(70px)',
            animation: 'float-fast 4s ease-in-out infinite',
            animationDelay: '0.5s',
          }}
        />
        
        {/* Tertiary lime glow - center right */}
        <div 
          className="absolute top-1/2 -right-20 w-[450px] h-[450px] rounded-full opacity-18"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.35) 0%, transparent 65%)',
            filter: 'blur(65px)',
            animation: 'float-reverse-fast 3s ease-in-out infinite',
            animationDelay: '1s',
          }}
        />
        
        {/* Small pulsing accent - bottom right */}
        <div 
          className="absolute bottom-1/3 right-1/3 w-[300px] h-[300px] rounded-full opacity-12 animate-pulse-glow"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 60%)',
            filter: 'blur(50px)',
          }}
        />
      </div>
      
      {/* Energetic scanning grid lines */}
      <div 
        className="fixed inset-0 opacity-[0.08] pointer-events-none animate-scan"
        style={{
          backgroundImage: `
            linear-gradient(0deg, hsl(var(--primary) / 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '100% 20px',
        }}
      />
      
      {/* Pulsing grid pattern */}
      <div 
        className="fixed inset-0 opacity-[0.04] pointer-events-none animate-grid-pulse"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.3) 0.5px, transparent 0.5px),
            linear-gradient(90deg, hsl(var(--primary) / 0.3) 0.5px, transparent 0.5px)
          `,
          backgroundSize: '50px 50px',
        }}
      />
      
      {/* Diagonal energy lines */}
      <div 
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
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
      
      {/* Radial vignette with stronger gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, hsl(224 9% 6% / 0.5) 100%)',
        }}
      />
      
      {/* Dynamic neon glow edge effect */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, hsl(var(--primary) / 0.05) 0%, transparent 20%, transparent 80%, hsl(var(--primary) / 0.03) 100%)',
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
