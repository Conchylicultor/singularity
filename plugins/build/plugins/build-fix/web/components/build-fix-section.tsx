import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAutoFixHigh } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { BUILD_EXIT_SUPERSEDED, type BuildRun, buildHistoryResource } from "@plugins/build/core";
import { getBuildRunLogs } from "@plugins/build/plugins/build-logs/core";

/** The run, once the history resource has settled. */
function useBuildRun(runId: string): BuildRun | null {
  const result = useResource(buildHistoryResource);
  if (result.pending) return null;
  return result.data.find((r) => r.id === runId) ?? null;
}

/**
 * The section exists only for a build that actually failed — a green run has
 * nothing to fix. Declared as the contribution's `useAvailable` rather than a
 * `return null` in the content: the host paints the card before it reaches the
 * content, so a null here would leave a "Fix" bar over nothing.
 *
 * A superseded run has no defect to hand an agent either — its tree was
 * replaced mid-build, so its steps straddle two commits and describe neither.
 */
export function useBuildFailed({ runId }: { runId: string }): boolean {
  const run = useBuildRun(runId);
  return (
    run !== null &&
    run.finishedAt !== null &&
    run.exitCode !== 0 &&
    run.exitCode !== BUILD_EXIT_SUPERSEDED
  );
}

/**
 * The section's whole content: one button. It rides the header as the
 * contribution's `actions`, so the card is a single row with the action on it —
 * there is no body, and therefore no chevron opening onto one button.
 */
export function BuildFixAction({ runId }: { runId: string }) {
  const run = useBuildRun(runId);
  // `useAvailable` already gated on a failed run; this only narrows the type.
  if (!run) return null;
  return <BuildFixButton runId={runId} run={run} />;
}

function formatBuildInfo(run: BuildRun): string {
  const lines: string[] = [];
  lines.push(`Build ID: ${run.id}`);
  if (run.commitHash) lines.push(`Commit: ${run.commitHash}`);
  lines.push(`Exit code: ${run.exitCode}`);
  if (run.finishedAt) {
    const durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    const durationSec = Math.round(durationMs / 1000);
    lines.push(`Duration: ${durationSec}s`);
  }
  return lines.join("\n");
}

function BuildFixButton({ runId, run }: { runId: string; run: BuildRun }) {
  const logsResult = useEndpoint(getBuildRunLogs, { id: runId });
  const logs = logsResult.data;

  return (
    <LaunchAgentPopover
      trigger={
        <Button variant="destructive">
          <MdAutoFixHigh className="size-4" />
          Launch agent to investigate
        </Button>
      }
      title="Investigate build failure"
      description="Launch an agent to diagnose and fix the failing build."
      placeholder="Extra context (optional) — e.g. what changed, suspected cause…"
      align="start"
      width="3xl"
      onLaunched={(conv) => {
        toast({
          type: "build",
          title: "Investigating build failure",
          description: "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: conversationRoute.link(agentManagerApp, { convId: conv.id }),
        });
      }}
      getRequest={(userText) => {
        const failedSteps = logs?.steps.filter((s) => !s.success) ?? [];
        const errorText = failedSteps
          .map((s) => {
            const lines = s.lines.map((l) => l.text).join("\n");
            return `Step "${s.label}" failed:\n${lines}`;
          })
          .join("\n\n");

        const parts = ["Investigate and fix this build failure on main."];
        parts.push(`Build info:\n${formatBuildInfo(run)}`);
        if (errorText) parts.push(`Build output:\n\n${errorText}`);
        if (userText.trim()) parts.push(`Additional context: ${userText.trim()}`);

        return { prompt: parts.join("\n\n") };
      }}
    />
  );
}
