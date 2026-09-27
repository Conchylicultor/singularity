import type { ReactElement } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { embedUrl } from "@plugins/primitives/plugins/embed/web";
import {
  encodeCanvas,
  usePrototypeDetail,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { presentCanvasPath } from "../panes";

const openInNewIcon = symbol("open-in-new");

/**
 * "Open the canvas in a new tab" — a header action: the canvas as it is now
 * (every frame with its version and picks, the size, zoom and layout) in a
 * chromeless new browser tab, so the frames get all of the screen to compare.
 */
export function OpenCanvasAction(): ReactElement {
  const { name, canvas } = usePrototypeDetail();
  return (
    <IconButton
      icon={openInNewIcon}
      label="Open the canvas in a new tab"
      onClick={() =>
        window.open(
          embedUrl(presentCanvasPath(name, encodeCanvas(canvas)), "chromeless"),
          "_blank",
          "noopener,noreferrer",
        )
      }
    />
  );
}
