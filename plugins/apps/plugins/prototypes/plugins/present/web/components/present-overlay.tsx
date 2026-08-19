import { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { SurfaceOverlay } from "@plugins/primitives/plugins/surface-overlay/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useSurfaceFocused } from "@plugins/apps-core/plugins/tabs/web";
import {
  prototypesResource,
  prototypesVersionResource,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { ScaledIframe } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";

/**
 * How much of the screen the presentation covers, smallest first:
 *
 * - `surface` — the app tab's surface. The Singularity tab bar and app rail stay
 *   visible, so the user can keep switching tabs with a prototype presented.
 * - `viewport` — the whole browser page, app chrome included.
 * - `screen` — the same, handed to the browser's Fullscreen API.
 */
export type PresentPlacement = "surface" | "viewport" | "screen";

/**
 * The prototype alone, with none of the app around it. The same live iframe the
 * pane shows (so an agent's edit still reloads it), scaled up to fill the space
 * instead of sitting at native size in the middle of it.
 *
 * Escape leaves from any placement: in `surface`/`viewport` our own key handler
 * closes; in `screen` the browser exits fullscreen first and the resulting
 * `fullscreenchange` closes.
 */
export function PresentOverlay({
  name,
  placement,
  onClose,
}: {
  name: string;
  placement: PresentPlacement;
  /** Stable identity required — the fullscreen effect keys on it. */
  onClose: () => void;
}) {
  const stage = useCombinedResources({
    rows: useResource(prototypesResource),
    version: useResource(prototypesVersionResource),
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceFocused = useSurfaceFocused();

  useEffect(() => {
    // Only the focused tab listens. Tabs are keep-alive — a background tab is
    // still mounted (and under the floating placement, still on screen) — so an
    // ungated window listener would close a presentation the user is not
    // looking at.
    if (!surfaceFocused) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, surfaceFocused]);

  useEffect(() => {
    if (placement !== "screen") return;
    const el = rootRef.current;
    if (!el) return;
    // Still inside the menu click's user activation, so the request is granted.
    const onChange = () => {
      if (document.fullscreenElement === null) onClose();
    };
    document.addEventListener("fullscreenchange", onChange);
    void el.requestFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === el) void document.exitFullscreen();
    };
  }, [placement, onClose]);

  const stageBox = (
    /* The stage box: the element handed to the Fullscreen API, and the
       positioning context the close button pins to (so the button is inside the
       fullscreened subtree and stays visible there). `ScaledIframe` fills and
       centers itself, so this box only owns size + context. */
    <div
      ref={rootRef}
      className={cn("relative size-full bg-background", hoverRevealGroup)}
    >
      {matchResource(stage, {
        pending: () => <Loading variant="block" />,
        error: () => <Loading variant="block" />,
        ready: ({ rows, version }) => {
          const meta = rows.find((p) => p.name === name) ?? null;
          if (!meta) {
            return (
              <Text as="div" variant="body" tone="muted">
                Prototype not found.
              </Text>
            );
          }
          return <ScaledIframe meta={meta} version={version} upscale />;
        },
      })}
      {/* Hidden until the pointer moves over the stage: a presentation shows
          the design, not our chrome. No `mask` — the app's scrim color bleeds
          a dark patch across a light prototype, and the solid `secondary`
          button already carries its own background, so nothing interleaves.

          Top-LEFT when we only cover the surface: the app's own floating chrome
          all lives down the right edge — the global action bar at the top, the
          toaster at the bottom — and it is portaled above us, so either right
          corner would have something land on the exit button. Covering the
          viewport puts that chrome underneath us, so the top-right corner is
          free again, and that is where an exit belongs. */}
      <Pin
        to={placement === "surface" ? "top-left" : "top-right"}
        offset="md"
        className={hoverRevealTarget}
      >
        <IconButton
          icon={MdClose}
          label="Exit presentation (Esc)"
          variant="secondary"
          onClick={onClose}
        />
      </Pin>
    </div>
  );

  // `aria-modal` only where it is true: covering the viewport really does make
  // everything else unreachable, but the surface placement deliberately leaves
  // the tab bar and rail clickable — claiming modality there would tell a screen
  // reader to hide chrome the user can still use.
  return placement === "surface" ? (
    <SurfaceOverlay role="dialog" aria-label="Prototype presentation">
      {stageBox}
    </SurfaceOverlay>
  ) : (
    <ViewportOverlay
      layer="max"
      role="dialog"
      aria-modal="true"
      aria-label="Prototype presentation"
    >
      {stageBox}
    </ViewportOverlay>
  );
}
