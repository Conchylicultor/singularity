import type { ReactNode } from "react";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { cn } from "@/lib/utils";

type HeaderPayload = { label?: string; collapsed?: boolean };

/**
 * The `header` container node type's box: a labeled, collapsible frame that
 * renders its pre-rendered members as `children`. Visual style mirrors the old
 * group box (border + chevron header row) but without the drag handle, rename
 * input, delete button, or any endpoint/DB calls — collapse is the only
 * affordance, written back through `onPatch`. Label is display-only this pass.
 */
export function HeaderBox({
  payload,
  editMode: _editMode,
  onPatch,
  children,
}: {
  payload: HeaderPayload;
  editMode: boolean;
  onPatch: (next: Partial<HeaderPayload>) => void;
  children: ReactNode;
}) {
  const collapsed = payload.collapsed ?? false;

  return (
    <div className="rounded-md border border-border/50">
      <div className="flex items-center gap-0.5 px-1.5 py-1">
        <button
          type="button"
          onClick={() => onPatch({ collapsed: !collapsed })}
          aria-label={collapsed ? "Expand" : "Collapse"}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        >
          <CollapsibleChevron open={!collapsed} className="size-3.5" />
        </button>
        <Text
          variant="caption"
          tone={payload.label ? "default" : "muted"}
          className={cn("truncate", !payload.label && "italic")}
        >
          {payload.label || "Group"}
        </Text>
      </div>
      {!collapsed && <div className="px-1.5 pb-1.5">{children}</div>}
    </div>
  );
}
