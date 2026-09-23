import { useMemo, type ReactElement } from "react";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import {
  prototypeHistoryResource,
  type PrototypeHistory,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { usePrototypeDetail } from "../context";
import {
  stepBy,
  versionForStep,
  versionSteps,
} from "../internal/version-steps";

/**
 * The canvas's keys, scoped to its surface (plain keys, so they stay silent
 * while a text field has focus):
 *
 * - `[` / `]` step the SELECTED frame's version;
 * - `0` toggles the zoom between 100% and Fit.
 *
 * Registered once for the canvas, not per frame: the selection says which
 * frame they act on.
 */
export function CanvasShortcuts(): ReactElement | null {
  const { name } = usePrototypeDetail();
  const history = useResource(prototypeHistoryResource, { name });
  // Until the history is known the keys are not registered — there is nowhere
  // to step yet.
  if (history.pending) return null;
  return <KnownShortcuts history={history.data} />;
}

function KnownShortcuts({
  history: known,
}: {
  history: PrototypeHistory;
}): null {
  const { canvas, dispatch } = usePrototypeDetail();

  const step = useEventCallback((delta: -1 | 1) => {
    const frame = canvas.frames.find((f) => f.id === canvas.selected);
    if (frame?.kind !== "prototype") return;
    const target = stepBy(
      versionSteps(known, frame.version?.sha ?? null),
      delta,
    );
    if (target) {
      dispatch({
        type: "setVersion",
        id: frame.id,
        version: versionForStep(target),
      });
    }
  });
  const toggleZoom = useEventCallback(() =>
    dispatch({ type: "setZoom", zoom: canvas.zoom === 1 ? "fit" : 1 }),
  );

  const shortcuts = useMemo(
    () => [
      {
        id: "prototypes.version-back",
        keys: "[",
        label: "Previous version of the selected frame",
        group: "Prototypes",
        handler: () => step(-1),
      },
      {
        id: "prototypes.version-forward",
        keys: "]",
        label: "Next version of the selected frame",
        group: "Prototypes",
        handler: () => step(1),
      },
      {
        id: "prototypes.zoom-toggle",
        keys: "0",
        label: "Toggle 100% / Fit",
        group: "Prototypes",
        handler: toggleZoom,
      },
    ],
    [step, toggleZoom],
  );
  useSurfaceShortcuts(shortcuts);
  return null;
}
