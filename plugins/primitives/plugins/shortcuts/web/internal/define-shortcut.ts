import { Shortcuts } from "../slots";
import type { ShortcutDescriptor } from "./types";
import { parseCombo } from "./parse-keys";

export function defineShortcut(descriptor: ShortcutDescriptor) {
  if (import.meta.env.DEV) {
    const parsed = parseCombo(descriptor.keys);
    if (!parsed) {
      console.warn(
        `[shortcuts] defineShortcut "${descriptor.id}": ` +
          `invalid key combo "${descriptor.keys}" — shortcut will never fire.`,
      );
    }
  }
  return Shortcuts.Shortcut(descriptor);
}
