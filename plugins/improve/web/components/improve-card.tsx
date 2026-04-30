import { type CSSProperties } from "react";
import { MdClose, MdDragIndicator } from "react-icons/md";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";
import { cn } from "@/lib/utils";
import { ModelChip, type ChainModel } from "./model-chip";

export interface ImproveCardProps {
  cardId: string;
  index: number;
  text: string;
  model: ChainModel;
  autoFocus: boolean;
  removable: boolean;
  disabled: boolean;
  includeUrl: boolean;
  onToggleUrl: (v: boolean) => void;
  includeScreenshot: boolean;
  onToggleScreenshot: (v: boolean) => void;
  onTextChange: (next: string) => void;
  onModelChange: (next: ChainModel) => void;
  onRemove: () => void;
  onSubmitChord: () => void;
  isHead?: boolean;
}

function ContextRow({
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  disabled,
}: {
  includeUrl: boolean;
  onToggleUrl: (v: boolean) => void;
  includeScreenshot: boolean;
  onToggleScreenshot: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-1.5">
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-3 w-3 cursor-pointer"
          checked={includeUrl}
          disabled={disabled}
          onChange={(e) => onToggleUrl(e.target.checked)}
        />
        URL
      </label>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-3 w-3 cursor-pointer"
          checked={includeScreenshot}
          disabled={disabled}
          onChange={(e) => onToggleScreenshot(e.target.checked)}
        />
        Screenshot
      </label>
    </div>
  );
}

export function ImproveCard({
  cardId,
  index,
  text,
  model,
  autoFocus,
  removable,
  disabled,
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  onTextChange,
  onModelChange,
  onRemove,
  onSubmitChord,
  isHead = false,
}: ImproveCardProps) {
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
        <PromptEditor
          value={text}
          onChange={onTextChange}
          onSubmit={onSubmitChord}
          submitMode="cmd-enter"
          placeholder={isHead ? "What should be improved?" : "Next task…"}
          disabled={disabled}
          autoFocus={autoFocus}
          minRows={isHead ? 5 : 2}
          maxHeight={isHead ? "20rem" : "8rem"}
          namespace={`improve-card-${cardId}`}
        />
      </div>
      <div className="flex items-center justify-between pt-1.5">
        <ModelChip value={model} onChange={onModelChange} disabled={disabled} />
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
    </div>
  );
}
