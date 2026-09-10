import type { IconType } from "react-icons";
import {
  MdBuild,
  MdChecklist,
  MdHourglassEmpty,
  MdOpenInBrowser,
  MdScience,
  MdUpload,
} from "react-icons/md";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { OP_KINDS, type OpKind } from "@plugins/infra/plugins/worktree/core";
import { useWorktreeOp } from "../internal/use-worktree-op";
import type { WorktreeOp } from "../../shared";

// Per-op display: a single muted icon (no chip, no label) — the distinct icon
// carries the state, the tooltip carries the banner's full phrasing on hover.
interface OpDisplay {
  icon: IconType;
  title: string;
}

// One icon per kind. Icons are React components, so they cannot live beside the
// kind's label in `OP_KINDS` (a web-safe core barrel with no react); the
// `Record<OpKind, …>` is what keeps this map complete — a kind declared there
// and not here is a type error, not a blank row.
const OP_ICON: Record<OpKind, IconType> = {
  build: MdBuild,
  push: MdUpload,
  check: MdScience,
  test: MdChecklist,
  e2e: MdOpenInBrowser,
};

function displayFor(op: WorktreeOp): OpDisplay {
  const { label } = OP_KINDS[op.op];
  // Any op queued behind its lock shows the hourglass; the distinct icon carries
  // the state and the tooltip the full phrasing.
  if (op.phase === "waiting-for-lock") {
    return {
      icon: MdHourglassEmpty,
      title: `${label} queued — waiting for lock`,
    };
  }
  return { icon: OP_ICON[op.op], title: `${label} in progress` };
}

// Sidebar row indicator surfacing a worktree's in-flight long-running op (build
// / push / check / test / e2e, or any of them queued for its lock) as a single
// muted icon. Renders nothing when the worktree is idle, so ordinary "working"
// rows stay unadorned.
export function OpStatusChip({ conv }: { conv: ConversationItemConv }) {
  const op = useWorktreeOp(conv.id);
  if (!op) return null;
  const { icon: Icon, title } = displayFor(op);
  return (
    <WithTooltip content={title}>
      <Inline gap="none" className="text-muted-foreground">
        <Icon className="size-3.5" />
      </Inline>
    </WithTooltip>
  );
}
