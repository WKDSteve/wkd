// The areas of the site and the addresses that moved. Free of Astro and of
// other project imports on purpose: the shells and the build check use it,
// and tests/nav.test.ts runs it under plain `node --test`.

export interface Area {
  /** site-relative page path, '' for the start page */
  page: string;
  /** label in the header of the modern skin */
  label: string;
  /** entry in the sidebar of the TUI skin */
  tui: string;
}

/** Every area the site is planned to have, in the order of the navigation. */
export const AREAS: readonly Area[] = [
  { page: '', label: 'Start', tui: '~/wkd/' },
  { page: 'nvim', label: 'Plugins', tui: 'nvim/' },
  { page: 'apps', label: 'Apps', tui: 'apps/' },
  { page: 'play', label: 'Play', tui: 'play/' },
  { page: 'activity', label: 'Activity', tui: 'activity.log' },
];

/**
 * Addresses that moved, old page to new page (both site-relative, the same in
 * each skin). The old address keeps answering with a page that sends the
 * visitor on; the build check holds every pair to that.
 */
export const MOVED: Readonly<Record<string, string>> = {
  stack: 'nvim/stack',
};

/** The fields of an entry that decide the address of its page. */
export interface PageEntry {
  kind: 'plugin' | 'app' | 'web' | 'kit';
  slug: string;
}

/**
 * The site-relative page of an entry: a plugin has `p/<slug>`, everything
 * else (an app, a web variant, a kit) `apps/<slug>`. Every link to an entry
 * goes through this, so no page links to an address that only sends on.
 */
export function entryPage(e: PageEntry): string {
  return e.kind === 'plugin' ? `p/${e.slug}` : `apps/${e.slug}`;
}

/**
 * The addresses of entries that moved out of the plugin pages: until the apps
 * had pages of their own kind, every entry had `p/<slug>`. Old page to new
 * page, for every entry that is no plugin.
 */
export function movedEntries(entries: readonly PageEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) if (e.kind !== 'plugin') out[`p/${e.slug}`] = entryPage(e);
  return out;
}

/**
 * The page a file under src/pages/ serves, or null for a file that is no page
 * of the modern skin (a dynamic route, a file of the TUI skin):
 * `index.astro` is '', `activity.astro` and `nvim/index.astro` are 'activity'
 * and 'nvim'. `file` is a path that ends in `pages/<...>.astro`, with either
 * kind of slash.
 */
export function pageOfFile(file: string): string | null {
  const rel = file.replace(/\\/g, '/').match(/(?:^|\/)pages\/(.+)\.astro$/)?.[1];
  if (rel === undefined || rel.includes('[')) return null;
  if (rel === 'tui' || rel.startsWith('tui/')) return null;
  return rel === 'index' ? '' : rel.replace(/\/index$/, '');
}

/**
 * The areas that have a page, in navigation order. An area that is planned
 * but not built yet is left out, so the navigation never offers a link into
 * nothing; it appears by itself once its page file exists.
 */
export function builtAreas(pageFiles: readonly string[]): Area[] {
  const pages = new Set(pageFiles.map(pageOfFile).filter((p): p is string => p !== null));
  return AREAS.filter((a) => pages.has(a.page));
}

export interface RouteCheck {
  /** whether a file exists, by its path relative to the build output, forward slashes */
  exists: (path: string) => boolean;
  /** the text of such a file */
  read: (path: string) => string;
  /** base path of the site with a leading and a trailing slash, e.g. '/wkd/' */
  base: string;
  /** slugs of the plugins whose checkout was there to build from */
  pluginSlugs: readonly string[];
  /** the areas the navigation shows */
  areas: readonly Area[];
  /** old page to new page */
  moved: Readonly<Record<string, string>>;
}

const SKIN_PREFIXES = ['', 'tui/'] as const;

/**
 * What a finished build must contain, as a list of problems (empty when all
 * is well). These are the addresses that are already out in the world:
 *
 * - every plugin page, in both skins: the READMEs of the plugins carry a
 *   badge that links to `p/<slug>/`;
 * - every area the navigation shows, in both skins;
 * - every address that moved: a page that sends the visitor to the new one
 *   (meta refresh) and names it as canonical, and the new page itself.
 */
export function routeProblems(c: RouteCheck): string[] {
  const problems: string[] = [];
  const file = (page: string, skin: string): string => `${skin}${page ? `${page}/` : ''}index.html`;

  for (const skin of SKIN_PREFIXES) {
    for (const slug of c.pluginSlugs) {
      const f = file(`p/${slug}`, skin);
      if (!c.exists(f)) problems.push(`plugin page missing: ${f}`);
    }
    for (const area of c.areas) {
      const f = file(area.page, skin);
      if (!c.exists(f)) problems.push(`area "${area.label}" has no page: ${f}`);
    }
    for (const [from, to] of Object.entries(c.moved)) {
      const target = file(to, skin);
      if (!c.exists(target)) problems.push(`${from} moved to ${to}, which has no page: ${target}`);
      const f = file(from, skin);
      if (!c.exists(f)) {
        problems.push(`moved address has no page that sends on: ${f}`);
        continue;
      }
      const html = c.read(f);
      // The refresh goes to the page of the same skin; the canonical address
      // is the one of the modern skin, as on every page.
      const url = `${c.base}${skin}${to}/`;
      const sendsOn = tags(html, 'meta').some(
        (t) =>
          /^refresh$/i.test(attr(t, 'http-equiv') ?? '') && refreshUrl(attr(t, 'content')) === url,
      );
      if (!sendsOn) problems.push(`${f} does not send on to ${url}`);
      const canonical = tags(html, 'link')
        .filter((t) => /^canonical$/i.test(attr(t, 'rel') ?? ''))
        .map((t) => attr(t, 'href') ?? '');
      if (canonical.length === 0) problems.push(`${f} names no canonical address`);
      else if (!canonical.some((h) => h.endsWith(`${c.base}${to}/`))) {
        problems.push(`${f} names ${canonical[0]} as canonical, not ${c.base}${to}/`);
      }
    }
  }
  return problems;
}

/** Every `<name ...>` tag of a document, as written. */
function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
}

/** The value of an attribute of a tag, quoted or not, whatever the order of the attributes. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** The address of an immediate refresh (`0; url=/x/`), or null for a delayed or an empty one. */
function refreshUrl(content: string | null): string | null {
  return content?.match(/^\s*0\s*;\s*url=(.+?)\s*$/i)?.[1] ?? null;
}
