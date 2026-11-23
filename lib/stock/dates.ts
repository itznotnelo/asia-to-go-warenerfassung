// Date-only helpers for MHD (expiry) dates. The DB stores them as @db.Date,
// which comes back as a Date at UTC midnight; "today" is the shop's day in
// Europe/Zurich, not the server's UTC day.

const DAY_MS = 86_400_000;
const SHOP_TIME_ZONE = "Europe/Zurich";

/** "2026-11-23" for the shop's current calendar day. */
export function shopToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Parses "YYYY-MM-DD" (what <input type="date"> sends) into a UTC-midnight Date, or null. */
export function parseDateOnly(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** A @db.Date value back to "YYYY-MM-DD". */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "23.11.2026" for a date-only value. */
export function formatDateOnly(date: Date): string {
  const iso = toDateOnly(date);
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Whole days from the shop's today until the expiry date; negative = expired, 0 = expires today. */
export function daysUntil(expiry: Date, now: Date = new Date()): number {
  const today = parseDateOnly(shopToday(now));
  if (!today) throw new Error("could not determine today's date");
  return Math.round((Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()) - today.getTime()) / DAY_MS);
}

/**
 * The first instant after the given shop day ends (Zurich midnight of the
 * next day), for "stock at end of 31.12." queries.
 */
export function endOfShopDay(dateOnly: string): Date | null {
  const day = parseDateOnly(dateOnly);
  if (!day) return null;
  const next = new Date(day.getTime() + DAY_MS);
  // Zurich is UTC+1 or UTC+2; find the offset valid at that midnight.
  for (const offsetHours of [1, 2]) {
    const candidate = new Date(next.getTime() - offsetHours * 3_600_000);
    if (shopToday(candidate) === toDateOnly(next) && shopToday(new Date(candidate.getTime() - 1)) === dateOnly) {
      return candidate;
    }
  }
  return new Date(next.getTime() - 3_600_000);
}
