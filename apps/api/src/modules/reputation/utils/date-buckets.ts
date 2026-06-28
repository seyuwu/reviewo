export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function truncateToUtcHour(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0
    )
  );
}

export function differenceInDays(start: Date, end: Date): number {
  const startUtc = toUtcDateOnly(start).getTime();
  const endUtc = toUtcDateOnly(end).getTime();

  return Math.max(0, Math.floor((endUtc - startUtc) / 86_400_000));
}
