const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const HOURS_BEFORE_DAYS = 48;

function plural(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? "" : "s"}`;
}

export function duration(seconds: number): string {
  const elapsed = Math.max(0, seconds);
  if (elapsed < SECONDS_PER_MINUTE) return "less than a minute";
  if (elapsed < SECONDS_PER_HOUR) return plural(Math.floor(elapsed / SECONDS_PER_MINUTE), "minute");
  const hours = Math.round(elapsed / SECONDS_PER_HOUR);
  if (hours < HOURS_BEFORE_DAYS) return `about ${plural(hours, "hour")}`;
  return `about ${plural(Math.round(elapsed / SECONDS_PER_DAY), "day")}`;
}

export function ago(thenEpoch: number, nowEpoch: number): string {
  return `${duration(nowEpoch - thenEpoch)} ago`;
}
