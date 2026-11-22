// Deterministic pseudo-random numbers. Every system draws from its own named stream
// so adding a feature to one system cannot shift the numbers another system sees.

/** Mulberry32: tiny, fast, and reproducible from a 32-bit seed. */
export function makeRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Float in [lo, hi). */
    range: (lo, hi) => lo + next() * (hi - lo),
    /** Integer in [lo, hi]. */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Weighted pick: weights[i] pairs with list[i]. */
    weighted: (list, weights) => {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < list.length; i++) {
        r -= weights[i];
        if (r <= 0) return list[i];
      }
      return list[list.length - 1];
    },
    shuffle: (list) => {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** FNV-1a over a label, mixed with a seed, so each system gets a stable stream. */
export function hashLabel(seed, label) {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function streamRng(seed, label) {
  return makeRng(hashLabel(seed, label));
}

export const randomSigned = (rng, amount) => rng.range(-amount, amount);