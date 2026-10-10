// PRNG: mulberry32 (docs/ENGINE.md section 3). One generator per trial.
// `draws` counts calls to next(), so tests can prove that a path drew nothing.

export function createPrng(seed) {
  let a = seed >>> 0;
  let draws = 0;
  function next() {
    draws += 1;
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  return {
    next,
    percent: () => next() % 100,
    below: (n) => {
      if (!(n >= 1)) throw new RangeError(`below(n) needs n >= 1, got ${n}`);
      return next() % n;
    },
    get draws() {
      return draws;
    },
  };
}
