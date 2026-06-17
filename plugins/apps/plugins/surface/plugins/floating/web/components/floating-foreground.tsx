import { WindowDock } from "./window-dock";
import { SnapPreviewOverlay } from "./snap-preview-overlay";

/**
 * The floating placement's `Foreground`: the always-on overlay layer above every
 * window container. Composes the desktop dock (taskbar) with the transient
 * snap-zone preview — both belong above the windows, so the placement hosts them
 * through this one Foreground. Receives the open floating tabIds from the surface
 * host and forwards them to the dock; the preview reads its own transient channel.
 */
export function FloatingForeground({ tabIds }: { tabIds: string[] }) {
  return (
    <>
      <SnapPreviewOverlay />
      <WindowDock tabIds={tabIds} />
    </>
  );
}
