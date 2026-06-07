import { type ReactNode } from "react";
import { MdAdd, MdDragIndicator } from "react-icons/md";
import type { IconType } from "react-icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Row as RowPrimitive } from "@plugins/primitives/plugins/row/web";
import { cn } from "@/lib/utils";
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
  menu?: RowMenuItem[] | ((helpers: RowChromeMenuHelpers) => RowMenuItem[]);
  className?: string;
};

export function RowChrome<T extends TreeItem>(props: RowChromeProps<T>) {
  const { node, depth, children, actions, menu, className } = props;
  const r = useTreeRow(node);
  const ctx = useTreeListContext<T>();
  const Row = ctx.Row;

  const menuItems =
    typeof menu === "function"
      ? menu({ addBelow: r.addBelow, addChild: r.addChild })
      : menu;

  const dragHandleClass = cn(
    "absolute top-1/2 z-10 flex size-5 -translate-y-1/2 cursor-grab items-center justify-center rounded",
    "text-muted-foreground hover:bg-background/60 active:cursor-grabbing",
    "opacity-0 group-hover/row:opacity-60",
  );
  const dragHandleStyle = { left: depth * 16 - 16 };

  const dragHandle =
    menuItems && menuItems.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={r.dragHandleProps.ref}
          aria-label="Drag to reorder"
          {...r.dragHandleProps.attributes}
          {...r.dragHandleProps.listeners}
          className={dragHandleClass}
          style={dragHandleStyle}
        >
          <MdDragIndicator className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          {menuItems.map((item, i) => (
            <DropdownMenuItem key={i} onClick={item.onClick}>
              {item.icon ? <item.icon className="size-4" /> : null}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <button
        type="button"
        ref={r.dragHandleProps.ref}
        aria-label="Drag to reorder"
        {...r.dragHandleProps.attributes}
        {...r.dragHandleProps.listeners}
        className={dragHandleClass}
        style={dragHandleStyle}
      >
        <MdDragIndicator className="size-4" />
      </button>
    );

  return (
    <div>
      <div className="group/row relative">
        {dragHandle}
        <TreeRowChrome
          depth={depth}
          hasChildren={r.hasChildren}
          isOpen={r.isOpen}
          selected={r.isSelected}
          onToggle={r.toggleExpanded}
          onSelect={r.select}
          rowRef={r.childRef}
          className={cn(
            r.isDragging && "opacity-40",
            r.isOverChild && "bg-accent ring-primary/40 ring-1",
            className,
          )}
          actions={actions}
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
          <RowPrimitive
            as="button"
            hover="accent"
            indent={(depth + 1) * 16 + 4}
            icon={<span className="size-5 shrink-0" />}
            onClick={() => void r.addChild()}
            className="text-muted-foreground"
          >
            <MdAdd className="size-4 shrink-0" />
            Add
          </RowPrimitive>
        </div>
      )}
    </div>
  );
}
