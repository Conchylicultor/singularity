import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { HealthStatus } from "@plugins/shell/plugins/health-report/web";
import type { SentinelWatch } from "../../core";

/** What a dead or missing watcher costs, said once so every critical row agrees. */
const CONSEQUENCE = "builds are not held back when memory runs out";

/** The longest stretch of a worker error the one-line summary carries. */
const ERROR_MAX = 120;

function clampOneLine(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= ERROR_MAX ? flat : `${flat.slice(0, ERROR_MAX - 1)}…`;
}

function withError(summary: string, lastError: string | null): string {
  return lastError === null
    ? summary
    : `${summary} — last error: ${clampOneLine(lastError)}`;
}

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The Machine watcher row's verdict from the `sentinel.status` read.
 *
 * - still loading → `unknown` with no summary (never green before it is read);
 * - no status recorded, or an unreadable file → `unknown` with the reason;
 * - turned off in config → `attention`;
 * - the process that wrote the status is gone → `critical`, whatever it said;
 * - `down` → `critical`; `starting` / `respawning` / `stopped` → `attention`,
 *   pulsing; `running` → `ok`.
 */
export function machineWatcherVerdict(
  result: ResourceResult<SentinelWatch>,
): HealthStatus {
  if (result.pending) {
    return result.error === null
      ? { state: "unknown" }
      : {
          state: "unknown",
          summary: "Couldn't load the machine watcher's status",
        };
  }

  const watch = result.data;
  switch (watch.kind) {
    case "none":
      return {
        state: "unknown",
        summary: "Main has not reported a machine watcher status yet",
      };
    case "unreadable":
      return {
        state: "unknown",
        summary: `The machine watcher's status file is unreadable: ${clampOneLine(watch.reason)}`,
      };
    case "recorded":
      break;
  }

  const status = watch.status;
  if (status.state === "disabled") {
    return {
      state: "attention",
      summary: `The machine watcher is turned off in config — ${CONSEQUENCE}`,
    };
  }
  if (!watch.ownerAlive) {
    return {
      state: "critical",
      summary: `Main is not running its machine watcher — ${CONSEQUENCE}`,
    };
  }
  switch (status.state) {
    case "running":
      return {
        state: "ok",
        summary: `Running since ${clockTime(status.since)}`,
      };
    case "starting":
      return { state: "attention", summary: "Starting…", transitioning: true };
    case "respawning":
      return {
        state: "attention",
        summary: withError(
          status.deaths === 1
            ? "Restarting after a crash"
            : `Restarting after ${String(status.deaths)} crashes`,
          status.lastError,
        ),
        transitioning: true,
      };
    case "down":
      return {
        state: "critical",
        summary: withError(
          `The machine watcher is not running — ${CONSEQUENCE}`,
          status.lastError,
        ),
      };
    case "stopped":
      return {
        state: "attention",
        summary: "Stopped while main restarts",
        transitioning: true,
      };
  }
}
