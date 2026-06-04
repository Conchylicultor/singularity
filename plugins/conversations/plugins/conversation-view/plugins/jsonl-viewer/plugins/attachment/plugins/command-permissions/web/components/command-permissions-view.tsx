import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface CommandPermissionsPayload {
  type: "command_permissions";
  allowedTools: string[];
}

export function CommandPermissionsView({ event }: AttachmentRendererProps) {
  const att = event.attachment as CommandPermissionsPayload;
  const { open, triggerProps, contentId } = useCollapsible();
  const tools = att.allowedTools ?? [];

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <span className="font-mono">
          Command Permissions{" "}
          <span className="text-muted-foreground/60">({tools.length})</span>
        </span>
      </button>
      {open && (
        <div
          id={contentId}
          className="mt-2 border-l-2 border-muted-foreground/20 pl-3"
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
        </div>
      )}
    </div>
  );
}
