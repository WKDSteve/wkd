// On its own, free of imports: src/lib/format.ts reads the registry (JSON),
// which the modules that run under plain `node --test` cannot.

/**
 * A count as a round, honest floor: "950+" rather than "972". Steps of 10 below
 * a hundred, 50 below a thousand, 100 above -- the figure stays true as the
 * number grows and does not twitch with every commit.
 */
export function approx(n: number): string {
  if (n < 10) return String(n);
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString('en')}+`;
}
