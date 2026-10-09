import type {
  TerminalMenu,
  TerminalMenuOption,
} from "@plugins/conversations/plugins/terminal-menu/core";

/**
 * The usage-limit menu's options, recognised by their own words — Claude Code
 * draws them under a title as generic as "What do you want to do?".
 */
const WAIT_RE = /continue automatically/i;
const STOP_RE = /^stop\b/i;
const CREDITS_RE = /usage credits/i;

export interface LimitMenuOptions {
  wait: TerminalMenuOption | null;
  stop: TerminalMenuOption | null;
  credits: TerminalMenuOption | null;
  /** Any option none of the above names — still offered, never dropped. */
  other: TerminalMenuOption[];
}

export function isUsageLimitMenu(menu: TerminalMenu): boolean {
  return menu.options.some(
    (o) => WAIT_RE.test(o.label) || /wait for limit to reset/i.test(o.label),
  );
}

export function limitMenuOptions(menu: TerminalMenu): LimitMenuOptions {
  const out: LimitMenuOptions = {
    wait: null,
    stop: null,
    credits: null,
    other: [],
  };
  for (const o of menu.options) {
    if (!out.wait && WAIT_RE.test(o.label)) out.wait = o;
    else if (!out.stop && STOP_RE.test(o.label)) out.stop = o;
    else if (!out.credits && CREDITS_RE.test(o.label)) out.credits = o;
    else out.other.push(o);
  }
  return out;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

// "… at Oct 13 at 6am", "… at Oct 13 at 6:30pm", or a same-day "… at 6am".
const DATED_RE =
  /\bat\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
const TIME_RE = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

/**
 * When the limit resets, read from the wait option's label ("Wait here, then
 * continue automatically at Oct 13 at 6am") as the next such wall time in the
 * browser's zone — the zone the CLI prints in, on this one-user machine. Null
 * when the label names no time this can read; the caller then shows the label.
 */
export function parseResetTime(label: string, now: Date): Date | null {
  const dated = DATED_RE.exec(label);
  if (dated) {
    const month = MONTHS.indexOf(dated[1]!.toLowerCase());
    if (month < 0) return null;
    const at = wallTime(
      now.getFullYear(),
      month,
      Number(dated[2]),
      dated[3]!,
      dated[4],
      dated[5]!,
    );
    // A reset never lies in the past: "Jan 2" read on Dec 30 is next year's.
    if (at && at.getTime() < now.getTime() - 24 * 3_600_000)
      at.setFullYear(at.getFullYear() + 1);
    return at;
  }
  const time = TIME_RE.exec(label);
  if (!time) return null;
  const at = wallTime(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    time[1]!,
    time[2],
    time[3]!,
  );
  if (at && at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

function wallTime(
  year: number,
  month: number,
  day: number,
  hour: string,
  minute: string | undefined,
  meridiem: string,
): Date | null {
  const h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (h < 1 || h > 12 || m > 59) return null;
  const pm = meridiem.toLowerCase() === "pm";
  return new Date(year, month, day, (h % 12) + (pm ? 12 : 0), m);
}

/** "3d 4h", "4h 12m", "12m", "less than a minute". */
export function formatCountdown(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
