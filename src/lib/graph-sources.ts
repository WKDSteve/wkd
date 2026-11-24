// The picture of the connections comes as a PNG (also the file the picture links to at full size)
// and, next to it, as AVIF and WebP in two widths, made by scripts/graph-images.mjs. This module is
// the one place that knows the names, so the script and the component agree. Free of Astro.

/** The narrow variant: wide enough for a laptop column and a phone at 2x, a third of the full file. */
export const SMALL_WIDTH = 960;
export const FORMATS = ['avif', 'webp'] as const;
export type Format = (typeof FORMATS)[number];

/** `graphs/map.png` -> `graphs/map` ; anything that is not a PNG name stays as it is. */
function stem(png: string): string {
  return png.replace(/\.png$/i, '');
}

/** The file of one variant: the full width, or the small one. */
export function variantPath(png: string, format: Format, small: boolean): string {
  return `${stem(png)}${small ? `-${SMALL_WIDTH}` : ''}.${format}`;
}

export interface Source {
  type: string;
  srcset: string;
}

/**
 * The `<source>` elements for a picture: AVIF first, then WebP, each with the widths that exist.
 * `url` turns a site-relative path into the address to write; `has` says whether the file is there.
 * No file of a format: no source for it (the PNG of the <img> is the fallback).
 */
export function graphSources(
  png: string,
  width: number,
  url: (path: string) => string,
  has: (path: string) => boolean,
): Source[] {
  const out: Source[] = [];
  for (const format of FORMATS) {
    const entries: string[] = [];
    if (width > SMALL_WIDTH && has(variantPath(png, format, true))) {
      entries.push(`${url(variantPath(png, format, true))} ${SMALL_WIDTH}w`);
    }
    if (has(variantPath(png, format, false))) {
      entries.push(`${url(variantPath(png, format, false))} ${width}w`);
    }
    if (entries.length > 0) out.push({ type: `image/${format}`, srcset: entries.join(', ') });
  }
  return out;
}
