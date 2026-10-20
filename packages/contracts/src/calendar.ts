/** Profile timezone is not exposed by the current finance boundary. Use its existing default. */
export const defaultFinancialTimeZone = "Asia/Jakarta";

/** A financial calendar date, independent of the server or browser's local timezone. */
export function financialCalendarDate(
  instant: Date | string = new Date(),
  timeZone = defaultFinancialTimeZone,
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    era: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  // JavaScript calendar dates support year 0000; Intl names that year 1 BC.
  const year = part("era") === "BC" ? 1 - Number(part("year")) : Number(part("year"));
  if (year < 0 || year > 9999)
    throw new RangeError("Date extends beyond supported calendar dates.");
  return `${String(year).padStart(4, "0")}-${part("month")}-${part("day")}`;
}
