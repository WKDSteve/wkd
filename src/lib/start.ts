// What the start page says about the workshop as a whole: the figures of its
// statistics and the examples behind its two doors. Free of Astro on purpose,
// so tests/start.test.ts runs it under plain `node --test`.
import { approx } from './approx.ts';
import type { Kind, Stage } from './registry';

/** The fields of an entry this module looks at; a page passes its own richer type through. */
export interface StartItem {
  name: string;
  kind: Kind;
  stage: Stage | null;
  status: string;
  commitCount: number;
  featureCount: number;
  helpTagCount: number;
  testFiles: number;
  release: unknown | null;
  shots: readonly unknown[];
  demos: readonly unknown[];
}

export interface Metric {
  label: string;
  value: string;
}

/** How many figures the page shows at once; the first ones of the pool are the state without script. */
export const SHOWN_STATS = 4;

/**
 * The pool of figures the start page rotates through, over plugins and apps
 * alike. The first four are what the page shows without script, so they are
 * the ones that say what the workshop is: plugins, apps, web variants and
 * the commits behind all of it.
 */
export function workshopStats(items: readonly StartItem[], playCount: number): Metric[] {
  const of = (kind: Kind): StartItem[] => items.filter((i) => i.kind === kind);
  const sum = (list: readonly StartItem[], f: (i: StartItem) => number): number =>
    list.reduce((n, i) => n + f(i), 0);
  const plugins = of('plugin');
  const apps = of('app');
  return [
    { label: 'plugins', value: String(plugins.length) },
    { label: 'apps', value: String(apps.length) },
    { label: 'web variants', value: String(of('web').length) },
    { label: 'commits', value: approx(sum(items, (i) => i.commitCount)) },
    { label: 'repositories', value: String(items.length) },
    { label: 'plugin features', value: approx(sum(plugins, (i) => i.featureCount)) },
    { label: 'help topics', value: approx(sum(plugins, (i) => i.helpTagCount)) },
    { label: 'test files', value: approx(sum(items, (i) => i.testFiles)) },
    { label: 'plugin commits', value: approx(sum(plugins, (i) => i.commitCount)) },
    { label: 'app commits', value: approx(sum(apps, (i) => i.commitCount)) },
    // A tag, not a published release: the repositories say which is which.
    { label: 'apps with a version tag', value: String(apps.filter((a) => a.release).length) },
    {
      label: 'apps ready to show',
      value: String(apps.filter((a) => a.stage === 'showcase').length),
    },
    { label: 'demos recorded', value: String(sum(items, (i) => i.demos.length)) },
    { label: 'screenshots', value: String(sum(items, (i) => i.shots.length)) },
    { label: 'stable', value: String(items.filter((i) => i.status === 'stable').length) },
    { label: 'experiments', value: String(playCount) },
  ];
}

/**
 * The examples behind a door, most worked-on first: plugins by their commits;
 * apps the same way, the ones that are ready to show before the others. The
 * name breaks a tie, so two builds of the same sources agree.
 */
export function doorExamples<T extends StartItem>(
  items: readonly T[],
  kind: 'plugin' | 'app',
  n = 3,
): T[] {
  const rank = (i: T): number => (kind === 'app' && i.stage !== 'showcase' ? 1 : 0);
  return items
    .filter((i) => i.kind === kind)
    .sort(
      (a, b) => rank(a) - rank(b) || b.commitCount - a.commitCount || a.name.localeCompare(b.name),
    )
    .slice(0, n);
}
