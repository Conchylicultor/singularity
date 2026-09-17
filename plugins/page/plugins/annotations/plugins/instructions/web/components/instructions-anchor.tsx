import { ContainerCornerLabel } from "@plugins/page/plugins/container/web";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import { instructionsBlock } from "../../core";

/**
 * The card's name in the top-right corner of its box, revealed while the pointer
 * is inside it — `Instructions`, or `Global instructions` when the card reaches
 * every conversation at its start. That second word is the one per-instance fact
 * worth a glance, and the tint cannot carry it.
 *
 * `data` is read defensively: it can be transient mid-edit, and an unparseable
 * payload still names the card.
 */
export function InstructionsAnchor({ blockId, data }: BlockAnchorProps) {
  const parsed = instructionsBlock.safeParse(data);
  const global = parsed.success && parsed.data.global === true;
  return (
    <ContainerCornerLabel
      blockId={blockId}
      name={global ? "Global instructions" : "Instructions"}
      className="text-primary"
    />
  );
}
