import type { ReloadAdvice } from "../hooks/use-reload-advice";

export type ShownAdvice = Exclude<ReloadAdvice, { kind: "none" }>;

/**
 * What a Reload control says about why — its tooltip and accessible name. The
 * one copy the Build pill's Reload segment and the collapsed bar's Reload chip
 * share.
 */
export function reloadMessageFor(advice: ShownAdvice): string {
  if (advice.kind === "stale") {
    return "Server was rebuilt — click to reload this tab";
  }
  if (advice.kind === "outdated") {
    return "This tab is out of date and can't load some data — reload to fix";
  }
  return advice.stale
    ? "This tab is out of date and part of the app didn't load — reload to fix"
    : "Part of the app didn't load — reload to fix";
}

/** Something already fails (outdated reads, a plugin that did not load) — red, not blue. */
export function reloadIsFailing(advice: ShownAdvice): boolean {
  return advice.kind === "broken" || advice.kind === "outdated";
}
