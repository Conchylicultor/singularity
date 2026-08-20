import { MdLightMode, MdDarkMode } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  useResolvedColorMode,
  useSetColorMode,
} from "@plugins/ui/plugins/theme-engine/web";

export function ThemeToggle() {
  // Read and write both go through theme-engine's color-mode hooks, which name
  // the owning scope once. This button used to pick the scope itself — it wrote
  // the current app's when that app had its own theme, while `<html>.dark` reads
  // global — so clicking it changed a value nothing painted from.
  //
  // The read is the RESOLVED mode (`system` already collapsed against the OS, with
  // a live listener), which is what the class applier uses — so the icon and label
  // always describe the scheme actually on screen, and one click flips it.
  const dark = useResolvedColorMode() === "dark";
  const setColorMode = useSetColorMode();

  return (
    <IconButton
      icon={dark ? MdLightMode : MdDarkMode}
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setColorMode(dark ? "light" : "dark")}
    />
  );
}
