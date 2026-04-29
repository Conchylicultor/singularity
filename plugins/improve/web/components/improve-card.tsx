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
  onTextChange: (next: string) => void;
  onModelChange: (next: ChainModel) => void;
  onRemove: () => void;
  onSubmitChord: () => void;
}

export function ImproveCard({
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
      className={cn(
        "border-border bg-background flex items-start gap-1.5 rounded-md border p-1.5",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground mt-1 flex size-5 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
      >
        <MdDragIndicator className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <PromptEditor
          value={text}
          onChange={onTextChange}
          onSubmit={onSubmitChord}
          submitMode="cmd-enter"
          placeholder={index === 0 ? "What should be improved?" : "Next task…"}
          disabled={disabled}
          autoFocus={autoFocus}
          minRows={3}
          maxHeight="14rem"
          namespace={`improve-card-${cardId}`}
        />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ModelChip value={model} onChange={onModelChange} disabled={disabled} />
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove task"
            title="Remove task"
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded"
          >
            <MdClose className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
