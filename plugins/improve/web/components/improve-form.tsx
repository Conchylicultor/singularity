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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  conversationGroupsResource,
  type ConversationGroup,
} from "@plugins/conversations/plugins/conversation-groups/shared";
import { ImproveCard } from "./improve-card";
import { ChainConnector } from "./chain-connector";
import type { ChainModel } from "./model-chip";

export interface CardDraft {
  localId: string;
  text: string;
  model: ChainModel;
  includeUrl: boolean;
  includeScreenshot: boolean;
}

export interface PrefilledAttachment {
  id: string;
  filename: string;
}

export interface ImproveFormProps {
  cards: CardDraft[];
  onCardsChange: (next: CardDraft[]) => void;
  autoFocusId: string | null;
  onAutoFocusHandled: () => void;
  prefilledAttachments?: PrefilledAttachment[];
  groupId: string | null;
  onGroupChange: (id: string | null) => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

const NEW_CARD_DEFAULT_MODEL: ChainModel = "sonnet";

export function makeCard(model: ChainModel): CardDraft {
  return {
    localId: crypto.randomUUID(),
    text: "",
    model,
    includeUrl: false,
    includeScreenshot: false,
  };
}

export function ImproveForm({
  cards,
  onCardsChange,
  autoFocusId,
  onAutoFocusHandled,
  prefilledAttachments,
  groupId,
  onGroupChange,
  submitting,
  onSubmit,
  onCancel,
}: ImproveFormProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const { data: groupsData } = useResource(conversationGroupsResource);
  const groups = groupsData?.groups ?? [];

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
    const inheritFrom = cards[idx] ?? cards[idx - 1];
    const model = inheritFrom?.model ?? NEW_CARD_DEFAULT_MODEL;
    const card = makeCard(model);
    const next = [...cards.slice(0, idx), card, ...cards.slice(idx)];
    onCardsChange(next);
  };

  const appendChainCard = () => {
    if (submitting) return;
    const inheritFrom = cards[cards.length - 1];
    const model = inheritFrom?.model ?? NEW_CARD_DEFAULT_MODEL;
    onCardsChange([...cards, makeCard(model)]);
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
    <div className="flex w-[480px] flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-xs font-medium">
          Improve this app
        </div>
        {groups.length > 0 && (
          <Select
            value={groupId ?? "none"}
            onValueChange={(v: string | null) => onGroupChange(!v || v === "none" ? null : v)}
            disabled={submitting}
          >
            <SelectTrigger className="h-6 w-auto max-w-[180px] gap-1 border-0 px-2 text-xs shadow-none">
              <SelectValue placeholder="No group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No group</SelectItem>
              {groups.map((g: ConversationGroup) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
            {cards.map((card, idx) => (
              <Fragment key={card.localId}>
                {idx > 0 && (
                  <ChainConnector
                    showBlocksLabel={true}
                    disabled={submitting || !!draggingId}
                    onInsert={() => insertAt(idx)}
                  />
                )}
                <ImproveCard
                  isHead={idx === 0}
                  cardId={card.localId}
                  index={idx}
                  text={card.text}
                  model={card.model}
                  autoFocus={autoFocusId === card.localId}
                  removable={cards.length > 1}
                  disabled={submitting}
                  includeUrl={card.includeUrl}
                  onToggleUrl={(v) => updateCard(idx, { includeUrl: v })}
                  includeScreenshot={card.includeScreenshot}
                  onToggleScreenshot={(v) => updateCard(idx, { includeScreenshot: v })}
                  onTextChange={(t) => updateCard(idx, { text: t })}
                  onModelChange={(m) => updateCard(idx, { model: m })}
                  onRemove={() => removeAt(idx)}
                  onSubmitChord={() => { if (!disabled) onSubmit(); }}
                />
              </Fragment>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        size="sm"
        variant="ghost"
        onClick={appendChainCard}
        disabled={submitting}
        className="text-muted-foreground self-start"
      >
        <MdAdd className="size-3.5" />
        + task
      </Button>

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
