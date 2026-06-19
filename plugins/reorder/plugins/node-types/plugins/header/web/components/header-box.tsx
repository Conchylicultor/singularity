import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactNode } from "react";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";

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
      <Frame
        align="center"
        gap="2xs"
        className="px-xs py-xs"
        leading={
          <button
            type="button"
            onClick={() => onPatch({ collapsed: !collapsed })}
            aria-label={collapsed ? "Expand" : "Collapse"}
            className="size-4 rounded-sm text-muted-foreground hover:text-foreground"
          >
            <Center className="size-full">
              <CollapsibleChevron open={!collapsed} className="size-3.5" />
            </Center>
          </button>
        }
        content={
          <Text
            variant="caption"
            tone={payload.label ? "default" : "muted"}
            className={cn("truncate", !payload.label && "italic")}
          >
            {payload.label || "Group"}
          </Text>
        }
      />
      {!collapsed && (
        <Inset x="xs" b="xs">
          {children}
        </Inset>
      )}
    </div>
  );
}
