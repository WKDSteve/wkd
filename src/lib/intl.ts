// Display of dates and numbers. One language for the whole build, the one the
// pages declare in <html lang>, so the figures and the page agree.
export const SITE_LANG = 'en';

const day = new Intl.DateTimeFormat(SITE_LANG, { dateStyle: 'medium', timeZone: 'UTC' });
const count = new Intl.NumberFormat(SITE_LANG);
const twoDigits = new Intl.NumberFormat(SITE_LANG, { minimumIntegerDigits: 2, useGrouping: false });

/** A calendar day in UTC for reading ("Nov 24, 2026"); the machine-readable form stays in `datetime`. */
export function formatDay(iso: string): string {
  return day.format(new Date(iso));
}

/** A whole number for reading, with the grouping of the page language. */
export function formatCount(n: number): string {
  return count.format(n);
}

/** Seconds as m:ss, the seconds in two digits. */
export function formatClock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${count.format(Math.floor(s / 60))}:${twoDigits.format(s % 60)}`;
}
