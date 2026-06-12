import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_MODEL } from "@plugins/conversations/plugins/model-provider/core";
import { MdAdd, MdScience } from "react-icons/md";
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
import { Text } from "@plugins/primitives/plugins/text/web";
import { TaskDraftCard } from "./task-draft-card";
import { ChainConnector } from "./chain-connector";
import type { ChildEntry } from "./insert-before-children";
import type { ChainModel } from "./model-chip";
import type { TaskChainRelateMode } from "@plugins/tasks/core";
import { useCaptureUrlDefault } from "../use-capture-url-default";

export interface CardDraft {
  localId: string;
  text: string;
  model: ChainModel;
  // Selected preprompt id (config list-item) appended to the agent's system
  // prompt on launch. null = none.
  prepromptId: string | null;
  includeUrl: boolean;
  includeScreenshot: boolean;
  linkedToPrev: boolean;
}

export type CaptureKind = "url" | "screenshot";

export interface TaskDraftFormProps {
  cards: CardDraft[];
  onCardsChange: (next: CardDraft[]) => void;
  autoFocusId: string | null;
  onAutoFocusHandled: () => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  captures: CaptureKind[];
  // Head-card relate toggle (only rendered when both are supplied).
  relateMode?: TaskChainRelateMode | undefined;
  onRelateModeChange?: (next: TaskChainRelateMode | undefined) => void;
  showIndependentRelate?: boolean;
  // Insert-before-children (follow-up mode with children).
  relateTaskChildren?: ChildEntry[];
  insertBeforeIds?: Set<string>;
  onInsertBeforeChange?: (next: Set<string>) => void;
  // Standalone prerequisite (don't transfer target's existing deps).
  standalone?: boolean;
  onStandaloneChange?: (next: boolean) => void;
  showStandalone?: boolean;
  heading?: string;
  footerStart?: ReactNode;
}

const NEW_CARD_DEFAULT_MODEL: ChainModel = DEFAULT_MODEL;

function useIsAgentWorktree(): boolean {
  return useMemo(() => {
    const host = window.location.hostname;
    const wt = host.endsWith(".localhost")
      ? host.replace(/\.localhost$/, "")
      : "head";
    return wt !== "head" && wt !== "singularity";
  }, []);
}

export function makeCard(
  model: ChainModel,
  prepromptId: string | null = null,
  includeUrl = false,
): CardDraft {
  return {
    localId: crypto.randomUUID(),
    text: "",
    model,
    prepromptId,
    includeUrl,
    includeScreenshot: false,
    linkedToPrev: true,
  };
}

export function TaskDraftForm({
  cards,
  onCardsChange,
  autoFocusId,
  onAutoFocusHandled,
  submitting,
  onSubmit,
  onCancel,
  captures,
  relateMode,
  onRelateModeChange,
  showIndependentRelate,
  relateTaskChildren,
  insertBeforeIds,
  onInsertBeforeChange,
  standalone,
  onStandaloneChange,
  showStandalone,
  heading,
  footerStart,
}: TaskDraftFormProps) {
  const isAgentWorktree = useIsAgentWorktree();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    if (autoFocusId) {
      const t = window.setTimeout(onAutoFocusHandled, 0);
      return () => window.clearTimeout(t);
    }
  }, [autoFocusId, onAutoFocusHandled]);

  const isMulti = cards.length > 1;
  const hasEmpty = cards.some((c) => !c.text.trim());
  const disabled = hasEmpty || submitting;
  const appCaptureUrlDefault = useCaptureUrlDefault();
  const supportsUrl = captures.includes("url");
  const supportsScreenshot = captures.includes("screenshot");
  const captureUrlDefault = supportsUrl && appCaptureUrlDefault;

  const updateCard = (idx: number, patch: Partial<CardDraft>) => {
    const next = cards.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onCardsChange(next);
  };

  const insertAt = (idx: number) => {
    if (submitting) return;
    const inheritFrom = cards[idx] ?? cards[idx - 1];
    const model = inheritFrom?.model ?? NEW_CARD_DEFAULT_MODEL;
    const card = makeCard(
      model,
      inheritFrom?.prepromptId ?? null,
      inheritFrom?.includeUrl ?? captureUrlDefault,
    );
    const next = [...cards.slice(0, idx), card, ...cards.slice(idx)];
    onCardsChange(next);
  };

  const appendChainCard = () => {
    if (submitting) return;
    const inheritFrom = cards[cards.length - 1];
    const model = inheritFrom?.model ?? NEW_CARD_DEFAULT_MODEL;
    onCardsChange([
      ...cards,
      makeCard(
        model,
        inheritFrom?.prepromptId ?? null,
        inheritFrom?.includeUrl ?? captureUrlDefault,
      ),
    ]);
  };

  const toggleLink = (idx: number) => {
    onCardsChange(
      cards.map((c, i) => (i === idx ? { ...c, linkedToPrev: !c.linkedToPrev } : c)),
    );
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
    <div
      className={`flex w-[480px] flex-col gap-sm ${isAgentWorktree ? "rounded-lg border-2 border-destructive/60 p-md" : ""}`}
    >
      {isAgentWorktree && (
        <Text as="div" variant="caption" className="flex items-center gap-xs font-medium text-destructive">
          <MdScience className="size-3.5" />
          Experimental — tasks target main from an agent worktree
        </Text>
      )}
      <Text as="div" variant="caption" className="text-muted-foreground font-medium">
        {heading ?? "Draft tasks"}
      </Text>

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
              const isHead = idx === 0;
              return (
                <Fragment key={card.localId}>
                  {idx > 0 && (
                    <ChainConnector
                      linked={card.linkedToPrev}
                      onToggle={() => toggleLink(idx)}
                      disabled={submitting || !!draggingId}
                      onInsert={() => insertAt(idx)}
                    />
                  )}
                  <TaskDraftCard
                    isHead={isHead}
                    cardId={card.localId}
                    index={idx}
                    text={card.text}
                    model={card.model}
                    prepromptId={card.prepromptId}
                    autoFocus={autoFocusId === card.localId}
                    removable={cards.length > 1}
                    disabled={submitting}
                    onTextChange={(t) => updateCard(idx, { text: t })}
                    onModelChange={(m) => updateCard(idx, { model: m })}
                    onPrepromptChange={(p) => updateCard(idx, { prepromptId: p })}
                    onRemove={() => removeAt(idx)}
                    onSubmitChord={() => {
                      if (!disabled) onSubmit();
                    }}
                    includeUrl={supportsUrl ? card.includeUrl : undefined}
                    onToggleUrl={
                      supportsUrl
                        ? (v) => updateCard(idx, { includeUrl: v })
                        : undefined
                    }
                    includeScreenshot={
                      supportsScreenshot ? card.includeScreenshot : undefined
                    }
                    onToggleScreenshot={
                      supportsScreenshot
                        ? (v) => updateCard(idx, { includeScreenshot: v })
                        : undefined
                    }
                    relateMode={isHead ? relateMode : undefined}
                    onRelateModeChange={isHead ? onRelateModeChange : undefined}
                    showIndependentRelate={isHead ? showIndependentRelate : undefined}
                    relateTaskChildren={
                      isHead && relateMode === "followup"
                        ? relateTaskChildren
                        : undefined
                    }
                    insertBeforeIds={isHead ? insertBeforeIds : undefined}
                    onInsertBeforeChange={isHead ? onInsertBeforeChange : undefined}
                    standalone={isHead && relateMode === "prerequisite" ? standalone : undefined}
                    onStandaloneChange={isHead && relateMode === "prerequisite" ? onStandaloneChange : undefined}
                    showStandalone={isHead && relateMode === "prerequisite" ? showStandalone : undefined}
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
        onClick={appendChainCard}
        disabled={submitting}
        className="text-muted-foreground self-start"
      >
        <MdAdd className="size-3.5" />
        + task
      </Button>

      <div className="border-border flex items-center gap-sm border-t pt-sm">
        {footerStart}
        <div className="flex-1" />
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
