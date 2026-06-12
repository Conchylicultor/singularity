import { MdAutoFixHigh } from "react-icons/md";
import type { BoundaryErrorReport } from "@plugins/primitives/plugins/error-boundary/web";
import type { CrashContext } from "@plugins/crashes/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";

export function LaunchFixButton({
  report,
  context,
}: {
  report: BoundaryErrorReport;
  context: unknown;
}) {
  const taskId = (context as CrashContext | null)?.taskId ?? null;
  const disabled = taskId === null;

  return (
    <LaunchAgentPopover
      trigger={
        <button
          title={disabled ? "Recording crash…" : "Launch an agent to fix this crash"}
          aria-label="Launch fix agent"
          disabled={disabled}
          // eslint-disable-next-line badge/no-adhoc-chip -- inline action button
          className="flex items-center gap-xs rounded-md px-xs py-2xs underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
        >
          <MdAutoFixHigh className="size-3" />
          Fix
        </button>
      }
      title="Fix this crash"
      description={
        <>
          {[report.slot, report.label].filter(Boolean).join(" / ") || "Plugin"}{" "}
          crashed: {report.error.message}
        </>
      }
      placeholder="Extra context (optional) — e.g. what you were doing, expected behaviour…"
      align="end"
      disabled={disabled}
      getRequest={(userText) => {
        const parts: string[] = [];
        parts.push(`## Crash report\n`);
        if (report.slot || report.label) {
          parts.push(
            `**Location:** ${[report.slot, report.label].filter(Boolean).join(" / ")}`,
          );
        }
        parts.push(`**Error:** ${report.error.message}`);
        if (report.error.stack) {
          parts.push(`\n\`\`\`\n${report.error.stack}\n\`\`\``);
        }
        if (report.componentStack) {
          parts.push(
            `\n**Component stack:**\n\`\`\`\n${report.componentStack.trim()}\n\`\`\``,
          );
        }
        const extra = userText.trim();
        if (extra) {
          parts.push(`\n## Context\n\n${extra}`);
        }
        return {
          taskId: taskId ?? undefined,
          prompt: parts.join("\n"),
        };
      }}
    />
  );
}
