import { MdAutoFixHigh } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/notifications/web";
import { type BuildRun, buildHistoryResource } from "@plugins/build/core";
import { getBuildRunLogs } from "@plugins/build/plugins/build-logs/core";

export function BuildFixSection({ runId }: { runId: string }) {
  const result = useResource(buildHistoryResource);
  if (result.pending) return null;
  const run = result.data.find((r) => r.id === runId);

  const isFailed = run && run.finishedAt !== null && run.exitCode !== 0;
  if (!isFailed) return null;

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
        <Button variant="destructive" size="sm">
          <MdAutoFixHigh className="size-4" />
          Launch agent to investigate
        </Button>
      }
      title="Investigate build failure"
      description="Launch an agent to diagnose and fix the failing build."
      placeholder="Extra context (optional) — e.g. what changed, suspected cause…"
      align="start"
      width="w-[480px]"
      openAfterLaunch={false}
      onLaunched={(conv) => {
        toast({
          type: "build",
          title: "Investigating build failure",
          description: "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: `/c/${conv.id}`,
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
