import { type CSSProperties } from "react";
import { MdClose, MdDragIndicator } from "react-icons/md";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { cn } from "@/lib/utils";
import { ModelChip, type ChainModel } from "./model-chip";
import { RelateModeChip } from "./relate-mode-chip";
import {
  InsertBeforeChildren,
  type ChildEntry,
} from "./insert-before-children";
import type { TaskChainRelateMode } from "@plugins/tasks/core";

export interface TaskDraftCardProps {
  cardId: string;
  index: number;
  text: string;
  model: ChainModel;
  autoFocus: boolean;
  removable: boolean;
  disabled: boolean;
  onTextChange: (next: string) => void;
  onModelChange: (next: ChainModel) => void;
  onRemove: () => void;
  onSubmitChord: () => void;
  isHead?: boolean;

  // Capture-context toggles. Each is rendered iff the corresponding
  // capability is enabled by the host (omitted handlers = capability off).
  includeUrl?: boolean;
  onToggleUrl?: (v: boolean) => void;
  includeScreenshot?: boolean;
  onToggleScreenshot?: (v: boolean) => void;

  // Head-card-only relate toggle.
  relateMode?: TaskChainRelateMode | undefined;
  onRelateModeChange?: (next: TaskChainRelateMode | undefined) => void;
  showIndependentRelate?: boolean;
  // Insert-before-children (follow-up with children).
  relateTaskChildren?: ChildEntry[];
  insertBeforeIds?: Set<string>;
  onInsertBeforeChange?: (next: Set<string>) => void;
  // Standalone prerequisite.
  standalone?: boolean;
  onStandaloneChange?: (next: boolean) => void;
  showStandalone?: boolean;
}

function ContextRow({
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  disabled,
}: {
  includeUrl?: boolean;
  onToggleUrl?: (v: boolean) => void;
  includeScreenshot?: boolean;
  onToggleScreenshot?: (v: boolean) => void;
  disabled: boolean;
}) {
  const showUrl = !!onToggleUrl;
  const showScreenshot = !!onToggleScreenshot;
  if (!showUrl && !showScreenshot) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5">
      {showUrl && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 cursor-pointer"
            checked={!!includeUrl}
            disabled={disabled}
            onChange={(e) => onToggleUrl!(e.target.checked)}
          />
          URL
        </label>
      )}
      {showScreenshot && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 cursor-pointer"
            checked={!!includeScreenshot}
            disabled={disabled}
            onChange={(e) => onToggleScreenshot!(e.target.checked)}
          />
          Screenshot
        </label>
      )}
    </div>
  );
}

export function TaskDraftCard({
  cardId,
  index,
  text,
  model,
  autoFocus,
  removable,
  disabled,
  onTextChange,
  onModelChange,
  onRemove,
  onSubmitChord,
  isHead = false,
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  relateMode,
  onRelateModeChange,
  showIndependentRelate,
  relateTaskChildren,
  insertBeforeIds,
  onInsertBeforeChange,
  standalone,
  onStandaloneChange,
  showStandalone,
}: TaskDraftCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cardId });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const showRelate = isHead && !!onRelateModeChange;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-card-index={index}
      {...attributes}
      {...listeners}
      className={cn(
        "border-border bg-background group relative flex flex-col rounded-md border p-2 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      <MdDragIndicator className="pointer-events-none absolute right-1.5 top-1.5 size-3 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
      <div onPointerDown={(e) => e.stopPropagation()} className="cursor-auto">
        <TextEditor
          value={text}
          onChange={onTextChange}
          onSubmit={onSubmitChord}
          submitMode="cmd-enter"
          placeholder={isHead ? "Describe the task…" : "Next task…"}
          disabled={disabled}
          autoFocus={autoFocus}
          minRows={isHead ? 5 : 2}
          maxHeight={isHead ? "20rem" : "8rem"}
          namespace={`task-draft-card-${cardId}`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <ModelChip value={model} onChange={onModelChange} disabled={disabled} />
          {showRelate && (
            <RelateModeChip
              value={relateMode}
              onChange={onRelateModeChange!}
              showIndependent={showIndependentRelate}
              disabled={disabled}
            />
          )}
        </div>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove task"
            title="Remove task"
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded cursor-pointer"
          >
            <MdClose className="size-3.5" />
          </button>
        )}
      </div>
      <ContextRow
        includeUrl={includeUrl}
        onToggleUrl={onToggleUrl}
        includeScreenshot={includeScreenshot}
        onToggleScreenshot={onToggleScreenshot}
        disabled={disabled}
      />
      {relateTaskChildren &&
        relateTaskChildren.length > 0 &&
        insertBeforeIds &&
        onInsertBeforeChange && (
          <InsertBeforeChildren
            children={relateTaskChildren}
            selectedIds={insertBeforeIds}
            onChange={onInsertBeforeChange}
            disabled={disabled}
          />
        )}
      {showStandalone && onStandaloneChange && (
        <div className="px-2 py-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3 w-3 cursor-pointer"
              checked={!!standalone}
              disabled={disabled}
              onChange={(e) => onStandaloneChange(e.target.checked)}
            />
            Standalone (don't inherit existing dependencies)
          </label>
        </div>
      )}
    </div>
  );
}
