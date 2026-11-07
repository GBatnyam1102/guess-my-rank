export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function pickOne<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length)];
}

/** A shuffle that differs from `avoid`, so a Guesser never starts on the answer (FR-66). */
export function shuffleUnlike(ids: readonly string[], avoid: readonly string[], rng: Rng): string[] {
  if (ids.length < 2) return ids.slice();
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = shuffle(ids, rng);
    if (!sameOrder(candidate, avoid)) return candidate;
  }
  const rotated = avoid.slice(1);
  rotated.push(avoid[0]!);
  return rotated;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Deterministic generator (mulberry32) for tests. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
