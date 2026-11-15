// Calendar and time helpers.
// Years use astronomical numbering: 1 BCE = 0, 1300 BCE = -1299.

export const J2000 = 2451545.0;
export const CURRENT_YEAR = new Date().getUTCFullYear();

export function bceToAstronomical(yearBCE: number): number {
  return 1 - yearBCE;
}

export function yearsAgo(astroYear: number): number {
  return CURRENT_YEAR - astroYear;
}

export function astroYearFromAgo(ago: number): number {
  return CURRENT_YEAR - ago;
}

/** Julian calendar before 15 Oct 1582, Gregorian from then on (proleptic both ways). */
export function usesJulianCalendar(year: number, month: number, day: number): boolean {
  if (year !== 1582) return year < 1582;
  if (month !== 10) return month < 10;
  return day < 15;
}

/** Julian Day for a calendar date (day may be fractional). Meeus, Astronomical Algorithms ch. 7. */
export function calendarToJD(year: number, month: number, day: number): number {
  let Y = year;
  let M = month;
  if (M <= 2) {
    Y -= 1;
    M += 12;
  }
  let B = 0;
  if (!usesJulianCalendar(year, month, Math.floor(day))) {
    const A = Math.floor(Y / 100);
    B = 2 - A + Math.floor(A / 4);
  }
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + day + B - 1524.5;
}

/**
 * JD (UT) for a local mean solar time at a longitude. Before time zones
 * existed, "10 pm in Giza" means local solar time, so this is the honest
 * conversion for historical scenes. lonDeg is east-positive.
 */
export function localSolarToJD(year: number, month: number, day: number, hour: number, lonDeg: number): number {
  return calendarToJD(year, month, day) + (hour - lonDeg / 15) / 24;
}

export function dayOfYear(month: number, day: number): number {
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cum[Math.max(0, Math.min(11, month - 1))] + day;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

export function monthName(m: number): string {
  return MONTHS[Math.max(0, Math.min(11, m - 1))];
}

export function formatYear(astroYear: number): string {
  const ago = yearsAgo(astroYear);
  if (ago >= 1_000_000) {
    const m = ago / 1_000_000;
    return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)} million years ago`;
  }
  if (ago >= 100_000) return `${Math.round(ago / 1000).toLocaleString("en-US")},000 years ago`;
  const y = Math.round(astroYear);
  if (y <= 0) {
    const b = 1 - y;
    return `${b >= 10000 ? b.toLocaleString("en-US") : b} BCE`;
  }
  if (y < 1000) return `${y} CE`;
  return `${y}`;
}

export function formatHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  let H = Math.floor(hh);
  let M = Math.round((hh - H) * 60);
  if (M === 60) {
    M = 0;
    H = (H + 1) % 24;
  }
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}
