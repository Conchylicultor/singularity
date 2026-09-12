import { useEffect, useState } from "react";
import { MdFullscreen } from "react-icons/md";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";

/** Tracks the document's fullscreen state, kept in sync via `fullscreenchange`. */
function useIsFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => document.fullscreenElement !== null,
  );
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return isFullscreen;
}

/**
 * Browser fullscreen as a switch row in the action bar's view-options popover.
 * Named "Browser fullscreen" because the surface-mode control in the same
 * popover has its own "Fullscreen (solo)" mode, which fills the window rather
 * than the screen.
 */
export function FullscreenToggle() {
  const isFullscreen = useIsFullscreen();

  return (
    <ControlPanel.Row
      icon={<MdFullscreen />}
      select="switch"
      checked={isFullscreen}
      onSelect={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }}
    >
      Browser fullscreen
    </ControlPanel.Row>
  );
}
