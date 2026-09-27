import type { ReactElement } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { FrameActionRow } from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { BrowserTabOpener } from "./frame-link";
import { symbol } from "@plugins/ui/plugins/icons/core";

const openInFullIcon = symbol("open-in-full");

/**
 * "Open responsive in a new tab" — a frame action of its own, beside Present:
 * one click opens the frame's chromeless present page in a new browser tab at
 * the Responsive size, whatever size the canvas is at, so the page fills the
 * whole tab at the tab's own width. A source frame opens its own `href`,
 * which already is that; disabled when it has none.
 */
export function OpenResponsiveAction({
  row,
}: ItemActionProps<FrameActionRow>): ReactElement {
  return (
    <BrowserTabOpener
      frame={row.frame}
      meta={row.meta}
      size={{ kind: "responsive" }}
    >
      {(open) => (
        <IconButton
          icon={openInFullIcon}
          label="Open responsive in a new tab"
          disabled={open === undefined}
          onClick={open}
        />
      )}
    </BrowserTabOpener>
  );
}
