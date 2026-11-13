// What the loader reads about a native app from its checkout, as pure
// functions over text and file lists. Free of Astro and of other project
// imports on purpose, so tests/app-facts.test.ts runs them under plain
// `node --test`; src/loaders/repos.ts does the file and git access.

/** Marks a code span set aside by plainMarkdown(): a private-use character, in no README. */
const HOLD = String.fromCharCode(0xe000);

/**
 * Inline markdown (links, emphasis, code, images) down to plain text. Code
 * spans are set aside first: what is in them is literal, so the stars of
 * `*-desktop` and `*-web` are no emphasis.
 */
export function plainMarkdown(s: string): string {
  const code: string[] = [];
  const hold = (text: string): string => `${HOLD}${code.push(text) - 1}${HOLD}`;
  return s
    .replace(/`([^`]+)`/g, (_, text: string) => hold(text))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g'), (_, i: string) => code[Number(i)] ?? '');
}

/**
 * The paragraph a README marks as its English summary (`**English.** ...`),
 * without the marker, or null. The READMEs of pult and takt are German on
 * purpose and carry exactly one such paragraph; on an English site it is the
 * pitch, whatever comes first in the file. A marker inside a code fence is an
 * example, not the summary.
 */
export function englishParagraph(md: string): string | null {
  const para: string[] = [];
  let inFence = false;
  for (const raw of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      if (para.length) break;
      continue;
    }
    if (inFence) continue;
    const l = raw.trim();
    if (para.length === 0) {
      const m = l.match(/^\*\*English\.?\*\*\.?\s*(.*)$/i);
      if (m) para.push(m[1] ?? '');
    } else if (!l) break;
    else para.push(l);
  }
  const text = para.join(' ').trim();
  return text || null;
}

/**
 * The blockquote a README opens with, its lines joined, or null. This is where
 * the plugins keep their status. Blank lines and the icon (a line that is one
 * image and nothing else) may come before it; anything else first means the
 * README has no opening quote, and a quote further down is prose. Markdown is
 * left in; the caller strips it.
 */
export function leadingQuote(md: string): string | null {
  const quote: string[] = [];
  for (const raw of md.split(/\r?\n/)) {
    if (raw.startsWith('>')) quote.push(raw.replace(/^>\s?/, ''));
    else if (quote.length)
      break; // the first line that is no quote ends it
    else if (raw.trim() && !/^!\[[^\]]*\]\([^)]*\)$/.test(raw.trim())) break;
  }
  const text = quote.join(' ').trim();
  return text || null;
}

/**
 * The status text a page may show, given the one found in the README. A README
 * with an `**English.**` paragraph is written in another language, so its
 * status is too, and this site is English: it shows none rather than a German
 * paragraph. The status word (alpha, beta) is read from the raw text regardless.
 */
export function shownStatusNote(md: string, statusText: string | null): string | null {
  return englishParagraph(md) ? null : statusText;
}

/**
 * The status paragraph of an app README: the first paragraph or blockquote
 * that opens with a bold `Status`, e.g. `> **Status: first milestone.** ...`
 * or `**Status (2026-10-31): Phase 0.** ...`. The plugins put a status quote
 * first in the file; the apps put the icon and the heading first, so theirs
 * is found by its marker instead. Markdown is left in; the caller strips it.
 */
export function statusParagraph(md: string): string | null {
  const para: string[] = [];
  let inFence = false;
  let quoted = false;
  for (const raw of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      if (para.length) break;
      continue;
    }
    if (inFence) continue;
    const isQuote = /^\s*>/.test(raw);
    const l = raw.replace(/^\s*>\s?/, '').trim();
    if (para.length === 0) {
      if (/^\*\*Status\b/i.test(l)) {
        para.push(l);
        quoted = isQuote;
      }
    } else if (!l || isQuote !== quoted) break;
    else para.push(l);
  }
  const text = para.join(' ').trim();
  return text || null;
}

const INSTALL_HEADING = /^#{2,4}\s+(install\b|installation\b|installieren\b)/i;
const INSTALL_MAX = 600;

/**
 * The first fenced code block under a heading that starts with "Install"
 * (`## Install (Windows)`, `### Installation`), up to the next heading of the
 * same or a higher level. Null without such a block, or when the block is
 * longer than a page should quote: then the README is the place to read it.
 */
export function installSnippet(md: string): string | null {
  const lines = md.split(/\r?\n/);
  let level = 0;
  let inFence = false;
  let block: string[] | null = null;
  for (const raw of lines) {
    const fence = /^\s*(```|~~~)/.test(raw);
    if (level === 0) {
      // Headings inside a fence are text of an example, not structure.
      if (fence) inFence = !inFence;
      else if (!inFence && INSTALL_HEADING.test(raw)) level = raw.match(/^#+/)?.[0].length ?? 2;
      continue;
    }
    if (block) {
      if (fence) {
        const text = block.join('\n').trim();
        return text && text.length <= INSTALL_MAX ? text : null;
      }
      block.push(raw);
    } else if (fence) {
      block = [];
    } else {
      const h = raw.match(/^(#+)\s/)?.[1]?.length ?? 0;
      if (h > 0 && h <= level) return null;
    }
  }
  return null;
}

/** Whether a README points at the rolling pre-release (`.../releases/tag/latest`). */
export function mentionsRolling(md: string): boolean {
  // Not `\b`: it would also end "latest" before the hyphen of "latest-build".
  return /\/releases\/(tag|download)\/latest(?![\w-])/.test(md);
}

/**
 * The newest version tag of a repository: tags of the form `vX.Y.Z` (two or
 * three numbers), compared number by number. A pre-release suffix
 * (`v1.0.0-rc1`) and every other tag (`latest`) is no release and is left
 * out. Null when there is none.
 */
export function latestVersionTag(tags: readonly string[]): string | null {
  type Version = [number, number, number];
  const newer = (a: Version, b: Version): boolean => {
    for (let i = 0; i < 3; i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d > 0;
    }
    return false;
  };
  let best: { tag: string; v: Version } | null = null;
  for (const raw of tags) {
    const tag = raw.trim();
    const m = tag.match(/^v(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!m) continue;
    const v: Version = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    if (!best || newer(v, best.v)) best = { tag, v };
  }
  return best?.tag ?? null;
}

export interface TechInput {
  /** repository-relative paths with forward slashes, a few levels deep */
  paths: readonly string[];
  /** contents of the Cargo.toml files among them */
  cargoManifests: readonly string[];
}

/**
 * What an app is built with, read from its files and never typed in: the
 * language from the build file that is there, the UI toolkit from the
 * dependencies its Cargo manifests name. Order is language first, then
 * toolkit, so a tile reads "Rust · egui".
 */
export function detectTech({ paths, cargoManifests }: TechInput): string[] {
  const base = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
  const has = (test: (name: string, path: string) => boolean): boolean =>
    paths.some((p) => test(base(p), p));
  const dep = (name: RegExp): boolean => cargoManifests.some((m) => name.test(m));

  const tech: string[] = [];
  if (has((n) => n === 'Cargo.toml')) tech.push('Rust');
  if (has((n) => n === 'CMakeLists.txt')) tech.push('C++');
  // A small C# tool may be built by a script, without a project file.
  if (has((n) => n.endsWith('.csproj') || n.endsWith('.cs'))) tech.push('C#');
  if (has((n) => n === 'tauri.conf.json') || dep(/^\s*tauri\s*=/m)) tech.push('Tauri');
  if (dep(/^\s*(eframe|egui)\s*=/m)) tech.push('egui');
  return tech;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/**
 * The id of a repository's icon, which names its folder and its files:
 * `assets/icons/<id>/png/<id>-128.png`. A plugin `x.nvim` keeps it as `x-nvim`
 * (the icon tool of the workshop has no dot in an id); an app is its own id.
 */
export function iconId(repoName: string): string {
  return repoName.replace(/.nvim$/, '-nvim');
}

/** An icon is a tile-sized picture; anything larger is not one. */
export const ICON_MAX_BYTES = 512 * 1024;

/**
 * Whether these bytes are a PNG small enough to be an icon. The loader copies
 * the file from a repository into what the site serves, so it is checked by
 * content, not by its name.
 */
export function isPngIcon(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length || bytes.length > ICON_MAX_BYTES) return false;
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}
