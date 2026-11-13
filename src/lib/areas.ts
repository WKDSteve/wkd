// The two areas an entry can belong to, and how a search names them. Free of
// imports on purpose: the client bundle and tests/areas.test.ts both use it.

/** An app, a web variant and a kit are all in the apps area. */
export type EntryArea = 'plugins' | 'apps';

export const AREA_LABELS: Record<EntryArea, string> = { plugins: 'Plugins', apps: 'Apps' };

/** The short mark a commit line carries for its area. */
export const AREA_MARKS: Record<EntryArea, string> = { plugins: 'plugin', apps: 'app' };

/**
 * The kinds of pages (the `kind` filter of the search index) an area holds:
 * the kinds of the registry, and `help` for the help pages of the plugins.
 */
export const AREA_KINDS: Record<EntryArea, readonly string[]> = {
  plugins: ['plugin', 'help'],
  apps: ['app', 'web', 'kit'],
};

export function areaOfKind(kind: string): EntryArea {
  return kind === 'plugin' ? 'plugins' : 'apps';
}

/** What a search hit is called by its kind. */
const KIND_WORDS: Record<string, string> = {
  plugin: 'plugin',
  app: 'app',
  web: 'web variant',
  kit: 'foundation',
  help: 'plugin help',
  play: 'play',
};

/** "plugin · Editing", "app · Media", "play": the kind of a hit, then its category. */
export function hitLabel(kind: string | undefined, category: string | undefined): string {
  return [kind ? (KIND_WORDS[kind] ?? kind) : '', category ?? ''].filter(Boolean).join(' · ');
}

export interface SearchQuery {
  /** what is left to search for */
  query: string;
  /** the area the visitor narrowed the search to, or null for everything */
  area: EntryArea | null;
}

const PREFIXES: Record<string, EntryArea> = {
  plugin: 'plugins',
  plugins: 'plugins',
  app: 'apps',
  apps: 'apps',
};

/**
 * A search may start with `app:` or `plugin:` (plural too, any case) to stay
 * in one area: "app: mixer". A prefix alone searches nothing yet; any other
 * word before a colon ("lib.nvim: async") is part of the query.
 */
export function parseSearch(raw: string): SearchQuery {
  const text = raw.trim();
  const m = text.match(/^([a-z]+):\s*(.*)$/i);
  const area = m ? PREFIXES[(m[1] ?? '').toLowerCase()] : undefined;
  if (!m || !area) return { query: text, area: null };
  return { query: (m[2] ?? '').trim(), area };
}

/** The area an address names with its fragment (`#area-apps`), or null. */
export function areaOfHash(hash: string): EntryArea | 'all' | null {
  const m = hash.match(/^#area-(all|plugins|apps)$/);
  return m ? (m[1] as EntryArea | 'all') : null;
}

/** The argument of `:log`: nothing is everything, a prefix of `plugins` or `apps` that area. */
export function areaOfArg(arg: string): EntryArea | 'all' | null {
  const a = arg.trim().toLowerCase();
  if (!a || a === 'all') return 'all';
  const hits = (Object.keys(AREA_LABELS) as EntryArea[]).filter((k) => k.startsWith(a));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}
