// How the apps page orders what the registry knows. Free of Astro on purpose,
// so tests/apps.test.ts runs it under plain `node --test`.
import type { Kind, Platform, Stage } from './registry';

/** The fields of an entry this module looks at; a page passes its own richer type through. */
export interface AppLike {
  slug: string;
  name: string;
  kind: Kind;
  family: string | null;
  variantOf: string | null;
  stage: Stage | null;
}

export interface SectionInfo {
  stage: Stage;
  title: string;
  /** directory-style heading of the TUI skin */
  tui: string;
  blurb: string;
}

/** The sections of the apps page, in page order. */
export const SECTIONS: readonly SectionInfo[] = [
  {
    stage: 'showcase',
    title: 'Ready to show',
    tui: 'showcase',
    blurb: 'Programs that stand on their own and can be installed today.',
  },
  {
    stage: 'companion',
    title: 'Companions of the plugins',
    tui: 'companions',
    blurb: 'The same data as a Neovim plugin, in a window or a browser tab of its own.',
  },
  {
    stage: 'building',
    title: 'In the making',
    tui: 'building',
    blurb: 'Early, and honest about it: look, but do not rely on them yet.',
  },
];

const byName = <T extends AppLike>(a: T, b: T): number => a.name.localeCompare(b.name);

/**
 * The apps per section, sorted by name. A section without an app is left out,
 * so the page never shows a heading over nothing. Only entries of kind `app`
 * count: a web variant appears at its app, a kit in a place of its own.
 */
export function appSections<T extends AppLike>(
  items: readonly T[],
): { section: SectionInfo; apps: T[] }[] {
  return SECTIONS.map((section) => ({
    section,
    apps: items.filter((i) => i.kind === 'app' && i.stage === section.stage).sort(byName),
  })).filter((s) => s.apps.length > 0);
}

/** The shared foundations of the apps, sorted by name. */
export function kits<T extends AppLike>(items: readonly T[]): T[] {
  return items.filter((i) => i.kind === 'kit').sort(byName);
}

/**
 * The other forms of an app: the plugin of its family first, then its web
 * variants (named by `variantOf`, whatever their family says).
 */
export function otherForms<T extends AppLike>(items: readonly T[], app: AppLike): T[] {
  const plugins = items
    .filter((i) => i.kind === 'plugin' && app.family !== null && i.family === app.family)
    .sort(byName);
  const web = items.filter((i) => i.kind === 'web' && i.variantOf === app.slug).sort(byName);
  return [...plugins, ...web];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
};

export function platformLabel(p: Platform): string {
  return PLATFORM_LABELS[p];
}

/** "Windows · Rust · egui": where it runs, then what it is built with. */
export function appMeta(platforms: readonly Platform[], tech: readonly string[]): string {
  return [...platforms.map(platformLabel), ...tech].join(' · ');
}
