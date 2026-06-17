import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface HookAdditionalContextPayload {
  type: "hook_additional_context";
  content?: string[];
  hookName?: string;
  hookEvent?: string;
  toolUseID?: string;
}

export function HookAdditionalContextView({ event }: AttachmentRendererProps) {
  const att = event.attachment as HookAdditionalContextPayload;
  const items = att.content ?? [];

  return (
    <CollapsibleCard
      label="Hook Context"
      note={att.hookName ? `· ${att.hookName}` : undefined}
    >
      {items.length === 0 ? (
        <Text as="p" variant="caption" className="text-muted-foreground/60 italic">
          No context injected.
        </Text>
      ) : (
        <Text
          as="div"
          variant="caption"
          className="flex flex-col gap-xs text-muted-foreground"
        >
          {items.map((c) => (
            <p key={c} className="whitespace-pre-wrap break-words">
              {c}
            </p>
          ))}
        </Text>
      )}
    </CollapsibleCard>
  );
}
