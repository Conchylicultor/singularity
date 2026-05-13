import { defineSlot } from "@core";
import type { ShortcutDescriptor } from "./internal/types";

export const Shortcuts = {
  Shortcut: defineSlot<ShortcutDescriptor>("shortcuts.shortcut", {
    docLabel: (p) => `${p.id} (${p.keys})`,
  }),
};
