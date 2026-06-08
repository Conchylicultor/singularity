import { MdBuild, MdHourglassEmpty, MdScience, MdUpload } from "react-icons/md";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useWorktreeOp } from "../internal/use-worktree-op";
import type { WorktreeOp } from "../../shared";

// Per-op display: a single muted icon (no chip, no label) — the distinct icon
// carries the state, the tooltip carries the banner's full phrasing on hover.
interface OpDisplay {
  icon: typeof MdBuild;
  title: string;
}

function displayFor(op: WorktreeOp): OpDisplay {
  if (op.op === "push" && op.phase === "waiting-for-lock") {
    return { icon: MdHourglassEmpty, title: "Push queued — waiting for lock" };
  }
  if (op.op === "build") {
    return { icon: MdBuild, title: "Build in progress" };
  }
  if (op.op === "check") {
    return { icon: MdScience, title: "Checks running" };
  }
  return { icon: MdUpload, title: "Push in progress" };
}

// Sidebar row indicator surfacing a worktree's in-flight long-running op (build
// / push / push-waiting-for-lock / check) as a single muted icon. Renders
// nothing when the worktree is idle, so ordinary "working" rows stay unadorned.
export function OpStatusChip({ conv }: { conv: ConversationItemConv }) {
  const op = useWorktreeOp(conv.id);
  if (!op) return null;
  const { icon: Icon, title } = displayFor(op);
  return (
    <WithTooltip content={title}>
      <span className="inline-flex text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
    </WithTooltip>
  );
}
