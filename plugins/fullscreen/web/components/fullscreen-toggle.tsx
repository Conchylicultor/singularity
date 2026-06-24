import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  useBrowserFullscreen,
  toggleBrowserFullscreen,
} from "@plugins/primitives/plugins/browser-fullscreen/web";

export function FullscreenToggle() {
  const isFullscreen = useBrowserFullscreen();

  return (
    <IconButton
      icon={isFullscreen ? MdFullscreenExit : MdFullscreen}
      label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      onClick={() => void toggleBrowserFullscreen()}
    />
  );
}
