import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { getFocusedPlacement } from "@plugins/apps/web";
import { Surface } from "@plugins/apps/plugins/surface/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { floatingDef } from "./floating-placement";
import {
  closeFocusedWindow,
  cycleWindows,
  minimizeFocusedWindow,
  snapFocusedWindow,
} from "./window-commands";

export default {
  description:
    "Floating-window surface placement: a free-floating, draggable/resizable window over a desktop wallpaper backdrop. Owns the per-tab geometry store, window chrome, and keyboard window-management shortcuts (tile / minimize / close / cycle).",
  contributions: [
    Surface.Placement(floatingDef),
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
      when: () => getFocusedPlacement() === "floating",
      handler: () => snapFocusedWindow("left"),
    }),
    defineShortcut({
      id: "floating.snap-right",
      keys: "ctrl+alt+arrowright",
      label: "Tile window right",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
      handler: () => snapFocusedWindow("right"),
    }),
    defineShortcut({
      id: "floating.snap-up",
      keys: "ctrl+alt+arrowup",
      label: "Maximize / tile window up",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
      handler: () => snapFocusedWindow("up"),
    }),
    defineShortcut({
      id: "floating.snap-down",
      keys: "ctrl+alt+arrowdown",
      label: "Restore / minimize window",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
      handler: () => snapFocusedWindow("down"),
    }),
    defineShortcut({
      id: "floating.minimize",
      keys: "mod+m",
      label: "Minimize window",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
      handler: () => minimizeFocusedWindow(),
    }),
    defineShortcut({
      id: "floating.close",
      keys: "mod+w",
      label: "Close window",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
      handler: () => closeFocusedWindow(),
    }),
    defineShortcut({
      id: "floating.cycle-next",
      keys: "mod+`",
      label: "Cycle windows",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
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
      when: () => getFocusedPlacement() === "floating",
      handler: () => cycleWindows(-1),
    }),
    defineShortcut({
      id: "floating.cycle-prev-backquote",
      keys: "mod+shift+`",
      label: "Cycle windows (reverse)",
      group: "Window",
      when: () => getFocusedPlacement() === "floating",
      handler: () => cycleWindows(-1),
    }),
  ],
} satisfies PluginDefinition;
