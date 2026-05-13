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
};
