// The next patch from Riot's published schedule (data/patch-schedule.json). Dates there are calendar
// days in Pacific Time, so "today" is worked out in that zone too. No server-only imports: the
// countdown runs in the browser so a static page doesn't show the day it was built.

export type PatchSchedule = { timeZone: string; patches: { patch: string; date: string }[] };
export type NextPatch = { patch: string; date: string; days: number };

const DAY = 86_400_000;

/** Today's calendar date ("2026-10-17") in the given time zone. */
export function dayIn(timeZone: string, now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The first patch on or after today, with whole days to go (0 = today); null once the list runs out. */
export function nextPatch(s: PatchSchedule, now = new Date()): NextPatch | null {
  const today = dayIn(s.timeZone, now);
  const next = [...s.patches].sort((a, b) => a.date.localeCompare(b.date)).find((p) => p.date >= today);
  if (!next) return null;
  return { ...next, days: Math.round((Date.parse(next.date) - Date.parse(today)) / DAY) };
}

/** "Wednesday, October 21" for a schedule date, written the way `lang` writes dates. */
export function longDate(date: string, lang = "en") {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : lang, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}
