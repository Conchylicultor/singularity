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
  | "shortcuts"
  | "toggle-strip"
  | "toggle-grid"
  | "slideshow"
  | "row-up"
  | "row-down"
  | "open-selected";

/**
 * What the viewer is showing, as far as the keyboard is concerned: one image
 * with its controls, the grid of every image, or the control-less slideshow.
 * A key acts only in the modes its row lists.
 */
export type ViewerMode = "single" | "grid" | "slideshow";

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
  /** The modes the key acts in. A row for the grid alone is listed under its
   *  own heading on the sheet. */
  readonly in: readonly ViewerMode[];
}

const ALL: readonly ViewerMode[] = ["single", "grid", "slideshow"];
const WITH_CONTROLS: readonly ViewerMode[] = ["single", "grid"];
const SINGLE: readonly ViewerMode[] = ["single"];
const GRID: readonly ViewerMode[] = ["grid"];

export const VIEWER_KEYS: readonly ViewerKey[] = [
  {
    action: "zoom-in",
    keys: ["+", "="],
    mod: false,
    caps: ["+"],
    description: "Zoom in · larger thumbnails in the grid",
    in: WITH_CONTROLS,
  },
  {
    action: "zoom-out",
    keys: ["-", "_"],
    mod: false,
    caps: ["−"],
    description: "Zoom out · smaller thumbnails in the grid",
    in: WITH_CONTROLS,
  },
  {
    action: "fit",
    keys: ["0"],
    mod: false,
    caps: ["0"],
    description: "Fit to screen",
    in: SINGLE,
  },
  {
    action: "actual-size",
    keys: ["1"],
    mod: false,
    caps: ["1"],
    description: "Actual size (100%)",
    in: SINGLE,
  },
  {
    action: "previous",
    keys: ["ArrowLeft"],
    mod: false,
    caps: ["←"],
    description: "Previous image",
    in: ALL,
  },
  {
    action: "next",
    keys: ["ArrowRight"],
    mod: false,
    caps: ["→"],
    description: "Next image",
    in: ALL,
  },
  {
    action: "toggle-strip",
    keys: ["s"],
    mod: false,
    caps: ["S"],
    description: "Thumbnail strip",
    in: WITH_CONTROLS,
  },
  {
    action: "toggle-grid",
    keys: ["g"],
    mod: false,
    caps: ["G"],
    description: "Grid of every image",
    in: WITH_CONTROLS,
  },
  {
    action: "slideshow",
    keys: ["f"],
    mod: false,
    caps: ["F"],
    description: "Slideshow — full screen, no controls",
    in: ALL,
  },
  {
    action: "row-up",
    keys: ["ArrowUp"],
    mod: false,
    caps: ["↑"],
    description: "Image above",
    in: GRID,
  },
  {
    action: "row-down",
    keys: ["ArrowDown"],
    mod: false,
    caps: ["↓"],
    description: "Image below",
    in: GRID,
  },
  {
    action: "open-selected",
    keys: ["Enter"],
    mod: false,
    caps: ["↵"],
    description: "Open the selected image",
    in: GRID,
  },
  {
    action: "copy",
    keys: ["c"],
    mod: true,
    caps: ["mod", "C"],
    description: "Copy image",
    in: ALL,
  },
  {
    action: "shortcuts",
    keys: ["?"],
    mod: false,
    caps: ["?"],
    description: "Show shortcuts",
    in: WITH_CONTROLS,
  },
  {
    action: "close",
    keys: ["Escape"],
    mod: false,
    caps: ["Esc"],
    description: "Close",
    in: ALL,
  },
];

/** The pointer gestures the sheet lists above the keys. Not keys — nothing
 *  matches against these — but the sheet is where a user learns them. */
export const VIEWER_GESTURES: readonly {
  readonly cap: string;
  readonly description: string;
}[] = [
  { cap: "Click", description: "Close — or back to fit when zoomed" },
  { cap: "Click", description: "Next image, in the slideshow" },
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

/** The action a keydown triggers in `mode`, or `undefined` when the viewer
 *  has no use for that key there (and the browser should keep it). */
export function matchViewerKey(
  e: KeyInput,
  mode: ViewerMode,
): ViewerAction | undefined {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const hit = VIEWER_KEYS.find(
    (k) =>
      k.in.includes(mode) &&
      (k.mod
        ? mod && k.keys.includes(key)
        : !mod && !e.altKey && k.keys.includes(key)),
  );
  return hit?.action;
}

/** The table row for `action`. Every action has exactly one. */
export function viewerKey(action: ViewerAction): ViewerKey {
  const k = VIEWER_KEYS.find((v) => v.action === action);
  if (!k) throw new Error(`No VIEWER_KEYS entry for "${action}"`);
  return k;
}
