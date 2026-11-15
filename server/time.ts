// Wall-clock time in the company's time zone, without a date library. Used by the seed data and the web app.

/** Minutes the time zone is ahead of UTC at a moment (e.g. -360 for Chicago in winter). */
function offsetMinutes(tz: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)]),
  );
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at.getTime()) / 60000;
}

/** The moment a wall-clock time happens in a time zone. */
export function zoned(tz: string, y: number, m: number, d: number, hh = 0, mm = 0): Date {
  const wall = Date.UTC(y, m, d, hh, mm);
  let t = wall - offsetMinutes(tz, new Date(wall)) * 60000;
  t = wall - offsetMinutes(tz, new Date(t)) * 60000; // settles daylight-saving edges
  return new Date(t);
}

export function localDate(tz: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)]),
  );
  return { y: p.year, m: p.month - 1, d: p.day };
}

/** "2026-11-17T09:00" (what a datetime-local input shows) for a moment, in a time zone. */
export function toLocalInput(iso: string, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The moment a datetime-local value ("2026-11-17T09:00") means in a time zone. */
export function fromLocalInput(value: string, tz: string): Date {
  const [d, t = '00:00'] = value.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return zoned(tz, y, m - 1, day, hh, mm);
}
