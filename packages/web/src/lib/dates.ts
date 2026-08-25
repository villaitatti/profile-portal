/**
 * Human-facing date formatting: `02 March 2026` / `02 marzo 2026` — always
 * day-month-year with a zero-padded day and the full month name in the UI
 * language, never an ambiguous numeric format. Machine-facing dates (API
 * payloads, form values) stay ISO 8601 and do not go through here.
 */

const LOCALE_BY_LANG: Record<string, string> = {
  en: 'en-GB', // en-GB gives day-month-year order
  it: 'it-IT',
};

function resolveLocale(lang: string): string {
  return LOCALE_BY_LANG[lang] ?? LOCALE_BY_LANG.en;
}

function toDate(value: string | number | Date): Date | null {
  // Date-only ISO strings ("2026-04-24") parse as UTC midnight via new Date(),
  // which displays as the previous day in timezones west of UTC. Construct a
  // local date instead so the calendar day survives formatting.
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      const [, year, month, day] = match;
      const local = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(local.getTime()) ? null : local;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `02 March 2026` (en) / `02 marzo 2026` (it). Empty string for invalid input. */
export function formatHumanDate(
  value: string | number | Date | null | undefined,
  lang: string
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(resolveLocale(lang), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** `02 March 2026, 14:30` — human date plus localized 24-hour time. */
export function formatHumanDateTime(
  value: string | number | Date | null | undefined,
  lang: string
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = toDate(value);
  if (!date) return '';
  const day = formatHumanDate(date, lang);
  const time = new Intl.DateTimeFormat(resolveLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${day}, ${time}`;
}
