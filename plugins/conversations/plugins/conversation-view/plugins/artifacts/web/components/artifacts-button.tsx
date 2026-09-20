import { useCallback, useState } from "react";
import { MdInventory2 } from "react-icons/md";
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
 * Once settled it shows the total, and stays disabled when there is nothing to
 * show.
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
        <MdInventory2 className="size-4" />
      </Button>
    );
  }

  return (
    <ArtifactsReady
      byKind={artifacts.byKind}
      total={artifacts.total}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function ArtifactsReady({
  byKind,
  total,
  open,
  onOpenChange,
}: {
  byKind: ReadonlyMap<string, ArtifactItem[]>;
  total: number;
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
        <MdInventory2 className="size-4" />
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
          title={LABEL}
          aria-label={LABEL}
          aria-pressed={open}
          className="gap-xs"
        >
          <MdInventory2 className="size-4" />
          <Text variant="caption" className="tabular-nums">
            {total}
          </Text>
        </Button>
      }
    >
      <ArtifactsCloseContext value={close}>
        <ArtifactsPanel byKind={byKind} total={total} />
      </ArtifactsCloseContext>
    </InlinePopover>
  );
}
