import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TaskDraftCard } from "./task-draft-card";
import { ChainConnector } from "./chain-connector";
import type { ChildEntry } from "./insert-before-children";
import type { TaskChainRelateMode } from "@plugins/tasks/core";
import {
  useLaunchOptionDefaults,
  type LaunchOptionValues,
} from "@plugins/tasks/plugins/launch-options/web";
import { useCaptureUrlDefault } from "../use-capture-url-default";

export interface CardDraft {
  localId: string;
  text: string;
  // Contributed launch-option values keyed by option id (see
  // `@plugins/tasks/plugins/launch-options`). Open by construction, so a new
  // option needs no field here.
  options: LaunchOptionValues;
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
  /**
   * Receives the head card editor's insert-at-caret handle while it is mounted,
   * so the host can route programmatic inserts (see `TaskDraftPopover`'s insert
   * funnel) through the same path the in-form action buttons use.
   */
  headInsertRef?: React.MutableRefObject<((snippet: string) => void) | null>;
}

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
  options: LaunchOptionValues,
  includeUrl = false,
): CardDraft {
  return {
    localId: crypto.randomUUID(),
    text: "",
    options,
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
  headInsertRef,
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
  const optionDefaults = useLaunchOptionDefaults();
  const supportsUrl = captures.includes("url");
  const supportsScreenshot = captures.includes("screenshot");
  const captureUrlDefault = supportsUrl && appCaptureUrlDefault;

  const updateCard = (idx: number, patch: Partial<CardDraft>) => {
    const next = cards.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onCardsChange(next);
  };

  // A new card inherits the neighbour's whole launch configuration — one spread,
  // so a future option is carried along without touching this.
  const cardAfter = (inheritFrom: CardDraft | undefined) =>
    makeCard(
      { ...optionDefaults, ...inheritFrom?.options },
      inheritFrom?.includeUrl ?? captureUrlDefault,
    );

  const insertAt = (idx: number) => {
    if (submitting) return;
    const card = cardAfter(cards[idx] ?? cards[idx - 1]);
    const next = [...cards.slice(0, idx), card, ...cards.slice(idx)];
    onCardsChange(next);
  };

  const appendChainCard = () => {
    if (submitting) return;
    onCardsChange([...cards, cardAfter(cards[cards.length - 1])]);
  };

  const toggleLink = (idx: number) => {
    onCardsChange(
      cards.map((c, i) =>
        i === idx ? { ...c, linkedToPrev: !c.linkedToPrev } : c,
      ),
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
    <Stack
      gap="sm"
      className={`w-[480px] ${isAgentWorktree ? "rounded-lg border-2 border-destructive/60 p-md" : ""}`}
    >
      {isAgentWorktree && (
        <Stack
          direction="row"
          align="center"
          gap="xs"
          className="text-destructive"
        >
          <MdScience className="size-3.5" />
          <Text as="span" variant="caption" className="font-medium">
            Experimental — tasks target main from an agent worktree
          </Text>
        </Stack>
      )}
      <Text
        as="div"
        variant="caption"
        className="text-muted-foreground font-medium"
      >
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
          <Stack gap="none">
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
                    insertRef={isHead ? headInsertRef : undefined}
                    cardId={card.localId}
                    index={idx}
                    text={card.text}
                    launchOptions={card.options}
                    autoFocus={autoFocusId === card.localId}
                    removable={cards.length > 1}
                    disabled={submitting}
                    onTextChange={(t) => updateCard(idx, { text: t })}
                    onLaunchOptionsChange={(o) =>
                      updateCard(idx, { options: o })
                    }
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
                    showIndependentRelate={
                      isHead ? showIndependentRelate : undefined
                    }
                    relateTaskChildren={
                      isHead && relateMode === "followup"
                        ? relateTaskChildren
                        : undefined
                    }
                    insertBeforeIds={isHead ? insertBeforeIds : undefined}
                    onInsertBeforeChange={
                      isHead ? onInsertBeforeChange : undefined
                    }
                    standalone={
                      isHead && relateMode === "prerequisite"
                        ? standalone
                        : undefined
                    }
                    onStandaloneChange={
                      isHead && relateMode === "prerequisite"
                        ? onStandaloneChange
                        : undefined
                    }
                    showStandalone={
                      isHead && relateMode === "prerequisite"
                        ? showStandalone
                        : undefined
                    }
                  />
                </Fragment>
              );
            })}
          </Stack>
        </SortableContext>
      </DndContext>

      <Stack align="start" gap="none">
        <Button
          variant="ghost"
          onClick={appendChainCard}
          loading={submitting}
          className="text-muted-foreground"
        >
          <MdAdd className="size-3.5" />+ task
        </Button>
      </Stack>

      <Stack
        direction="row"
        gap="sm"
        align="center"
        className="border-border border-t pt-sm"
      >
        {footerStart}
        {/* Empty grow cell: it absorbs the slack so Cancel/Submit sit flush-right. */}
        <Fill />
        <Button variant="ghost" onClick={onCancel} loading={submitting}>
          Cancel
        </Button>
        <Button onClick={onSubmit} loading={submitting} disabled={hasEmpty}>
          {isMulti ? "Submit chain" : "Submit"}
        </Button>
      </Stack>
    </Stack>
  );
}
