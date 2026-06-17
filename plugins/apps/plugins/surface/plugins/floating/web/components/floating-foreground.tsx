import { WindowDock } from "./window-dock";
import { SnapPreviewOverlay } from "./snap-preview-overlay";
import { TabDragOverlay } from "./tab-drag-overlay";
import { FloatingTabsBridge } from "./floating-tabs-bridge";

/**
 * The floating placement's `Foreground`: the always-on overlay layer above every
 * window container. Composes the desktop dock (taskbar), the transient snap-zone
 * preview, and the headless tabs-bridge publisher (which feeds keyboard
 * window-management shortcuts) — all scoped to "there is >= 1 floating window",
 * so the placement hosts them through this one Foreground. Receives the open
 * floating tabIds from the surface host and forwards them to the dock + bridge;
 * the preview reads its own transient channel.
 */
export function FloatingForeground({ tabIds }: { tabIds: string[] }) {
  return (
    <>
      <FloatingTabsBridge tabIds={tabIds} />
      <SnapPreviewOverlay />
      <WindowDock tabIds={tabIds} />
      <TabDragOverlay />
    </>
  );
}
