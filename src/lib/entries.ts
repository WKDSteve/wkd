// The checked registry, once per build, for the components that need to know
// what an entry is (a plugin or an app) from its slug alone, e.g. a commit.
import registry from '../data/registry.json';
import { entryPage } from './nav';
import { type RawRegistry, validateRegistry } from './registry';

const KIND_BY_SLUG = new Map(
  validateRegistry(registry as RawRegistry).map((e) => [e.slug, e.kind] as const),
);

/** The two areas an entry can belong to: an app, a web variant and a kit are all in the apps area. */
export type EntryArea = 'plugins' | 'apps';

/** The short mark a commit line carries for its area. */
export const AREA_MARKS: Record<EntryArea, string> = { plugins: 'plugin', apps: 'app' };

/** The area of the entry with this slug; a slug the registry does not know is taken for a plugin. */
export function areaOfSlug(slug: string): EntryArea {
  return (KIND_BY_SLUG.get(slug) ?? 'plugin') === 'plugin' ? 'plugins' : 'apps';
}

/** The site-relative page of the entry with this slug; a slug the registry does not know is taken for a plugin. */
export function pageOfSlug(slug: string): string {
  return entryPage({ kind: KIND_BY_SLUG.get(slug) ?? 'plugin', slug });
}
