import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL } from "@plugins/conversations/plugins/model-provider/core";
import { toast } from "@plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { tasksResource } from "@plugins/tasks/core";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import {
  TaskDraftForm,
  makeCard,
  type CardDraft,
  type CaptureKind,
} from "./task-draft-form";
import type { ChainModel } from "./model-chip";
import { describeOutcome, submitChain } from "../internal/submit";
import type {
  TaskChainRelateMode,
  TaskChainTarget,
} from "@plugins/tasks/core";
import { useActiveRelateContext } from "../active-relate-context";

const HEAD_DEFAULT_MODEL: ChainModel = DEFAULT_MODEL;

function freshCards(): CardDraft[] {
  return [makeCard(HEAD_DEFAULT_MODEL)];
}

function draftScope(target: TaskChainTarget): string {
  return target.kind === "metaTask"
    ? `metaTask:${target.metaTaskId}`
    : `folder:${target.folderTaskId}`;
}

export interface TaskDraftRelate {
  taskId: string;
  defaultMode: TaskChainRelateMode;
}

export interface TaskDraftPopoverProps {
  trigger: ReactElement;
  tooltip?: ReactNode;
  target: TaskChainTarget;
  captures?: CaptureKind[];
  relate?: TaskDraftRelate;
  /** Initial markdown text for the head card. Images inline as attachment refs. */
  initialText?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  heading?: string;
  footerStart?: ReactNode;
  onSuccess?: (taskIds: string[]) => void;
}

export function TaskDraftPopover({
  trigger,
  tooltip,
  target,
  captures = ["url"],
  relate,
  initialText,
  open: controlledOpen,
  onOpenChange,
  heading,
  footerStart,
  onSuccess,
}: TaskDraftPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const [cards, setCards, clearCards] = useDraft<CardDraft[]>(
    "task-draft:cards",
    freshCards,
    { scope: draftScope(target) },
  );
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [relateMode, setRelateMode] = useState<TaskChainRelateMode | undefined>(
    relate?.defaultMode,
  );

  const activeRelate = useActiveRelateContext();
  const hasAmbientRelate = !relate && activeRelate !== null;
  const [ambientRelateMode, setAmbientRelateMode] = useState<
    TaskChainRelateMode | undefined
  >(undefined);
  const [insertBeforeIds, setInsertBeforeIds] = useState<Set<string>>(
    new Set(),
  );
  const [standalone, setStandalone] = useState(false);

  const tasksResult = useResource(tasksResource);
  const tasks = useMemo(() => (tasksResult.pending ? [] : tasksResult.data), [tasksResult]);

  const effectiveRelateTaskId =
    relate?.taskId ?? (hasAmbientRelate ? activeRelate?.taskId : null) ?? null;
  const effectiveRelateMode = relate ? relateMode : hasAmbientRelate ? ambientRelateMode : undefined;

  const relateTaskChildren = useMemo(
    () =>
      effectiveRelateTaskId && effectiveRelateMode === "followup"
        ? tasks
            .filter((t) => t.dependencies.includes(effectiveRelateTaskId))
            .map((t) => ({ id: t.id, title: t.title }))
        : [],
    [tasks, effectiveRelateTaskId, effectiveRelateMode],
  );

  const relateTaskHasDeps = useMemo(() => {
    if (!effectiveRelateTaskId || effectiveRelateMode !== "prerequisite") return false;
    const t = tasks.find((t) => t.id === effectiveRelateTaskId);
    return t ? t.dependencies.length > 0 : false;
  }, [tasks, effectiveRelateTaskId, effectiveRelateMode]);

  useEffect(() => {
    setInsertBeforeIds(new Set(relateTaskChildren.map((c) => c.id)));
  }, [relateTaskChildren]);

  const seenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const seen = seenIdsRef.current;
    let newest: string | null = null;
    for (const c of cards) {
      if (!seen.has(c.localId)) newest = c.localId;
    }
    seenIdsRef.current = new Set(cards.map((c) => c.localId));
    if (newest) setAutoFocusId(newest);
  }, [cards, setCards]);

  // When initialText arrives (draw-on-app screenshot), seed the head card so
  // the image appears inline in the editor via the paste-images machinery.
  useEffect(() => {
    if (!initialText) return;
    setUrl(window.location.href);
    setCards((prev) => [{ ...prev[0]!, text: initialText }, ...prev.slice(1)]);
    seenIdsRef.current = new Set();
  }, [initialText, setCards]);

  const setOpen = (next: boolean) => {
    if (next) {
      setUrl(window.location.href);
      seenIdsRef.current = new Set();
    }
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    }
  };

  const resetForm = () => {
    clearCards();
    seenIdsRef.current = new Set();
    setRelateMode(relate?.defaultMode);
    setAmbientRelateMode(undefined);
    setInsertBeforeIds(new Set());
    setStandalone(false);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const insertBefore =
        relateTaskChildren.length > 0 ? Array.from(insertBeforeIds) : undefined;

      const effectiveRelate =
        relate && relateMode
          ? {
              taskId: relate.taskId,
              mode: relateMode,
              insertBefore: relateMode === "followup" ? insertBefore : undefined,
              standalone: relateMode === "prerequisite" && standalone ? true : undefined,
            }
          : hasAmbientRelate && ambientRelateMode
            ? {
                taskId: activeRelate!.taskId,
                mode: ambientRelateMode,
                insertBefore: ambientRelateMode === "followup" ? insertBefore : undefined,
                standalone: ambientRelateMode === "prerequisite" && standalone ? true : undefined,
              }
            : undefined;

      const effectiveTarget: TaskChainTarget =
        hasAmbientRelate && ambientRelateMode
          ? { kind: "folder", folderTaskId: activeRelate!.taskId }
          : target;

      const outcome = await submitChain({
        cards,
        target: effectiveTarget,
        relate: effectiveRelate,
        url,
        beforeScreenshot: () => setOpen(false),
      });
      if (!outcome.ok) {
        toast({
          type: "task",
          title: "Task submit failed",
          description: outcome.errorMessage ?? "Submit failed",
          variant: "error",
        });
        return;
      }
      toast({ type: "task", ...describeOutcome(outcome, cards), variant: "success" });
      onSuccess?.(outcome.taskIds ?? []);
      resetForm();
      setOpen(false);
    } catch (err) {
      toast({
        type: "task",
        title: "Task submit failed",
        description: (err as Error).message,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      tooltip={tooltip}
    >
      <TaskDraftForm
        cards={cards}
        onCardsChange={setCards}
        autoFocusId={autoFocusId}
        onAutoFocusHandled={() => setAutoFocusId(null)}
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => setOpen(false)}
        captures={captures}
        relateMode={
          relate ? relateMode : hasAmbientRelate ? ambientRelateMode : undefined
        }
        onRelateModeChange={
          relate
            ? setRelateMode
            : hasAmbientRelate
              ? setAmbientRelateMode
              : undefined
        }
        showIndependentRelate={hasAmbientRelate}
        relateTaskChildren={relateTaskChildren}
        insertBeforeIds={insertBeforeIds}
        onInsertBeforeChange={setInsertBeforeIds}
        standalone={standalone}
        onStandaloneChange={setStandalone}
        showStandalone={relateTaskHasDeps}
        heading={heading}
        footerStart={footerStart}
      />
    </InlinePopover>
  );
}
