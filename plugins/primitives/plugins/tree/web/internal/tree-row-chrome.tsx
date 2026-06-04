import { type ReactNode, type Ref } from "react";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { cn } from "@/lib/utils";

export type TreeRowChromeProps = {
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  selected?: boolean;
  /** Chevron click. Stops propagation internally so it never triggers onSelect. */
  onToggle?: () => void;
  /** Row click. */
  onSelect?: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /** Editable wrappers inject DnD state classes (dragging, drop-target ring). */
  className?: string;
  /** Editable wrappers attach the scroll + child-drop ref here. */
  rowRef?: Ref<HTMLDivElement>;
  /** Pixels of indentation per depth level. Defaults to the shared tree value. */
  indentStep?: number;
};

/**
 * Pure presentational tree-row chrome: indentation, a fixed row height, and a
 * reserved chevron slot. No hooks, no context, no dnd-kit — both the editable
 * RowChrome and read-only trees (e.g. config nav) render through it so every
 * tree row in the app shares one height invariant.
 */
export function TreeRowChrome({
  depth,
  hasChildren,
  isOpen,
  selected,
  onToggle,
  onSelect,
  children,
  actions,
  className,
  rowRef,
  indentStep = 16,
}: TreeRowChromeProps) {
  return (
    <div
      ref={rowRef}
      onClick={onSelect}
      className={cn(
        "group flex min-h-7 items-center gap-1 rounded px-1 py-1 text-sm",
        "hover:bg-accent",
        selected && "bg-accent",
        className,
      )}
      style={{ paddingLeft: depth * indentStep + 4 }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        aria-label={isOpen ? "Collapse" : "Expand"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded",
          "hover:bg-background/60",
          hasChildren
            ? "opacity-40 group-hover:opacity-100"
            : "opacity-0 group-hover:opacity-60",
        )}
      >
        <CollapsibleChevron open={isOpen} className="size-4" />
      </button>
      {children}
      {actions && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100"
        >
          {actions}
        </div>
      )}
    </div>
  );
}
