import { Icon } from "@plugins/ui/plugins/icons/web";

import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { OP_KINDS, type OpKind } from "@plugins/infra/plugins/worktree/core";
import { useWorktreeOp } from "../internal/use-worktree-op";
import type { WorktreeOp } from "../../shared";
import { symbol, type IconRef } from "@plugins/ui/plugins/icons/core";

const buildIcon = symbol("build");
const checklistIcon = symbol("checklist");
const hourglassEmptyIcon = symbol("hourglass-empty");
const openInBrowserIcon = symbol("open-in-browser");
const scienceIcon = symbol("science");
const uploadIcon = symbol("upload");

// Per-op display: a single muted icon (no chip, no label) — the distinct icon
// carries the state, the tooltip carries the banner's full phrasing on hover.
interface OpDisplay {
  icon: IconRef;
  title: string;
}

// One icon per kind. Icons are React components, so they cannot live beside the
// kind's label in `OP_KINDS` (a web-safe core barrel with no react); the
// `Record<OpKind, …>` is what keeps this map complete — a kind declared there
// and not here is a type error, not a blank row.
const OP_ICON: Record<OpKind, IconRef> = {
  build: buildIcon,
  push: uploadIcon,
  check: scienceIcon,
  test: checklistIcon,
  e2e: openInBrowserIcon,
};

function displayFor(op: WorktreeOp): OpDisplay {
  const { label } = OP_KINDS[op.op];
  // Any op queued behind its lock shows the hourglass; the distinct icon carries
  // the state and the tooltip the full phrasing.
  if (op.phase === "waiting-for-lock") {
    return {
      icon: hourglassEmptyIcon,
      title: `${label} queued — waiting for lock`,
    };
  }
  return { icon: OP_ICON[op.op], title: `${label} in progress` };
}

// Sidebar row indicator surfacing a worktree's in-flight long-running op (build
// / push / check / test / e2e, or any of them queued for its lock) as a single
// muted icon. Renders nothing when the worktree is idle, so ordinary "working"
// rows stay unadorned — and nothing while the op map is still loading (it is
// boot-preloaded, so that window is normally never seen): an optional row
// adornment has no loading affordance of its own.
export function OpStatusChip({ conv }: { conv: ConversationItemConv }) {
  const reading = useWorktreeOp(conv.id);
  if (reading.pending || !reading.op) return null;
  const { icon, title } = displayFor(reading.op);
  return (
    <WithTooltip content={title}>
      <Inline gap="none" className="text-muted-foreground">
        {/* The density group's `opStatusIcon` (default 14px). */}
        <Icon icon={icon} className="size-op-status-icon" />
      </Inline>
    </WithTooltip>
  );
}
