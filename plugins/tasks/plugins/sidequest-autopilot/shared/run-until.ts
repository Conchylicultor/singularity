/**
 * How long the autopilot keeps launching, as its `runUntil` config field says:
 * `""` ⇒ until it is turned off; otherwise an ISO datetime after which it
 * turns itself off.
 */
export type RunUntil = { kind: "no-end" } | { kind: "until"; at: Date };

/** Read `runUntil` — a value that is neither `""` nor a datetime throws. */
export function parseRunUntil(value: string): RunUntil {
  if (value.trim() === "") return { kind: "no-end" };
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(
      `sidequest-autopilot: runUntil "${value}" is not a datetime — set an ISO datetime, or "" to run until it is turned off`,
    );
  }
  return { kind: "until", at: new Date(ms) };
}

/** Whether the window `runUntil` set is over at `now`. */
export function runUntilPassed(runUntil: RunUntil, now: Date): boolean {
  return runUntil.kind === "until" && runUntil.at.getTime() <= now.getTime();
}
