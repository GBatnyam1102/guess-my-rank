import type { CSSProperties } from 'react';

/** Delay for the n-th item of a staggered `animate-rise` list (works in server components too). */
export function stagger(index: number, stepMs = 55, startMs = 0): CSSProperties {
  return { animationDelay: `${startMs + index * stepMs}ms` };
}
