import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { HealthStatus } from "@plugins/shell/plugins/health-report/web";
import {
  claudeCodeBlockMessage,
  claudeCodeStatusResource,
  type ClaudeCodeStatus,
} from "../../core";
import { claudeCodeVerdict } from "./claude-code-health";

/** Claude Code's live status on this backend — pending until the first check lands. */
export function useClaudeCodeStatus() {
  return useResource(claudeCodeStatusResource);
}

/** The health report's Claude Code row. One subscription to a pushed scalar. */
export function useClaudeCodeHealth(): HealthStatus {
  return claudeCodeVerdict(useClaudeCodeStatus());
}

/**
 * Why a launch control should be disabled, or `null` to leave it enabled.
 *
 * Only a KNOWN block disables: while the status is loading, or the check
 * itself could not answer, the control stays enabled and the server — which
 * asks again before starting anything — is the authority. So a launch is never
 * refused on a guess, and never lets a known-dead agent start either.
 */
export function useClaudeCodeLaunchBlock(): string | null {
  const result = useClaudeCodeStatus();
  if (result.pending) return null;
  return launchBlock(result.data);
}

function launchBlock(s: ClaudeCodeStatus): string | null {
  return s.kind === "missing" || s.kind === "signed-out"
    ? claudeCodeBlockMessage(s)
    : null;
}
