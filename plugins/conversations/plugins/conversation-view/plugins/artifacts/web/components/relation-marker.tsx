import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  RELATION_LABEL,
  type Relation,
} from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";

/**
 * A whole dot when the conversation made it, half a dot when it changed it, and
 * nothing at all when it only looked at it — a mark for what the conversation
 * did, in the one place every kind reads it from.
 *
 * Neutral on purpose: the mark is the same muted ink as the row's text, so a
 * popover of five kinds reads as one list rather than a colour key the user has
 * to learn. The word itself is in the row's tooltip.
 *
 * Drawn here rather than through `StatusDot` because the half mark is a
 * left-hand semicircle (a half-width box with one rounded end), which the
 * full-circle primitive has no spelling for — and the two marks must be the
 * same size or the difference reads as a size, not a state.
 */
const MARK: Record<Exclude<Relation, "referenced">, string> = {
  created: "size-1.5 rounded-full",
  // Half the width, rounded on the left only — the left half of `created`.
  edited: "h-1.5 w-[3px] rounded-l-full",
};

export function RelationMarker({ relation }: { relation: Relation }) {
  if (relation === "referenced") return null;
  return (
    <span
      role="img"
      aria-label={RELATION_LABEL[relation]}
      className={cn(
        "inline-block bg-muted-foreground align-middle",
        rigidClass(),
        MARK[relation],
      )}
    />
  );
}
