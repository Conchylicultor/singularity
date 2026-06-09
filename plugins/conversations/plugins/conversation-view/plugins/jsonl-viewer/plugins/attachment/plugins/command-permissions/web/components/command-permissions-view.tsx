import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

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
        <p className="text-xs text-muted-foreground/60 italic">
          No permissions granted.
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 text-xs font-mono leading-5">
          {tools.map((tool) => (
            <p key={tool} className="text-muted-foreground">
              {tool}
            </p>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
