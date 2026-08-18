import { createContext } from "react";
import type {
  ActionForm,
  ShrinkLadder,
} from "@plugins/primitives/plugins/action-presentation/web";

/**
 * Everything the bar knows about one occupant, held OUTSIDE React state on
 * purpose.
 *
 * The bar's React state is the placement — the one thing a widget must
 * re-render to honour. Ladders, holds, popups and pointer locks are inputs to
 * the next decision, not outputs anyone renders, so routing them through
 * `useState` would re-render every occupant for a pointer-down that changes
 * nothing on screen.
 */
export interface BarItemEntry {
  readonly id: string;
  /** The item's one stable portal target, created once and owned for its whole life. */
  readonly container: HTMLDivElement;
  ladder: Required<ShrinkLadder>;
  /**
   * The inline rungs this item last DECLARED, as one comparable string — what
   * a rung index means for this item.
   *
   * Distinct from {@link BarItemEntry.ladder}, and it has to be: a declaration's
   * own release resets `ladder` to the default, and that release runs on every
   * FORM change, because the item's channel identity carries its assigned form.
   * So `ladder` cannot answer "did the ladder actually change?" — it reads as
   * changed every time the bar moves the item a rung.
   *
   * Anything invalidated by a ladder change (H2's bars, whose rung indices only
   * mean anything against one ladder) has to key on this instead. Keyed on
   * inline rungs alone rather than the whole ladder, because that is exactly
   * what a rung index names; `yields` changes the demotion ORDER, not what any
   * index means.
   */
  declaredRungs: string | null;
  /** Live `useHoldShrink` holds — what survives the pointer release (a fling's coast). */
  holds: number;
  /** A popover of this item's own is open, so its top-layer content must not move. */
  popupOpen: boolean;
  /** A pointer went down inside this item and has not come up. */
  pointerPinned: boolean;
  /**
   * This container holds an `<iframe>` and the browser cannot move it without
   * reloading it. Set once, reported once: the bar then refuses to relocate it
   * at all rather than silently destroying the frame's state.
   */
  immovable: boolean;
}

/**
 * The imperative half of the item↔bar channel: stable for the bar's whole life,
 * so an item's registration effects never re-run because the bar re-rendered.
 */
export interface BarRegistry {
  /**
   * Edit mode is on: every occupant renders inline, in React's own tree, and
   * nothing relocates. dnd-kit's handles must stay under their `SortableContext`
   * — a drag handle re-parented out of it is a drag that silently does nothing.
   */
  readonly editMode: boolean;
  register(id: string, container: HTMLDivElement): () => void;
  declare(id: string, ladder: Required<ShrinkLadder>): () => void;
  hold(id: string): () => void;
  setPopupOpen(id: string, open: boolean): void;
  /**
   * This item's contribution started or stopped rendering anything.
   *
   * The shared `ResizeObserver` cannot carry this signal in both directions: an
   * occupant that renders nothing is `hidden` (so it costs no gap), and a
   * `display: none` element reports no resize when content appears inside it.
   * So the item watches its own container's child list and says so.
   */
  contentChanged(id: string): void;
}

/** `null` — no bar above — is a legitimate state: `AdaptiveBar.Item` is then transparent. */
export const BarRegistryContext = createContext<BarRegistry | null>(null);

const NO_FORMS: ReadonlyMap<string, ActionForm> = new Map();

/**
 * The reactive half: the form each item was assigned on the last committed
 * pass. Separate from the registry because THIS is what must re-render the
 * occupants, and the registry is what must not.
 */
export const BarFormsContext =
  createContext<ReadonlyMap<string, ActionForm>>(NO_FORMS);
