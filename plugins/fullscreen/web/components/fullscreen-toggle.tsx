import { useEffect, useState } from "react";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

/** Tracks the document's fullscreen state, kept in sync via `fullscreenchange`. */
function useIsFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => document.fullscreenElement !== null,
  );
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return isFullscreen;
}

export function FullscreenToggle() {
  const isFullscreen = useIsFullscreen();

  return (
    <IconButton
      icon={isFullscreen ? MdFullscreenExit : MdFullscreen}
      label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }}
    />
  );
}
