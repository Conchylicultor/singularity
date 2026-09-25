import type { StatusDotPaint } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";

/**
 * The conversation-status vocabulary as a dot: the one mapping every surface
 * that shows a conversation's status reads, so a sidebar row, a chip and an
 * avatar's presence overlay cannot disagree.
 *
 * Live states are FILLED — `working` green, `waiting` (on you) amber. The
 * others are HOLLOW rings: `starting` (not live yet) muted, `gone` (its process
 * vanished) amber, `done` faint. Spread onto `<StatusDot>`; a surface drawing
 * its own dot element reads it through `statusDotPaintClass`.
 *
 * Its own module (not `conversation-item.tsx`) so the avatar fallback can read
 * it without the conversation-item ↔ slots import cycle.
 */
export const CONV_STATUS_DOT: Record<ConversationStatus, StatusDotPaint> = {
  starting: { ringClass: "border-muted-foreground" },
  working: { colorClass: "bg-success" },
  waiting: { colorClass: "bg-warning" },
  gone: { ringClass: "border-warning" },
  done: { ringClass: "border-faint-foreground" },
};
