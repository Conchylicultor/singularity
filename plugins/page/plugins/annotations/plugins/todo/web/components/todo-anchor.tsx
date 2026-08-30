import { MdPlayArrow } from "react-icons/md";
import { ContainerCornerLabel } from "@plugins/page/plugins/container/web";
import type {
  BlockAnchorProps,
  BlockEditorAPI,
} from "@plugins/page/plugins/editor/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import {
  TodoDispatch,
  useTodoTaskState,
} from "@plugins/page/plugins/annotations/plugins/todo/plugins/task-link/web";

/**
 * The TODO card's name, in the top-right corner of its box — and the way an
 * agent is dispatched onto it.
 *
 * ## The name IS the launch control
 *
 * Most TODO cards never launch anything, so a launch button that is always on
 * screen is a permanent price for a rare act. This adds nothing at rest: point
 * at the card and it says `TODO`; move onto that word and it becomes
 * `▷ LAUNCH`, in place, at the same size. The answer to *what is this box* turns
 * into the affordance, so the card gains no control at all — the one it already
 * had changes what it says.
 *
 * The panel behind it is unchanged and unmoved: the same `TodoDispatch` that the
 * rail's block-actions menu opens (`BlockFrameMeta.menu`), which is the
 * container convention — the rail is where a user looks for block actions, the
 * decoration is where they look for the decoration.
 *
 * ## A dispatched card keeps its name at rest
 *
 * `persist` is the one exception to hiding the name, and it is a rule about what
 * the name is SAYING. Normally it repeats what the tint already carries, so it is
 * worth nothing at rest. Once an agent is running on the card, the name carries
 * the task's live status instead — `RUNNING`, `DONE` — which the tint cannot
 * spell (an open card and a card with an agent working on it are both `warning`)
 * and which the reader would otherwise have to open a popover to learn.
 *
 * The word and its tint come from `STATUS_META`, the ONE table mapping a
 * `TaskStatus` to how it looks — never a second mapping here. The card must say
 * exactly what the task list says, or the two disagree the day a status is added.
 *
 * ## Three states, and the two degradations are the same one
 *
 * `blockId` and `editor` are both optional on `BlockAnchorProps` and both absent
 * on a read-only surface (the blog renderer, the version-history preview): a
 * read-only node may carry no id, and there is no block API to hand a popover.
 * Either one missing ⇒ the static name, unchanged from before. Dispatching is
 * live agent state, so a snapshot of last Tuesday must not offer it — and the
 * panel would crash rather than degrade there anyway (`useOpenPane` /
 * `conversationPane.useRouteEntries()` do not exist on the public-site surface).
 */
export function TodoAnchor({ blockId, editor }: BlockAnchorProps) {
  if (!editor || blockId === undefined)
    return (
      <ContainerCornerLabel
        blockId={blockId}
        name="Todo"
        className="text-warning"
      />
    );
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
  const status = dispatched ? STATUS_META[dispatched.status] : null;

  return (
    <ContainerCornerLabel
      blockId={blockId}
      editor={editor}
      name={status ? status.label : "Todo"}
      className={status ? status.iconClassName : "text-warning"}
      persist={status !== null}
      action={
        <Row gap="2xs" align="center">
          <MdPlayArrow className="size-3" />
          {dispatched ? "Launch again" : "Launch"}
        </Row>
      }
      triggerLabel={dispatched ? "TODO card's agent run" : "Dispatch an agent"}
      width="2xl"
      sections={({ close }) => <TodoDispatch blockId={blockId} close={close} />}
    />
  );
}
