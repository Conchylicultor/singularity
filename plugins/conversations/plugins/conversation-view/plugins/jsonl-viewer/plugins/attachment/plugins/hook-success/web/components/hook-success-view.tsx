import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

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
      label={`Hook ${att.hookName ?? att.hookEvent ?? "ran"}`}
      note={typeof att.durationMs === "number" ? `· ${att.durationMs}ms` : undefined}
    >
      <Stack as="div" gap="2xs" className="font-mono text-muted-foreground">
        {att.command && (
          <Text as="p" variant="caption" className="break-all">
            $ {att.command}
          </Text>
        )}
        <Text
          as="p"
          variant="caption"
          className={failed ? "text-destructive" : undefined}
        >
          exit {exitCode}
        </Text>
        {stderr && (
          <Text
            as="p"
            variant="caption"
            className="whitespace-pre-wrap break-words text-destructive"
          >
            {stderr}
          </Text>
        )}
      </Stack>
    </CollapsibleCard>
  );
}
