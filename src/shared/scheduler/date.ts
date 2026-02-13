/**
 * This file contains all date formatting/parsing logic used by the scheduler.
 * Centralizing this logic ensures every feature interprets date keys the same way.
 */

/**
 * Returns a zero-padded two-digit string for month/day fragments.
 */
export function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Converts a Date into the canonical storage key (`YYYY-MM-DD`).
 */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

/**
 * Converts a Date into a month picker value (`YYYY-MM`).
 */
export function toMonthValue(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}`;
}

/**
 * Validates the shape of a month picker value.
 */
export function isValidMonthValue(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

/**
 * Parses a month picker value and falls back to the current month when invalid.
 */
export function parseMonthValue(value: string): { year: number; month: number } {
  if (!isValidMonthValue(value)) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  const [yearPart, monthPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  return { year, month };
}

/**
 * Expands a month value (`YYYY-MM`) into an array of Date instances for each day.
 */
export function getMonthDates(monthValue: string): Date[] {
  const { year, month } = parseMonthValue(monthValue);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: Date[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(new Date(year, month - 1, day));
  }

  return dates;
}

/**
 * Formats a month heading from the first date in the month.
 */
export function getMonthLabel(monthDates: Date[]): string {
  if (monthDates.length === 0) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(monthDates[0]);
}

/**
 * Converts a storage key (`YYYY-MM-DD`) into a readable short date label.
 */
export function formatDateKey(dateKey: string): string {
  const [yearPart, monthPart, dayPart] = dateKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(year, month - 1, day));
}
