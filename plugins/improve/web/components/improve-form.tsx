import { Fragment, useEffect, useState } from "react";
import { MdAdd } from "react-icons/md";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { ImproveCard } from "./improve-card";
import { ChainConnector } from "./chain-connector";
import type { ChainModel } from "./model-chip";

export interface CardDraft {
  localId: string;
  text: string;
  model: ChainModel;
}

export interface PrefilledAttachment {
  id: string;
  filename: string;
}

export interface ImproveFormProps {
  cards: CardDraft[];
  onCardsChange: (next: CardDraft[]) => void;
  // Local id of the card that should grab focus on next render (e.g. after
  // insert/append). Cleared by the form via `onAutoFocusHandled` once used.
  autoFocusId: string | null;
  onAutoFocusHandled: () => void;
  includeUrl: boolean;
  onToggleUrl: (next: boolean) => void;
  includeScreenshot: boolean;
  onToggleScreenshot: (next: boolean) => void;
  // Attachments prefilled by external openers (e.g. screenshot edit). Rendered
  // as thumbnails above the cards; submitted with the chain alongside any
  // freshly-captured screenshot.
  prefilledAttachments?: PrefilledAttachment[];
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

const NEW_CARD_DEFAULT_MODEL: ChainModel = "sonnet";

function makeCard(model: ChainModel): CardDraft {
  return {
    localId: crypto.randomUUID(),
    text: "",
    model,
  };
}

export function ImproveForm({
  cards,
  onCardsChange,
  autoFocusId,
  onAutoFocusHandled,
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  prefilledAttachments,
  submitting,
  onSubmit,
  onCancel,
}: ImproveFormProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Once a card has been focused, clear the focus token so re-renders don't
  // keep stealing focus away from whatever the user is currently editing.
  useEffect(() => {
    if (autoFocusId) {
      const t = window.setTimeout(onAutoFocusHandled, 0);
      return () => window.clearTimeout(t);
    }
  }, [autoFocusId, onAutoFocusHandled]);

  const isMulti = cards.length > 1;
  const hasEmpty = cards.some((c) => !c.text.trim());
  const disabled = hasEmpty || submitting;
  const attachments = prefilledAttachments ?? [];

  const updateCard = (idx: number, patch: Partial<CardDraft>) => {
    const next = cards.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onCardsChange(next);
  };

  const insertAt = (idx: number) => {
    if (submitting) return;
    // Inherit model from the card we're inserting before (if any), else the
    // previous card, else the default. Keeps the per-card chip stable across
    // common edits.
    const inheritFrom = cards[idx] ?? cards[idx - 1];
    const model = inheritFrom?.model ?? NEW_CARD_DEFAULT_MODEL;
    const card = makeCard(model);
    const next = [...cards.slice(0, idx), card, ...cards.slice(idx)];
    onCardsChange(next);
  };

  const removeAt = (idx: number) => {
    if (submitting || cards.length <= 1) return;
    const next = cards.filter((_, i) => i !== idx);
    onCardsChange(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = cards.findIndex((c) => c.localId === active.id);
    const to = cards.findIndex((c) => c.localId === over.id);
    if (from < 0 || to < 0) return;
    onCardsChange(arrayMove(cards, from, to));
  };

  return (
    <div className="flex w-[440px] flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        Improve this app
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <img
              key={a.id}
              src={`/api/attachments/${a.id}`}
              alt={a.filename}
              className="max-h-32 w-full rounded border object-contain"
            />
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDraggingId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <SortableContext
          items={cards.map((c) => c.localId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col">
            {cards.map((card, idx) => {
              const showLabel = idx > 0;
              return (
                <Fragment key={card.localId}>
                  <ChainConnector
                    showBlocksLabel={showLabel}
                    disabled={submitting || !!draggingId}
                    onInsert={() => insertAt(idx)}
                  />
                  <ImproveCard
                    cardId={card.localId}
                    index={idx}
                    text={card.text}
                    model={card.model}
                    autoFocus={autoFocusId === card.localId}
                    removable={isMulti}
                    disabled={submitting}
                    onTextChange={(t) => updateCard(idx, { text: t })}
                    onModelChange={(m) => updateCard(idx, { model: m })}
                    onRemove={() => removeAt(idx)}
                    onSubmitChord={() => {
                      if (!disabled) onSubmit();
                    }}
                  />
                </Fragment>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        size="sm"
        variant="ghost"
        onClick={() => insertAt(cards.length)}
        disabled={submitting}
        className="text-muted-foreground self-start"
      >
        <MdAdd className="size-3.5" />
        Add task
      </Button>

      <div className="flex flex-col gap-1 pt-1">
        <div className="text-muted-foreground text-xs font-medium">
          Context{" "}
          {isMulti ? <span className="opacity-70">(applies to head)</span> : null}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer"
            checked={includeUrl}
            onChange={(e) => onToggleUrl(e.target.checked)}
          />
          URL
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer"
            checked={includeScreenshot}
            onChange={(e) => onToggleScreenshot(e.target.checked)}
          />
          Screenshot
        </label>
      </div>

      <div className="border-border flex items-center justify-end gap-2 border-t pt-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={disabled}>
          {submitting
            ? isMulti
              ? "Submitting chain…"
              : "Submitting…"
            : isMulti
              ? "Submit chain"
              : "Submit"}
        </Button>
      </div>
    </div>
  );
}
