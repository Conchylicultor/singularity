import { MdPendingActions } from "react-icons/md";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";
import type {
  BlockAnchorProps,
  BlockEditorAPI,
} from "@plugins/page/plugins/editor/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import {
  TodoDispatch,
  useTodoTaskState,
} from "@plugins/page/plugins/annotations/plugins/todo/plugins/task-link/web";

/** The card's mark before anything has been dispatched from it. */
function TodoGlyph() {
  return <MdPendingActions className="size-5 text-warning" />;
}

/**
 * A dispatched card's mark: the linked task's own status icon and tint.
 *
 * Read from `STATUS_META`, the ONE table mapping a `TaskStatus` to how it looks —
 * never a second mapping here. The card must say exactly what the task list
 * says, or the two disagree the day a status is added.
 */
function TodoStatusGlyph({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return <Icon className={cn("size-5", meta.iconClassName)} />;
}

/**
 * The TODO card's leading glyph, and the panel that dispatches an agent onto it.
 *
 * ## Why this one has `sections` where two of its siblings do not
 *
 * The family rule is that a container with nothing per-instance to show renders
 * a plain, non-interactive mark. That rule reads the block's `data`, and this
 * card's is still `{}`. But a TODO card DOES have something per-instance behind
 * it — the task it was dispatched onto, held in a side table keyed by the block
 * id ([`task-link`](../../plugins/task-link/CLAUDE.md)) — and, unlike its
 * siblings, it has an action to offer even before there is one. So on the
 * editable surface the glyph is always a trigger: it opens a launch form on an
 * un-dispatched card, and the task plus that same form on a dispatched one.
 *
 * Structural actions are unaffected and still absent here: Collapse / Remove
 * TODO / Delete come from the rail on the line the card borrows, generically
 * over `BlockHandle.anchor`.
 *
 * ## Three states, and the two degradations are the same one
 *
 * `blockId` and `editor` are both optional on `BlockAnchorProps` and both absent
 * on a read-only surface (the blog renderer, the version-history preview): a
 * read-only node may carry no id, and there is no block API to hand a popover.
 * Either one missing ⇒ the static glyph, unchanged from before. Dispatching is
 * live agent state, so a snapshot of last Tuesday must not offer it — and the
 * panel would crash rather than degrade there anyway (`useOpenPane` /
 * `conversationPane.useRouteEntries()` do not exist on the public-site surface).
 */
export function TodoAnchor({ blockId, editor }: BlockAnchorProps) {
  if (!editor || blockId === undefined)
    return <ContainerAnchor glyph={<TodoGlyph />} />;
  return <DispatchableTodoAnchor blockId={blockId} editor={editor} />;
}

/**
 * The editable-surface arm, split out so the link subscription is a hook on a
 * component that only ever mounts when there is a block id to key it by.
 */
function DispatchableTodoAnchor({
  blockId,
  editor,
}: {
  blockId: string;
  editor: BlockEditorAPI;
}) {
  const dispatched = useTodoTaskState(blockId);

  return (
    <ContainerAnchor
      editor={editor}
      glyph={
        dispatched ? (
          <TodoStatusGlyph status={dispatched.status} />
        ) : (
          <TodoGlyph />
        )
      }
      triggerLabel={dispatched ? "TODO card's agent run" : "Dispatch an agent"}
      width="2xl"
      sections={({ close }) => <TodoDispatch blockId={blockId} close={close} />}
    />
  );
}
