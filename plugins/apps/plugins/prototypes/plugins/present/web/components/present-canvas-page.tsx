import type { ReactElement } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  PrototypeCanvas,
  PrototypeDetailProvider,
  decodeCanvas,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { prototypePresentCanvasPane } from "../panes";

/**
 * The canvas as a page of its own (a chromeless new browser tab): the same
 * canvas the pane showed when it was opened — frames, versions, picks, size,
 * zoom, layout — with no pane header and no app chrome, so the frames get the
 * whole tab. It stays a working canvas: each frame's options pill, version
 * stepper and actions, and the size & zoom chip. Nothing is remembered here —
 * a reload reopens the canvas the link carries.
 */
export function PresentCanvasPage(): ReactElement {
  const { name, canvas } = prototypePresentCanvasPane.useParams();
  const opened = decodeCanvas(canvas);
  if (opened.kind === "rejected") {
    return (
      <Text as="div" variant="body" tone="muted" className="p-lg">
        This link does not hold a canvas ({opened.reason}).
      </Text>
    );
  }
  return (
    <PrototypeDetailProvider name={name} initialCanvas={opened.state}>
      <div className="size-full bg-background">
        <PrototypeCanvas />
      </div>
    </PrototypeDetailProvider>
  );
}
