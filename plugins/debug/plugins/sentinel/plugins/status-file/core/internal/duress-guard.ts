import type { SentinelWatch } from "./status";

/**
 * Whether the duress guard can go up right now: `on` only while a live watcher
 * is running. Anything else is `off`, with a plain reason for the person or
 * agent whose work is not being protected.
 */
export type DuressGuard = { kind: "on" } | { kind: "off"; why: string };

/**
 * The guard's state from a status-file read. Transient states (`starting`,
 * `respawning`, `stopped`) are `off` too: at that moment nothing can raise the
 * duress latch, whatever happens a few seconds later.
 */
export function duressGuard(watch: SentinelWatch): DuressGuard {
  switch (watch.kind) {
    case "none":
      return { kind: "off", why: "no machine watcher has reported a status" };
    case "unreadable":
      return {
        kind: "off",
        why: `the machine watcher's status file is unreadable: ${watch.reason}`,
      };
    case "recorded":
      break;
  }
  const status = watch.status;
  if (status.state === "disabled") {
    return { kind: "off", why: "the machine watcher is turned off in config" };
  }
  if (!watch.ownerAlive) {
    return { kind: "off", why: "main is not running its machine watcher" };
  }
  switch (status.state) {
    case "running":
      return { kind: "on" };
    case "starting":
      return { kind: "off", why: "the machine watcher is still starting" };
    case "respawning":
      return {
        kind: "off",
        why: "the machine watcher crashed and is restarting",
      };
    case "down":
      return { kind: "off", why: "the machine watcher is down" };
    case "stopped":
      return { kind: "off", why: "the machine watcher is stopped" };
  }
}
