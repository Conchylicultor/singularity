import { useCallback, useMemo, useRef, useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  draftInsert,
  TaskDraftPopover,
  type TaskDraftInsert,
} from "@plugins/tasks/plugins/task-draft-form/web";
import type { ConfigConflictContext } from "@plugins/config_v2/plugins/settings/web";
import { buildConflictPrompt } from "../internal/build-prompt";
import { CONFIG_CATEGORY_ID } from "../../shared/constants";

/**
 * "Ask an agent" inside a config conflict banner: opens the standard task-draft
 * popover with the conflict already written out as the task's first turn, so the
 * user can launch an agent instead of deciding field-by-field alone.
 */
export function ConflictAgentButton({
  conflict,
}: {
  conflict: ConfigConflictContext;
}) {
  const [open, setOpen] = useState(false);
  const [insert, setInsert] = useState<TaskDraftInsert | undefined>(undefined);

  const prompt = useMemo(() => buildConflictPrompt(conflict), [conflict]);

  // The seeding rule, and why it is not a render-time value.
  //
  // `insert` is a ONE-SHOT REQUEST: the popover applies each distinct request id
  // exactly once and APPENDS it to the persisted draft — which is shared by
  // every surface filing into this category, and survives with the popover
  // closed. So minting one in render would append this conflict's prompt to the
  // user's draft merely because they opened the config page, and again on every
  // re-render.
  //
  // Mint it on the open transition only, and only when the prompt is not the one
  // already seeded — the prompt string IS the signature, so reopening the
  // popover on the same unchanged conflict adds nothing, while a conflict that
  // has actually moved (a field resolved, a different descriptor) re-seeds.
  // `onSuccess` clears the mark so the next draft, after a submission, gets the
  // description again.
  const seededPromptRef = useRef<string | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next && seededPromptRef.current !== prompt) {
        seededPromptRef.current = prompt;
        setInsert(draftInsert(prompt));
      }
      setOpen(next);
    },
    [prompt],
  );

  const handleSuccess = useCallback(() => {
    seededPromptRef.current = null;
  }, []);

  return (
    <TaskDraftPopover
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant="ghost" className={conflict.actionClassName}>
          <MdAutoAwesome className="size-3.5" />
          Ask an agent
        </Button>
      }
      tooltip="Launch an agent to resolve this conflict"
      target={{ kind: "category", categoryId: CONFIG_CATEGORY_ID }}
      insert={insert}
      heading="Resolve this config conflict"
      onSuccess={handleSuccess}
    />
  );
}
