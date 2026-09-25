import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { HealthStatus } from "@plugins/shell/plugins/health-report/web";
import { claudeCodeProblem, type ClaudeCodeStatus } from "../../core";

/**
 * The Claude Code row's verdict.
 *
 * - still loading → `unknown`, no summary ("Checking…"), never `ok`;
 * - `ready` → `ok`, naming the account and version;
 * - `missing` / `signed-out` → `critical`: the app exists to run agents, and it
 *   cannot start one;
 * - `unreadable` → `unknown` with why (the check failed; Claude Code may be fine).
 */
export function claudeCodeVerdict(
  result: ResourceResult<ClaudeCodeStatus>,
): HealthStatus {
  if (result.pending) {
    return result.error === null
      ? { state: "unknown" }
      : { state: "unknown", summary: "Couldn't load Claude Code's status" };
  }
  const s = result.data;
  switch (s.kind) {
    case "ready":
      return {
        state: "ok",
        summary: `${s.email ? `Signed in as ${s.email}` : "Signed in"} · v${s.version}`,
      };
    case "missing":
    case "signed-out":
      return {
        state: "critical",
        summary: `${claudeCodeProblem(s)} — agents cannot start`,
      };
    case "unreadable":
      return { state: "unknown", summary: claudeCodeProblem(s) };
  }
}
