/**
 * Local-time date helpers for the calendar — the single place that converts
 * between Date objects, datetime-local/date input values, and ISO payloads.
 *
 * datetime-local and date inputs carry no timezone offset, so plain
 * `new Date("2026-03-16")` (UTC midnight) must never be used for date-only
 * values: it shifts the day in most timezones. Everything here constructs
 * dates with local components instead.
 */

const pad2 = (n: number) => n.toString().padStart(2, "0");

/** Local "yyyy-MM-dd" for <input type="date">. */
export const toDateInputValue = (d: Date | string | number): string => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

/** Local "yyyy-MM-ddTHH:mm" for <input type="datetime-local">. */
export const toDateTimeInputValue = (d: Date | string | number): string => {
  const dt = new Date(d);
  return `${toDateInputValue(dt)}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};

/** Shift a "yyyy-MM-ddTHH:mm" value by minutes, keeping the same format. */
export const shiftDateTimeInput = (value: string, minutes: number): string => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  d.setMinutes(d.getMinutes() + minutes);
  return toDateTimeInputValue(d);
};

/**
 * All-day range for a "yyyy-MM-dd" string: local start-of-day → end-of-day
 * as ISO strings. Never `new Date("yyyy-MM-dd")` (UTC midnight).
 */
export const allDayRange = (dateStr: string): { startISO: string; endISO: string } => {
  const [y, m, day] = dateStr.substring(0, 10).split("-").map(Number);
  return {
    startISO: new Date(y, m - 1, day, 0, 0, 0).toISOString(),
    endISO: new Date(y, m - 1, day, 23, 59, 59).toISOString(),
  };
};

/** Local midnight copy of a date (strips the time part). */
export const startOfLocalDay = (d: Date | string | number): Date => {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
