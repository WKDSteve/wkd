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

/** The role a form plays in the variants block of an app page. */
export type FormRole = 'native' | 'web' | 'plugin';

export const FORM_LABELS: Record<FormRole, string> = {
  native: 'Native app',
  web: 'Web',
  plugin: 'Neovim plugin',
};

/**
 * Every form of the product an entry belongs to, the entry itself included:
 * the native app, then its web variants, then the plugin of its family. The
 * page of an app and the page of its web variant show the same list. Empty
 * when the entry stands alone (a kit, an app with no other form), so the page
 * shows no block of one.
 */
export function variantsOf<T extends AppLike>(
  items: readonly T[],
  entry: AppLike,
): { role: FormRole; item: T }[] {
  const appSlug = entry.kind === 'app' ? entry.slug : entry.kind === 'web' ? entry.variantOf : null;
  const app = items.find((i) => i.kind === 'app' && i.slug === appSlug);
  if (!app) return [];
  const web = items.filter((i) => i.kind === 'web' && i.variantOf === app.slug).sort(byName);
  const plugins = items
    .filter((i) => i.kind === 'plugin' && app.family !== null && i.family === app.family)
    .sort(byName);
  const forms = [
    { role: 'native' as const, item: app },
    ...web.map((item) => ({ role: 'web' as const, item })),
    ...plugins.map((item) => ({ role: 'plugin' as const, item })),
  ];
  return forms.length > 1 ? forms : [];
}

/** The facts of an entry the "get it" block reads. */
export interface GetFacts {
  release: { tag: string; url: string } | null;
  rollingUrl: string | null;
}

export interface GetLink {
  label: string;
  url: string;
  note: string;
}

/**
 * The links to a build of an app: the newest version tag, then the rolling
 * build. A tag is named a tag: the repositories do not all publish a release
 * for theirs, so the page does not promise one.
 */
export function getLinks(f: GetFacts): GetLink[] {
  const links: GetLink[] = [];
  if (f.release)
    links.push({ label: f.release.tag, url: f.release.url, note: 'newest version tag' });
  if (f.rollingUrl) {
    links.push({ label: 'latest', url: f.rollingUrl, note: 'rolling build of the main branch' });
  }
  return links;
}

/** What the kicker of an apps page calls an entry that is no app. */
export const KIND_LABELS: Record<Kind, string> = {
  plugin: 'Neovim plugin',
  app: 'App',
  web: 'Web variant',
  kit: 'Foundation',
};

/** How long a status note may run on an app page before it is cut. */
export const NOTE_MAX = 240;

/**
 * A status note short enough for the head of a page: whole sentences while
 * they fit in `max` characters, at least the first one (cut at a word with an
 * ellipsis when even that is too long). Some apps keep a whole progress report
 * in their status paragraph; the README is the place to read all of it.
 */
export function shortNote(note: string, max = NOTE_MAX): string {
  const text = note.trim();
  if (text.length <= max) return text;
  // A sentence ends at . ! or ? followed by a space; a dot inside a word or
  // a path ("key=...,", "v0.1") ends none. "e.g." is rare enough here.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return `${out} …`;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)} …`;
}
