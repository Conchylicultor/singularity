import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { getSurfaceMode } from "@plugins/apps-core/plugins/tabs/web";
import { Surface } from "@plugins/apps-core/plugins/surface/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { floatingChromeConfig } from "../core";
import { TitlebarStylePicker } from "./components/titlebar-style-picker";
import { floatingDef } from "./floating-placement";
import {
  closeFocusedWindow,
  cycleWindows,
  minimizeFocusedWindow,
  moveFocusedWindowByDelta,
  snapFocusedWindow,
  switchDesktopByDelta,
  togglePinFocusedWindow,
} from "./window-commands";

export default {
  description:
    "Floating-window surface placement: a free-floating, draggable/resizable window over a desktop wallpaper backdrop. Owns the per-tab geometry store, window chrome, and keyboard window-management shortcuts (tile / minimize / close / cycle).",
  contributions: [
    Surface.Placement(floatingDef),
    // Window-chrome appearance config + its theme-customizer picker (Framed /
    // Seamless titlebar). Global scope — desktop chrome shared across all apps.
    ConfigV2.WebRegister({ descriptor: floatingChromeConfig }),
    ThemeEngine.VariantGroup({
      id: "floating-titlebar",
      componentLabel: "Window titlebar",
      component: TitlebarStylePicker,
    }),
    // Keyboard window management — eligible only while the focused tab is a
    // floating window (`when` self-references this placement's own id, owned
    // here). Tiling uses the Ctrl+Alt window-manager modifier (free on macOS,
    // the primary target); minimize/close/cycle use the platform `mod` so they
    // read as ⌘M / ⌘W / ⌘` on Mac.
    defineShortcut({
      id: "floating.snap-left",
      keys: "ctrl+alt+arrowleft",
      label: "Tile window left",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => snapFocusedWindow("left"),
    }),
    defineShortcut({
      id: "floating.snap-right",
      keys: "ctrl+alt+arrowright",
      label: "Tile window right",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => snapFocusedWindow("right"),
    }),
    defineShortcut({
      id: "floating.snap-up",
      keys: "ctrl+alt+arrowup",
      label: "Maximize / tile window up",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => snapFocusedWindow("up"),
    }),
    defineShortcut({
      id: "floating.snap-down",
      keys: "ctrl+alt+arrowdown",
      label: "Restore / minimize window",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => snapFocusedWindow("down"),
    }),
    defineShortcut({
      id: "floating.minimize",
      keys: "mod+m",
      label: "Minimize window",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => minimizeFocusedWindow(),
    }),
    // Always-on-top toggle: uses the Ctrl+Alt window-manager modifier family (like
    // the tiling shortcuts), keeping the platform `mod` free for app shortcuts.
    defineShortcut({
      id: "floating.toggle-pin",
      keys: "ctrl+alt+p",
      label: "Toggle always on top",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => togglePinFocusedWindow(),
    }),
    defineShortcut({
      id: "floating.close",
      keys: "mod+w",
      label: "Close window",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => closeFocusedWindow(),
    }),
    defineShortcut({
      id: "floating.cycle-next",
      keys: "mod+`",
      label: "Cycle windows",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => cycleWindows(1),
    }),
    // Reverse cycle is Shift + the forward key. The shortcut registry matches on
    // `KeyboardEvent.key`, which for Shift+Backquote is the *shifted character*
    // "~" on a real US keyboard (but the base "`" in some synthetic-input
    // environments) — so register both so ⌘⇧` reverses reliably across keyboards.
    defineShortcut({
      id: "floating.cycle-prev",
      keys: "mod+shift+~",
      label: "Cycle windows (reverse)",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => cycleWindows(-1),
    }),
    defineShortcut({
      id: "floating.cycle-prev-backquote",
      keys: "mod+shift+`",
      label: "Cycle windows (reverse)",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => cycleWindows(-1),
    }),
    // Virtual-desktop (workspace) navigation. Page keys keep the Ctrl+Alt
    // window-manager modifier family but stay collision-free with the
    // Ctrl+Alt+arrow snap shortcuts; Shift moves the focused window across.
    defineShortcut({
      id: "floating.desktop-next",
      keys: "ctrl+alt+pagedown",
      label: "Next desktop",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => switchDesktopByDelta(1),
    }),
    defineShortcut({
      id: "floating.desktop-prev",
      keys: "ctrl+alt+pageup",
      label: "Previous desktop",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => switchDesktopByDelta(-1),
    }),
    defineShortcut({
      id: "floating.window-to-next-desktop",
      keys: "ctrl+alt+shift+pagedown",
      label: "Move window to next desktop",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => moveFocusedWindowByDelta(1),
    }),
    defineShortcut({
      id: "floating.window-to-prev-desktop",
      keys: "ctrl+alt+shift+pageup",
      label: "Move window to previous desktop",
      group: "Window",
      when: () => getSurfaceMode() === "floating",
      handler: () => moveFocusedWindowByDelta(-1),
    }),
  ],
} satisfies PluginDefinition;
