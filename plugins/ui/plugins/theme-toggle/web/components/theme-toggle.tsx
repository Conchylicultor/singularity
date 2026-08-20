import { MdDarkMode } from "react-icons/md";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import {
  useResolvedColorMode,
  useSetColorMode,
} from "@plugins/ui/plugins/theme-engine/web";

/**
 * Light/dark as a switch inside the theme popover, rather than a second toolbar
 * button beside the palette one. Both controls answered the same question ("how
 * should this look?"), and the popover is where that question is already being
 * answered — a theme swatch and the scheme it is painted in belong on one
 * surface.
 *
 * Read and write both go through theme-engine's color-mode hooks, which name the
 * owning scope once. This control used to pick the scope itself — it wrote the
 * current app's when that app had its own theme, while `<html>.dark` reads
 * global — so clicking it changed a value nothing painted from.
 *
 * The read is the RESOLVED mode (`system` already collapsed against the OS, with
 * a live listener), which is what the class applier uses — so the switch always
 * describes the scheme actually on screen, and one click flips it.
 *
 * `select="switch"` puts the indicator in the row's TRAILING cell, so the
 * leading icon costs the panel nothing it was not already paying: the footer's
 * ⚙ has the icon column open regardless.
 */
export function ThemeToggle() {
  const dark = useResolvedColorMode() === "dark";
  const setColorMode = useSetColorMode();

  return (
    <ControlPanel.Row
      icon={<MdDarkMode />}
      select="switch"
      checked={dark}
      onSelect={() => setColorMode(dark ? "light" : "dark")}
    >
      Dark mode
    </ControlPanel.Row>
  );
}
