import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MdAdd, MdChevronRight, MdDragIndicator } from "react-icons/md";
import type { IconType } from "react-icons";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TreeNode } from "../../shared";
import { pendingFocus } from "./pending-focus";
import type { RowContext, TreeItem } from "./types";

export type RowMenuItem = {
  icon?: IconType;
  label: string;
  onClick: () => void;
};

export type TreeRowProps<T extends TreeItem> = {
  node: TreeNode<T>;
  depth: number;
  selectedId: string | undefined;
  activeId: string | null;
  labelOf: (row: T) => string;
  onSelect: (id: string) => void;
  onRename: (id: string, next: string) => void | Promise<void>;
  onToggleExpanded: (id: string, next: boolean) => void | Promise<void>;
  onAddChild: (parentId: string) => void;
  renderLeading?: (row: T) => ReactNode;
  renderActions?: (row: T, ctx: RowContext) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  rowMenu?: (row: T) => RowMenuItem[];
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
};

export function TreeRow<T extends TreeItem>(props: TreeRowProps<T>) {
  const {
    node,
    depth,
    selectedId,
    activeId,
    labelOf,
    onSelect,
    onRename,
    onToggleExpanded,
    onAddChild,
    renderLeading,
    renderActions,
    rowClassName,
    rowMenu,
    pendingFocusId,
    clearPendingFocus,
  } = props;

  const isOpen = node.expanded;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isDragging = activeId === node.id;
  const labelValue = labelOf(node);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `drag:${node.id}`,
    data: { id: node.id, parentId: node.parentId, rank: node.rank },
  });
  const { isOver: isOverBefore, setNodeRef: setBeforeRef } = useDroppable({
    id: `before:${node.id}`,
    data: { zone: "before" as const, targetId: node.id },
  });
  const { isOver: isOverAfter, setNodeRef: setAfterRef } = useDroppable({
    id: `after:${node.id}`,
    data: { zone: "after" as const, targetId: node.id },
  });
  const { isOver: isOverChild, setNodeRef: setChildRef } = useDroppable({
    id: `child:${node.id}`,
    data: { zone: "child" as const, targetId: node.id },
  });

  const [label, setLabel] = useState(labelValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setLabel(labelValue);
  }, [labelValue]);

  useEffect(() => {
    if (pendingFocusId === node.id && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
      clearPendingFocus();
    }
  }, [pendingFocusId, node.id, clearPendingFocus]);

  const commit = useCallback(
    (value: string) => {
      dirtyRef.current = false;
      const next = value.trim() || "Untitled";
      if (next === labelValue) return;
      void onRename(node.id, next);
    },
    [node.id, labelValue, onRename],
  );

  const onChange = (v: string) => {
    dirtyRef.current = true;
    setLabel(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => commit(v), 500);
  };

  const onBlur = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    commit(label);
  };

  const menu = rowMenu?.(node);
  const dragHandleClass = cn(
    "absolute top-1/2 z-10 flex size-5 -translate-y-1/2 cursor-grab items-center justify-center rounded",
    "text-muted-foreground hover:bg-background/60 active:cursor-grabbing",
    "opacity-0 group-hover/row:opacity-60",
  );
  const dragHandleStyle = { left: depth * 16 - 16 };

  const dragHandle =
    menu && menu.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={setDragRef}
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className={dragHandleClass}
          style={dragHandleStyle}
        >
          <MdDragIndicator className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          {menu.map((item, i) => (
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
        ref={setDragRef}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
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
        <div
          ref={setChildRef}
          className={cn(
            "group flex items-center gap-1 rounded px-1 py-1 text-sm",
            "hover:bg-accent",
            isSelected && "bg-accent",
            isDragging && "opacity-40",
            isOverChild && "bg-accent ring-primary/40 ring-1",
          )}
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          <button
            type="button"
            onClick={() => onToggleExpanded(node.id, !isOpen)}
            aria-label={isOpen ? "Collapse" : "Expand"}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded",
              "hover:bg-background/60",
              hasChildren
                ? "opacity-40 group-hover:opacity-100"
                : "opacity-0 group-hover:opacity-60",
            )}
          >
            <MdChevronRight
              className={cn(
                "size-4 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </button>
          {renderLeading?.(node)}
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => onChange(e.target.value)}
            onMouseDown={() => {
              if (!isSelected) {
                pendingFocus.set(node.id);
                onSelect(node.id);
              }
            }}
            onBlur={onBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                inputRef.current?.blur();
              }
            }}
            className={cn(
              "flex-1 truncate bg-transparent outline-none",
              rowClassName?.(node),
            )}
          />
          {renderActions && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
              {renderActions(node, { hasChildren })}
            </div>
          )}
        </div>
        <div
          ref={setBeforeRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[6px]"
        >
          {isOverBefore && (
            <div className="bg-primary absolute inset-x-1 top-0 h-[2px] rounded-full" />
          )}
        </div>
        <div
          ref={setAfterRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[6px]"
        >
          {isOverAfter && (
            <div className="bg-primary absolute inset-x-1 bottom-0 h-[2px] rounded-full" />
          )}
        </div>
      </div>
      {isOpen && (
        <div>
          {node.children.map((child: TreeNode<T>) => (
            <TreeRow
              key={child.id}
              {...props}
              node={child}
              depth={depth + 1}
            />
          ))}
          <button
            type="button"
            onClick={() => onAddChild(node.id)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center gap-1 rounded px-1 py-1 text-sm"
            style={{ paddingLeft: (depth + 1) * 16 + 4 }}
          >
            <span className="size-5 shrink-0" />
            <MdAdd className="size-4 shrink-0" />
            Add
          </button>
        </div>
      )}
    </div>
  );
}
