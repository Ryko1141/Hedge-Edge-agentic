/**
 * Animated Counter Component
 * Adapted from react-bits for Hedge Edge
 * 
 * A smooth, animated number counter that transitions between values.
 */

import { MotionValue, motion, useSpring, useTransform } from 'motion/react';
import type React from 'react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

type PlaceValue = number | '.';

interface NumberProps {
  mv: MotionValue<number>;
  number: number;
  height: number;
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, latest => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) {
      memo -= 10 * height;
    }
    return memo;
  });

  return (
    <motion.span 
      style={{ 
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        y 
      }}
    >
      {number}
    </motion.span>
  );
}

interface DigitProps {
  place: PlaceValue;
  value: number;
  height: number;
  digitStyle?: React.CSSProperties;
}

function DecimalPoint({ height, digitStyle }: { height: number; digitStyle?: React.CSSProperties }) {
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ height, width: 'fit-content', ...digitStyle }}
    >
      .
    </span>
  );
}

function NumericDigit({ place, value, height, digitStyle }: { place: number; value: number; height: number; digitStyle?: React.CSSProperties }) {
  const valueRoundedToPlace = Math.floor(value / place);
  const animatedValue = useSpring(valueRoundedToPlace, {
    stiffness: 100,
    damping: 20,
  });

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  return (
    <span 
      className="relative inline-flex overflow-hidden"
      style={{ 
        height,
        position: 'relative',
        width: '1ch',
        fontVariantNumeric: 'tabular-nums',
        ...digitStyle 
      }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} height={height} />
      ))}
    </span>
  );
}

function Digit({ place, value, height, digitStyle }: DigitProps) {
  // Decimal point digit - render different component to avoid conditional hooks
  if (place === '.') {
    return <DecimalPoint height={height} digitStyle={digitStyle} />;
  }

  // Numeric digit
  return <NumericDigit place={place} value={value} height={height} digitStyle={digitStyle} />;
}

interface AnimatedCounterProps {
  /** The numeric value to display */
  value: number;
  /** Font size in pixels */
  fontSize?: number;
  /** Additional padding */
  padding?: number;
  /** Gap between digits */
  gap?: number;
  /** Text color - uses CSS variable by default */
  textColor?: string;
  /** Font weight */
  fontWeight?: React.CSSProperties['fontWeight'];
  /** Custom className */
  className?: string;
  /** Show gradient fade at top/bottom */
  showGradient?: boolean;
  /** Gradient color (matches background) */
  gradientColor?: string;
}

export function AnimatedCounter({
  value,
  fontSize = 24,
  padding = 0,
  gap = 2,
  textColor = 'inherit',
  fontWeight = 'bold',
  className,
  showGradient = false,
  gradientColor = 'hsl(var(--background))',
}: AnimatedCounterProps) {
  const height = fontSize + padding;
  
  // Generate places array from value
  const places: PlaceValue[] = [...Math.abs(value).toString()].map((ch, i, a) => {
    if (ch === '.') return '.';
    const dotIndex = a.indexOf('.');
    const isInteger = dotIndex === -1;
    const exponent = isInteger ? a.length - i - 1 : i < dotIndex ? dotIndex - i - 1 : -(i - dotIndex);
    return 10 ** exponent;
  });

  const isNegative = value < 0;

  return (
    <span className={cn('relative inline-block', className)}>
      <span 
        className="flex overflow-hidden"
        style={{ 
          fontSize, 
          gap, 
          lineHeight: 1, 
          color: textColor, 
          fontWeight 
        }}
      >
        {isNegative && <span>-</span>}
        {places.map((place, idx) => (
          <Digit key={`${place}-${idx}`} place={place} value={Math.abs(value)} height={height} />
        ))}
      </span>
      {showGradient && (
        <span className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <span 
            style={{ 
              height: 8, 
              background: `linear-gradient(to bottom, ${gradientColor}, transparent)` 
            }} 
          />
          <span 
            style={{ 
              height: 8, 
              background: `linear-gradient(to top, ${gradientColor}, transparent)` 
            }} 
          />
        </span>
      )}
    </span>
  );
}

/**
 * Animated Currency Counter
 * Formats number as currency with animation
 */
interface AnimatedCurrencyProps {
  value: number;
  currency?: string;
  locale?: string;
  fontSize?: number;
  className?: string;
  colorByValue?: boolean;
}

export function AnimatedCurrency({
  value,
  currency = 'USD',
  locale = 'en-US',
  fontSize = 24,
  className,
  colorByValue = false,
}: AnimatedCurrencyProps) {
  const isPositive = value >= 0;
  const textColor = colorByValue 
    ? isPositive ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'
    : 'inherit';

  // Format to get currency symbol and formatted number with commas
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  
  const formattedValue = formatter.format(Math.abs(Math.round(value)));

  return (
    <span 
      className={cn('inline-flex items-center font-bold', className)} 
      style={{ color: textColor, fontSize }}
    >
      {value < 0 && '-'}{formattedValue}
    </span>
  );
}

export default AnimatedCounter;
