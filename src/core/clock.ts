export type Clock = {
  now: () => number;
};

export const systemClock: Clock = {
  now: () => Math.floor(Date.now() / 1000),
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function localParts(epochSeconds: number, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const values = new Map<string, number>();
  for (const part of formatter.formatToParts(new Date(epochSeconds * 1000))) {
    values.set(part.type, Number(part.value));
  }
  const read = (type: string): number => values.get(type) ?? 0;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function utcOffsetSeconds(epochSeconds: number, timeZone: string): number {
  const p = localParts(epochSeconds, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - epochSeconds;
}

export function localDate(epochSeconds: number, timeZone: string): string {
  const { year, month, day } = localParts(epochSeconds, timeZone);
  return [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

/*
 * Local midnight as a UTC epoch. The offset is sampled twice because the first
 * guess can land on the wrong side of a DST change, which the second sample corrects.
 */
export function startOfLocalDay(epochSeconds: number, timeZone: string): number {
  const { year, month, day } = localParts(epochSeconds, timeZone);
  const midnightAsUtc = Date.UTC(year, month - 1, day) / 1000;
  const firstGuess = midnightAsUtc - utcOffsetSeconds(midnightAsUtc, timeZone);
  return midnightAsUtc - utcOffsetSeconds(firstGuess, timeZone);
}

export function localTime(epochSeconds: number, timeZone: string): string {
  const { hour, minute } = localParts(epochSeconds, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function localMoment(epochSeconds: number, timeZone: string): { today: string; time: string } {
  return { today: localDate(epochSeconds, timeZone), time: localTime(epochSeconds, timeZone) };
}
