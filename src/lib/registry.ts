// The shape of src/data/registry.json and the rules it must keep. Free of
// Astro and of other project imports on purpose: the loader validates the
// real file with this at build time, and tests/registry.test.ts runs the same
// code under plain `node --test`.

/** What an entry is: a Neovim plugin, a native app, the web variant of an app, or a shared foundation. */
export const KINDS = ['plugin', 'app', 'web', 'kit'] as const;
export type Kind = (typeof KINDS)[number];

export const PLATFORMS = ['windows', 'linux', 'macos'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** One entry as written in the file; everything but `name` may be absent. */
export interface RawEntry {
  name: string;
  kind?: string;
  category?: string;
  family?: string;
  variantOf?: string;
  platforms?: string[];
}

export interface RawRegistry {
  owner: string;
  /** categories of the plugins */
  categories: Record<string, string>;
  /** categories of the apps, kept apart from the plugins' */
  appCategories?: Record<string, string>;
  plugins: RawEntry[];
}

/** One entry after validation: every field decided, nothing left to guess downstream. */
export interface Entry {
  name: string;
  slug: string;
  kind: Kind;
  category: string;
  family: string | null;
  /** slug of the app this entry is the web variant of */
  variantOf: string | null;
  platforms: Platform[];
}

export function slugOf(name: string): string {
  return name.replace(/\.nvim$/, '');
}

const FAMILY = /^[a-z][a-z0-9-]*$/;

function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v);
}

/**
 * Checks the whole file and returns its entries with every default applied.
 * Throws on the first problem, naming the entry: a typo in the one
 * hand-maintained list must fail the build, not ship as a missing page or a
 * link into nothing.
 *
 * - `kind` defaults to `plugin`; any other word than the four known ones is an error.
 * - A plugin's category comes from `categories`, an app's from `appCategories`;
 *   a kit may use either. A web variant names its app in `variantOf` and takes
 *   that app's category unless it states its own.
 * - `variantOf` is only for `web` and must name an entry of kind `app`.
 * - `family` ties a plugin, its app and its web variant together.
 */
export function validateRegistry(reg: RawRegistry): Entry[] {
  const pluginCats = new Set(Object.keys(reg.categories));
  const appCats = new Set(Object.keys(reg.appCategories ?? {}));
  for (const id of appCats) {
    if (pluginCats.has(id)) {
      throw new Error(`registry: category "${id}" is in both categories and appCategories`);
    }
  }

  const byName = new Map<string, RawEntry>();
  const slugs = new Set<string>();
  for (const e of reg.plugins) {
    // A name becomes a directory, a URL segment and a file name (the icon):
    // it starts with a letter or digit, so "." and ".." are no names.
    if (typeof e.name !== 'string' || !/^[A-Za-z0-9][\w.-]*$/.test(e.name)) {
      throw new Error(`registry: "${String(e.name)}" is not a repository name`);
    }
    const slug = slugOf(e.name);
    if (byName.has(e.name) || slugs.has(slug)) {
      throw new Error(`registry: ${e.name} is listed twice (or shares its slug "${slug}")`);
    }
    byName.set(e.name, e);
    slugs.add(slug);
  }

  const kindOf = (e: RawEntry): Kind => {
    const kind = e.kind ?? 'plugin';
    if (!isKind(kind)) {
      throw new Error(`registry: ${e.name} has unknown kind "${kind}" (${KINDS.join(', ')})`);
    }
    return kind;
  };

  const categoryOf = (e: RawEntry, kind: Kind): string => {
    const allowed =
      kind === 'plugin'
        ? pluginCats
        : kind === 'kit'
          ? new Set([...pluginCats, ...appCats])
          : appCats;
    if (e.category === undefined) {
      throw new Error(`registry: ${e.name} (${kind}) has no category`);
    }
    if (!allowed.has(e.category)) {
      const where =
        kind === 'plugin' ? 'categories' : kind === 'kit' ? 'either list' : 'appCategories';
      throw new Error(
        `registry: ${e.name} (${kind}) has category "${e.category}", not in ${where}`,
      );
    }
    return e.category;
  };

  return reg.plugins.map((e): Entry => {
    const kind = kindOf(e);

    let variantOf: string | null = null;
    let target: RawEntry | undefined;
    if (e.variantOf !== undefined) {
      if (kind !== 'web') {
        throw new Error(`registry: ${e.name} has variantOf but is not of kind "web"`);
      }
      target = byName.get(e.variantOf);
      if (!target || target === e || kindOf(target) !== 'app') {
        throw new Error(
          `registry: ${e.name} is a variant of "${e.variantOf}", which is no app here`,
        );
      }
      variantOf = slugOf(target.name);
    } else if (kind === 'web') {
      throw new Error(`registry: ${e.name} (web) does not say which app it is a variant of`);
    }

    const category =
      kind === 'web' && e.category === undefined && target
        ? categoryOf(target, 'app')
        : categoryOf(e, kind);

    if (e.family !== undefined && !FAMILY.test(e.family)) {
      throw new Error(`registry: ${e.name} has family "${e.family}" (lower case, digits, hyphen)`);
    }

    const platforms: Platform[] = [];
    for (const p of e.platforms ?? []) {
      if (!isPlatform(p)) {
        throw new Error(
          `registry: ${e.name} has unknown platform "${p}" (${PLATFORMS.join(', ')})`,
        );
      }
      if (!platforms.includes(p)) platforms.push(p);
    }
    if (platforms.length > 0 && kind === 'plugin') {
      throw new Error(`registry: ${e.name} is a plugin, platforms are for apps`);
    }

    return {
      name: e.name,
      slug: slugOf(e.name),
      kind,
      category,
      family: e.family ?? null,
      variantOf,
      platforms,
    };
  });
}

/** The other members of an entry's family, in registry order; empty without a family. */
export function familyOf(entries: readonly Entry[], entry: Entry): Entry[] {
  if (!entry.family) return [];
  return entries.filter((e) => e.family === entry.family && e.slug !== entry.slug);
}
