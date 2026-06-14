import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/text/web";

interface HookSuccessPayload {
  type: "hook_success";
  hookName?: string;
  hookEvent?: string;
  toolUseID?: string;
  content?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  command?: string;
  durationMs?: number;
}

// hook_success is the execution record of a hook command. Any additionalContext
// it injects is surfaced by its sibling hook_additional_context event, so this
// card deliberately shows only execution telemetry (which hook, exit, duration,
// stderr) to avoid rendering the same reminder twice in a row.
export function HookSuccessView({ event }: AttachmentRendererProps) {
  const att = event.attachment as HookSuccessPayload;
  const exitCode = att.exitCode ?? 0;
  const stderr = att.stderr?.trim();
  const failed = exitCode !== 0 || !!stderr;

  return (
    <CollapsibleCard
      error={failed}
      label={
        <span className="font-mono">
          Hook {att.hookName ?? att.hookEvent ?? "ran"}
          {typeof att.durationMs === "number" && (
            <span className="text-muted-foreground/60"> · {att.durationMs}ms</span>
          )}
        </span>
      }
    >
      <Text
        as="div"
        variant="caption"
        className="flex flex-col gap-2xs font-mono text-muted-foreground"
      >
        {att.command && <p className="break-all">$ {att.command}</p>}
        <p className={failed ? "text-destructive" : undefined}>exit {exitCode}</p>
        {stderr && (
          <p className="whitespace-pre-wrap break-words text-destructive">{stderr}</p>
        )}
      </Text>
    </CollapsibleCard>
  );
}
