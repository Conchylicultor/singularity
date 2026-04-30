import { type ReactNode, useEffect, useRef, useState } from "react";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, type Task } from "@plugins/tasks/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TaskDraftForm,
  makeCard,
  type CardDraft,
  type CaptureKind,
  type PrefilledAttachment,
} from "./task-draft-form";
import type { ChainModel } from "./model-chip";
import { describeOutcome, submitChain } from "../internal/submit";
import type {
  TaskChainRelateMode,
  TaskChainTarget,
} from "../../shared/types";

const HEAD_DEFAULT_MODEL: ChainModel = "sonnet";

function freshCards(): CardDraft[] {
  return [makeCard(HEAD_DEFAULT_MODEL)];
}

export interface TaskDraftRelate {
  taskId: string;
  defaultMode: TaskChainRelateMode;
}

export interface TaskDraftPopoverProps {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
  target: TaskChainTarget;
  captures?: CaptureKind[];
  relate?: TaskDraftRelate;
  prefilledAttachments?: PrefilledAttachment[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  heading?: string;
}

export function TaskDraftPopover({
  trigger,
  triggerClassName,
  triggerTitle,
  target,
  captures = ["url"],
  relate,
  prefilledAttachments,
  open: controlledOpen,
  onOpenChange,
  heading,
}: TaskDraftPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const [cards, setCards] = useState<CardDraft[]>(freshCards);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [relateMode, setRelateMode] = useState<TaskChainRelateMode | undefined>(
    relate?.defaultMode,
  );

  // Resolve the parent task for "child" target so we can render the preview
  // ("Will include: <title>") next to the parent-task toggle.
  const parentTaskId = target.kind === "child" ? target.parentTaskId : null;
  const { data: tasks } = useResource(tasksResource);
  const parentTask: Task | null =
    parentTaskId && tasks ? tasks.find((t) => t.id === parentTaskId) ?? null : null;

  const seenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const seen = seenIdsRef.current;
    let newest: string | null = null;
    for (const c of cards) {
      if (!seen.has(c.localId)) newest = c.localId;
    }
    seenIdsRef.current = new Set(cards.map((c) => c.localId));
    if (newest) setAutoFocusId(newest);
  }, [cards]);

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
    setCards(freshCards());
    seenIdsRef.current = new Set();
    setRelateMode(relate?.defaultMode);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const outcome = await submitChain({
        cards,
        target,
        relate:
          relate && relateMode
            ? { taskId: relate.taskId, mode: relateMode }
            : undefined,
        url,
        prefilledAttachments: prefilledAttachments ?? [],
        beforeScreenshot: () => setOpen(false),
      });
      if (!outcome.ok) {
        Shell.Toast({
          description: outcome.errorMessage ?? "Submit failed",
          variant: "error",
        });
        return;
      }
      Shell.Toast({ description: describeOutcome(outcome, cards), variant: "success" });
      resetForm();
      setOpen(false);
    } catch (err) {
      Shell.Toast({
        description: `Submit failed: ${(err as Error).message}`,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName} title={triggerTitle} aria-label={triggerTitle}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent>
        <TaskDraftForm
          cards={cards}
          onCardsChange={setCards}
          autoFocusId={autoFocusId}
          onAutoFocusHandled={() => setAutoFocusId(null)}
          prefilledAttachments={prefilledAttachments}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
          captures={captures}
          parentTaskPreview={
            parentTask ? { id: parentTask.id, title: parentTask.title } : null
          }
          relateMode={relate ? relateMode : undefined}
          onRelateModeChange={relate ? setRelateMode : undefined}
          heading={heading}
        />
      </PopoverContent>
    </Popover>
  );
}
