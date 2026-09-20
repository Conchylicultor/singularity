import { useCallback, useState } from "react";
import { MdCategory } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type { ArtifactItem } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import { useConversationArtifacts } from "../use-conversation-artifacts";
import { ArtifactsCloseContext } from "../internal/close-context";
import { ArtifactsPanel } from "./artifacts-panel";

const LABEL = "Artifacts";

/**
 * Toolbar button listing everything this conversation made, changed or looked
 * at — prototypes, pages, research docs, screenshots, skills.
 *
 * Three states, and the first one matters: while the transcript is still
 * arriving the button is a plain disabled glyph with **no count**, because "0"
 * would be a claim about the user's work that reverses itself a moment later.
 * Once settled it opens whenever anything was found, and shows the number of
 * things the conversation MADE beside the glyph — which is fewer than the
 * panel lists, because pictures it looked at and skills it loaded are listed
 * without counting (`ArtifactKind.origin`). A conversation that only looked at
 * things opens the same panel with no number at all, rather than a "0" the
 * rows underneath contradict.
 */
export function ArtifactsButton() {
  const { convId } = conversationPane.useParams();
  const artifacts = useConversationArtifacts(convId);
  const [open, setOpen] = useState(false);

  if (artifacts.pending) {
    return (
      // eslint-disable-next-line icon-button/prefer-icon-button -- placeholder for the icon+count button below; a square IconButton would resize the toolbar when the count settles
      <Button
        variant="ghost"
        title={LABEL}
        aria-label={LABEL}
        disabled
        className="gap-xs"
      >
        <MdCategory className="size-4" />
      </Button>
    );
  }

  return (
    <ArtifactsReady
      byKind={artifacts.byKind}
      total={artifacts.total}
      count={artifacts.count}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function ArtifactsReady({
  byKind,
  total,
  count,
  open,
  onOpenChange,
}: {
  byKind: ReadonlyMap<string, ArtifactItem[]>;
  total: number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (total === 0) {
    return (
      // eslint-disable-next-line icon-button/prefer-icon-button -- same control as the enabled form below, which carries a count beside its glyph
      <Button
        variant="ghost"
        title={`${LABEL} — nothing yet`}
        aria-label={LABEL}
        disabled
        className="gap-xs"
      >
        <MdCategory className="size-4" />
      </Button>
    );
  }

  return (
    <InlinePopover
      align="end"
      width="picker"
      padding="none"
      maxHeight="xl"
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button
          variant={open ? "secondary" : "ghost"}
          // The number is what the conversation MADE, so the tooltip says so —
          // the panel underneath lists more than that, and a reader comparing
          // the two deserves the word rather than a second number.
          title={count > 0 ? `${LABEL} — ${count} made` : LABEL}
          aria-label={LABEL}
          aria-pressed={open}
          className="gap-xs"
        >
          <MdCategory className="size-4" />
          {count > 0 && (
            <Text variant="caption" className="tabular-nums">
              {count}
            </Text>
          )}
        </Button>
      }
    >
      <ArtifactsCloseContext value={close}>
        <ArtifactsPanel byKind={byKind} />
      </ArtifactsCloseContext>
    </InlinePopover>
  );
}
