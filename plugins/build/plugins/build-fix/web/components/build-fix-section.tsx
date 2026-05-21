import { useState } from "react";
import { MdAutoFixHigh } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { buildHistoryResource } from "@plugins/build/core";
import { getBuildRunLogs } from "@plugins/build/plugins/build-logs/core";

export function BuildFixSection({ runId }: { runId: string }) {
  const result = useResource(buildHistoryResource);
  const run = result.pending ? undefined : result.data.find((r) => r.id === runId);

  const isFailed = run && run.finishedAt !== null && run.exitCode !== 0;
  if (!isFailed) return null;

  return <BuildFixButton runId={runId} />;
}

function BuildFixButton({ runId }: { runId: string }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const logsResult = useEndpoint(getBuildRunLogs, { id: runId });
  const logs = logsResult.data;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10">
          <MdAutoFixHigh className="size-4" />
          Launch agent to investigate
        </button>
      }
      align="start"
      contentClassName="w-[480px] max-w-[90vw] space-y-3 p-3"
    >
      <div className="space-y-1">
        <div className="text-sm font-medium">Investigate build failure</div>
        <div className="text-xs text-muted-foreground">
          Launch an agent to diagnose and fix the failing build.
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Extra context (optional) — e.g. what changed, suspected cause…"
        className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[80px] w-full resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3"
        rows={3}
      />
      <LaunchButtons
        size="sm"
        getRequest={() => {
          const failedSteps = logs?.steps.filter((s) => !s.success) ?? [];
          const errorText = failedSteps
            .map((s) => {
              const lines = s.lines.map((l) => l.text).join("\n");
              return `Step "${s.label}" failed:\n${lines}`;
            })
            .join("\n\n");

          const parts = ["Investigate and fix this build failure on main."];
          if (errorText) parts.push(`Build output:\n\n${errorText}`);
          if (text.trim()) parts.push(`Additional context: ${text.trim()}`);

          return { prompt: parts.join("\n\n") };
        }}
        onLaunched={() => setOpen(false)}
      />
    </InlinePopover>
  );
}
