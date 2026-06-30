import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface HookErrorPayload {
  type: string;
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

// Failure counterpart to HookSuccessView: a hook command that errored, was
// blocked, or was cancelled. Shown loud — destructive chrome, always expanded —
// so the failure (and its stderr) is visible without a click.
function labelFor(subtype: string): string {
  switch (subtype) {
    case "hook_non_blocking_error":
      return "Hook error";
    case "hook_blocking_error":
      return "Hook blocked";
    case "hook_cancelled":
      return "Hook cancelled";
    default:
      return "Hook error";
  }
}

export function HookErrorView({ event }: AttachmentRendererProps) {
  const att = event.attachment as HookErrorPayload;
  const exitCode = att.exitCode;
  const stderr = att.stderr?.trim();
  const stdout = att.stdout?.trim();
  const hook = att.hookName ?? att.hookEvent;
  const label = hook ? `${labelFor(event.subtype)} · ${hook}` : labelFor(event.subtype);

  return (
    <CollapsibleCard
      error
      defaultOpen
      label={label}
      note={typeof att.durationMs === "number" ? `· ${att.durationMs}ms` : undefined}
    >
      <Stack as="div" gap="2xs" className="font-mono text-muted-foreground">
        {att.command && (
          <Text as="p" variant="caption" className="break-all">
            $ {att.command}
          </Text>
        )}
        {typeof exitCode === "number" && (
          <Text as="p" variant="caption" className="text-destructive">
            exit {exitCode}
          </Text>
        )}
        {stderr && (
          <Text
            as="p"
            variant="caption"
            className="whitespace-pre-wrap break-words text-destructive"
          >
            {stderr}
          </Text>
        )}
        {stdout && (
          <Text
            as="p"
            variant="caption"
            className="whitespace-pre-wrap break-words"
          >
            {stdout}
          </Text>
        )}
      </Stack>
    </CollapsibleCard>
  );
}
