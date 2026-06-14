export type ParsedCombo = {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
};

export type ShortcutDescriptor = {
  id: string;
  keys: string;
  label: string;
  group?: string;
  handler: () => void;
  when?: () => boolean;
  priority?: number;
  /**
   * Fire even when an editable element (input/textarea/select/contenteditable)
   * is focused. Off by default: plain-key shortcuts yield to the text field so
   * the keystroke is typed. Modifier combos (Cmd/Ctrl/Alt+…) always fire
   * regardless of this flag. Set true only for a plain-key shortcut that must
   * win inside inputs.
   */
  enableInInputs?: boolean;
  /**
   * If set, this shortcut is eligible only when its surface is the focused
   * surface; unset = global, always eligible.
   */
  surfaceId?: string;
};
