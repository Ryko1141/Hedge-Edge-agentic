/**
 * Spotlight Card Component
 * Adapted from react-bits for Hedge Edge
 * 
 * A card with a spotlight effect that follows the mouse cursor.
 */

import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Position {
  x: number;
  y: number;
}

interface SpotlightCardProps extends React.PropsWithChildren {
  /** Additional className */
  className?: string;
  /** Color of the spotlight effect (use rgba or hsla for transparency) */
  spotlightColor?: string;
  /** Whether spotlight is enabled */
  enabled?: boolean;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'hsl(var(--primary) / 0.15)',
  enabled = true,
  style,
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState<number>(0);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = e => {
    if (!divRef.current || isFocused || !enabled) return;

    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    if (!enabled) return;
    setIsFocused(true);
    setOpacity(0.6);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    if (!enabled) return;
    setOpacity(0.6);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative overflow-hidden',
        className
      )}
      style={style}
    >
      {enabled && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out z-0"
          style={{
            opacity,
            background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`
          }}
        />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export default SpotlightCard;
