'use client';

import { seededRng } from '@gmr/shared';
import { animate, MotionConfig, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

/** Honours the OS "reduce motion" setting for every motion component. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export const spring = { type: 'spring', stiffness: 420, damping: 32 } as const;

/** A number that counts up (or down) to its value instead of jumping. */
export function CountUp({
  value,
  from,
  duration = 0.9,
  delay = 0,
  className,
}: {
  value: number;
  from?: number;
  duration?: number;
  /** Seconds to wait before counting, e.g. until the number is on screen. */
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const shown = useMotionValue(from ?? value);
  const text = useTransform(shown, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(shown, value, { duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease: [0.2, 0.8, 0.2, 1] });
    return () => controls.stop();
  }, [shown, value, duration, delay, reduced]);
  return <motion.span className={className}>{text}</motion.span>;
}

const confettiColors = ['#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#f43f5e', '#14b8a6'];

/** A short burst of falling confetti, e.g. for the winners. */
export function Confetti({ count = 42, seed = 7 }: { count?: number; seed?: number }) {
  const reduced = useReducedMotion();
  const [pieces] = useState(() => {
    const rng = seededRng(seed);
    return Array.from({ length: count }, (_, i) => ({
      left: rng() * 100,
      size: 6 + rng() * 7,
      drift: (rng() - 0.5) * 160,
      rotate: (rng() - 0.5) * 900,
      delay: rng() * 0.6,
      duration: 2.2 + rng() * 1.6,
      color: confettiColors[i % confettiColors.length],
      round: rng() > 0.7,
    }));
  });
  if (reduced) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={p.round ? 'absolute -top-4 rounded-full' : 'absolute -top-4 rounded-[2px]'}
          style={{ left: `${p.left}%`, width: p.size, height: p.round ? p.size : p.size * 0.5, background: p.color }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: p.drift, rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.25, 0.6, 0.45, 1] }}
        />
      ))}
    </div>
  );
}
