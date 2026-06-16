import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@plugins/primitives/plugins/ui-kit/web";
import { useCallback, type ReactNode } from "react";
import { MdAdd, MdMoreHoriz } from "react-icons/md";
import type { IconType } from "react-icons";
import { SelectionCheckbox } from "@plugins/primitives/plugins/multi-select/web";
import type { TreeNode } from "../../core";
import type { TreeItem } from "./types";
import { useTreeListContext, useTreeRow, type RowControls } from "./use-tree-row";
import { TreeRowChrome } from "./tree-row-chrome";

export type RowMenuItem = {
  icon?: IconType;
  label: string;
  onClick: () => void;
};

export type RowChromeMenuHelpers = Pick<RowControls, "addBelow" | "addChild">;

export type RowChromeProps<T extends TreeItem> = {
  node: TreeNode<T>;
  depth: number;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Optional row icon merged into the chevron slot (Notion style: icon at rest,
   * chevron on hover). Forwarded to `TreeRowChrome.icon`.
   */
  icon?: ReactNode;
  menu?: RowMenuItem[] | ((helpers: RowChromeMenuHelpers) => RowMenuItem[]);
  className?: string;
};

export function RowChrome<T extends TreeItem>(props: RowChromeProps<T>) {
  const { node, depth, children, actions, icon, menu, className } = props;
  const r = useTreeRow(node);
  const ctx = useTreeListContext<T>();
  const Row = ctx.Row;

  const menuItems =
    typeof menu === "function"
      ? menu({ addBelow: r.addBelow, addChild: r.addChild })
      : menu;

  // The whole row is the drag source (Notion-style: no grip handle). Merge the
  // draggable ref with the child-drop ref onto the single row element — but only
  // when the tree can reorder, so a read-only tree's rows aren't draggable at all
  // (no inert pickup, matching its missing `onMove`).
  const { childRef, dragSource } = r;
  const canReorder = ctx.canReorder;
  const rowRef = useCallback(
    (el: HTMLDivElement | null) => {
      childRef(el);
      if (canReorder) dragSource.ref(el);
    },
    [childRef, dragSource, canReorder],
  );

  // The "more" menu — formerly opened from the grip handle — now lives as a
  // hover-revealed trailing affordance, alongside the per-item actions.
  const moreMenu =
    menuItems && menuItems.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More actions"
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60 data-[state=open]:bg-background/60"
        >
          <MdMoreHoriz className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          {menuItems.map((item, i) => (
            <DropdownMenuItem key={i} onClick={item.onClick}>
              {item.icon ? <item.icon className="size-4" /> : null}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  // Notion-style per-row "+" — hover-revealed add-child affordance that replaces
  // the old persistent "Add" line under expanded nodes (more compact tree). The
  // surrounding actions cluster already stops row-click/drag propagation and
  // owns the hover-reveal, so this button only handles the create.
  const addChild = ctx.canCreate ? (
    <button
      type="button"
      aria-label="Add child"
      onClick={() => void r.addChild()}
      className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60"
    >
      <MdAdd className="size-4" />
    </button>
  ) : null;

  const trailing =
    actions || moreMenu || addChild ? (
      <>
        {actions}
        {moreMenu}
        {addChild}
      </>
    ) : undefined;

  return (
    <div>
      <div className="relative">
        <TreeRowChrome
          depth={depth}
          hasChildren={r.hasChildren}
          isOpen={r.isOpen}
          selected={r.isSelected}
          onToggle={r.toggleExpanded}
          onSelect={r.select}
          rowRef={rowRef}
          dragAttributes={canReorder ? dragSource.attributes : undefined}
          dragListeners={canReorder ? dragSource.listeners : undefined}
          className={cn(
            r.isDragging && "opacity-40",
            r.isOverChild && "bg-accent ring-primary/40 ring-1",
            className,
          )}
          actions={trailing}
          icon={icon}
          leading={
            ctx.multiSelect ? (
              // The checkbox self-hides when inactive via a BARE
              // `group-hover:opacity-100`, which never fires under the row's
              // NAMED `group/tree-row`. Pass the named-group reveal variant so
              // it shows on row hover (and stays visible while selection is
              // active, where the checkbox carries no opacity-0).
              <SelectionCheckbox
                id={node.id}
                className="group-hover/tree-row:opacity-100"
              />
            ) : undefined
          }
        >
          {children}
        </TreeRowChrome>
        <div
          ref={r.beforeRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[6px]"
        >
          {r.isOverBefore && (
            <div className="bg-primary absolute inset-x-1 top-0 h-[2px] rounded-full" />
          )}
        </div>
        <div
          ref={r.afterRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[6px]"
        >
          {r.isOverAfter && (
            <div className="bg-primary absolute inset-x-1 bottom-0 h-[2px] rounded-full" />
          )}
        </div>
      </div>
      {r.isOpen && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.id}
              node={child as TreeNode<T>}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
