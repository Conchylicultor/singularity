/**
 * The viewer's keyboard, as one table. The key handler matches against it, the
 * `?` shortcut sheet lists it, and each button's tooltip reads its key caps from
 * it — so the three cannot disagree about which key does what.
 */

export type ViewerAction =
  | "close"
  | "zoom-in"
  | "zoom-out"
  | "fit"
  | "actual-size"
  | "previous"
  | "next"
  | "copy"
  | "shortcuts";

export interface ViewerKey {
  readonly action: ViewerAction;
  /** `KeyboardEvent.key` values that trigger the action (letters lower-case). */
  readonly keys: readonly string[];
  /**
   * `true`: needs ⌘ (Mac) or Ctrl held. `false`: fires only with no ⌘ / Ctrl /
   * Alt held, so `⌘+` / `⌘−` stay the browser's page zoom. Shift is always
   * allowed — it is how `+` and `?` are typed.
   */
  readonly mod: boolean;
  /** The key caps shown for it. `"mod"` is the platform's ⌘ / Ctrl. */
  readonly caps: readonly string[];
  /** What it does, for the shortcut sheet. */
  readonly description: string;
}

export const VIEWER_KEYS: readonly ViewerKey[] = [
  {
    action: "zoom-in",
    keys: ["+", "="],
    mod: false,
    caps: ["+"],
    description: "Zoom in",
  },
  {
    action: "zoom-out",
    keys: ["-", "_"],
    mod: false,
    caps: ["−"],
    description: "Zoom out",
  },
  {
    action: "fit",
    keys: ["0"],
    mod: false,
    caps: ["0"],
    description: "Fit to screen",
  },
  {
    action: "actual-size",
    keys: ["1"],
    mod: false,
    caps: ["1"],
    description: "Actual size (100%)",
  },
  {
    action: "previous",
    keys: ["ArrowLeft"],
    mod: false,
    caps: ["←"],
    description: "Previous image",
  },
  {
    action: "next",
    keys: ["ArrowRight"],
    mod: false,
    caps: ["→"],
    description: "Next image",
  },
  {
    action: "copy",
    keys: ["c"],
    mod: true,
    caps: ["mod", "C"],
    description: "Copy image",
  },
  {
    action: "shortcuts",
    keys: ["?"],
    mod: false,
    caps: ["?"],
    description: "Show shortcuts",
  },
  {
    action: "close",
    keys: ["Escape"],
    mod: false,
    caps: ["Esc"],
    description: "Close",
  },
];

/** The pointer gestures the sheet lists above the keys. Not keys — nothing
 *  matches against these — but the sheet is where a user learns them. */
export const VIEWER_GESTURES: readonly {
  readonly cap: string;
  readonly description: string;
}[] = [
  { cap: "Click", description: "Fit ↔ 100% at that spot" },
  { cap: "Scroll", description: "Zoom around the pointer" },
  { cap: "Drag", description: "Pan when zoomed" },
];

/** The keyboard fields {@link matchViewerKey} reads. */
export interface KeyInput {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

/** The action a keydown triggers, or `undefined` when the viewer has no use
 *  for that key (and the browser should keep it). */
export function matchViewerKey(e: KeyInput): ViewerAction | undefined {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const hit = VIEWER_KEYS.find((k) =>
    k.mod
      ? mod && k.keys.includes(key)
      : !mod && !e.altKey && k.keys.includes(key),
  );
  return hit?.action;
}

/** The table row for `action`. Every action has exactly one. */
export function viewerKey(action: ViewerAction): ViewerKey {
  const k = VIEWER_KEYS.find((v) => v.action === action);
  if (!k) throw new Error(`No VIEWER_KEYS entry for "${action}"`);
  return k;
}
