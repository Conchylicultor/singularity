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
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  prototypesResource,
  prototypesVersionResource,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { ScaledIframe } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";

/**
 * The prototype alone, filling the browser tab — no app chrome, no pane. The
 * same live iframe the pane shows (so an agent's edit still reloads it), scaled
 * up to fill the space instead of sitting at native size in the middle of it.
 *
 * `fullscreen` additionally hands the stage to the browser's Fullscreen API, so
 * it covers the screen rather than the tab. Escape leaves either way: in tab
 * mode our own key handler closes; in fullscreen the browser exits fullscreen
 * first and the resulting `fullscreenchange` closes.
 */
export function PresentOverlay({
  name,
  fullscreen,
  onClose,
}: {
  name: string;
  /** Stable identity required — the fullscreen effect keys on it. */
  fullscreen: boolean;
  onClose: () => void;
}) {
  const stage = useCombinedResources({
    rows: useResource(prototypesResource),
    version: useResource(prototypesVersionResource),
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!fullscreen) return;
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
  }, [fullscreen, onClose]);

  return (
    <ViewportOverlay layer="max" role="dialog" aria-modal="true">
      {/* The stage box: the element handed to the Fullscreen API, and the
          positioning context the close button pins to (so the button is inside
          the fullscreened subtree and stays visible there). `ScaledIframe`
          fills and centers itself, so this box only owns size + context. */}
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
            button already carries its own background, so nothing interleaves. */}
        <Pin to="top-right" offset="md" className={hoverRevealTarget}>
          <IconButton
            icon={MdClose}
            label="Exit presentation (Esc)"
            variant="secondary"
            onClick={onClose}
          />
        </Pin>
      </div>
    </ViewportOverlay>
  );
}
