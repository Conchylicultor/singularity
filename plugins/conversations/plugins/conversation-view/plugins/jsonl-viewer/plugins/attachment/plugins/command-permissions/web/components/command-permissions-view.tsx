import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/text/web";

interface CommandPermissionsPayload {
  type: "command_permissions";
  allowedTools: string[];
}

export function CommandPermissionsView({ event }: AttachmentRendererProps) {
  const att = event.attachment as CommandPermissionsPayload;
  const tools = att.allowedTools ?? [];

  return (
    <CollapsibleCard
      label={
        <span className="font-mono">
          Command Permissions{" "}
          <span className="text-muted-foreground/60">({tools.length})</span>
        </span>
      }
    >
      {tools.length === 0 ? (
        <Text as="p" variant="caption" className="text-muted-foreground/60 italic">
          No permissions granted.
        </Text>
      ) : (
        <Text as="div" variant="caption" className="flex flex-col gap-2xs font-mono">
          {tools.map((tool) => (
            <p key={tool} className="text-muted-foreground">
              {tool}
            </p>
          ))}
        </Text>
      )}
    </CollapsibleCard>
  );
}
