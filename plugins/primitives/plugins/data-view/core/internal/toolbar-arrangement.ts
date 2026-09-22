import type { ComponentType, ReactNode } from "react";

/**
 * The forms the host builds a toolbar's parts in. Data, not components: the
 * host owns every part (search, control triggers, creators) and only asks the
 * arrangement which shape of each it wants, so an arrangement can place parts
 * but never re-instantiate one.
 */
export interface ToolbarPartForms {
  /** `field`: a bordered fixed-width search box. `bare`: a borderless field
   *  that fills its cell, with a trailing `/` hint; Escape clears it. */
  search: "field" | "bare";
  /** `ghost`: square ghost icon triggers. `round`: circular icon triggers. */
  controls: "ghost" | "round";
  /** `labelled`: one creator is a labelled button. `round`: a filled circular
   *  `+` (its label moves to the tooltip). */
  creators: "labelled" | "round";
}

/**
 * The pre-built pieces of a DataView toolbar, handed to an arrangement to place.
 * Every node is built once by the host; an arrangement renders each at most
 * once (a part rendered twice would be two live instances of it).
 */
export interface ToolbarParts {
  /** The surface's title (`DataViewProps.title`), or `null`. */
  title: ReactNode;
  /**
   * The view switcher in both of its forms — `strip` (the editable chip row)
   * and `chip` (one collapsed chip). Render exactly one. Both are `null` on a
   * pinned surface. The switcher is the only way to add, rename or reorder
   * views, so an arrangement must render one of them.
   */
  switcher: { strip: ReactNode; chip: ReactNode };
  /** The search input, in `forms.search`. Always render it: a non-empty query
   *  must stay visible. */
  search: ReactNode;
  /** Moves keyboard focus into the search input. */
  focusSearch: () => void;
  /** The current search query. */
  query: string;
  /** One trigger per applicable `DataViewSlots.Control`, in order, in
   *  `forms.controls`. */
  controls: ReactNode;
  /** The same controls behind ONE trigger (without search), in
   *  `forms.controls` — for an arrangement that runs out of room. */
  foldedControls: ReactNode;
  /** Consumer toolbar actions (`DataViewProps.actions`). */
  actions: ReactNode;
  /** The create affordance (`DataViewProps.creators`), in `forms.creators`. */
  creators: ReactNode;
}

/**
 * How a DataView lays out its WIDE toolbar. A surface passes the arrangement
 * value it imported (`DataViewProps.toolbar`); absent → the default bar. The
 * host still owns the sticky band, its measurement, the hover-reveal group and
 * the compact fold — an arrangement only decides the wide layout, so no
 * arrangement can break a narrow pane.
 */
export interface ToolbarArrangement {
  /** Stable name, for debugging and tests. */
  id: string;
  forms: ToolbarPartForms;
  component: ComponentType<ToolbarParts>;
  /**
   * Empty space between the toolbar band and the view below it, as a CSS
   * length; absent → none (the view starts flush under the band). It sits
   * OUTSIDE the sticky band, so the pinned band never grows by it. Only the
   * wide layout wears it: the compact fold keeps a narrow pane's tight rhythm.
   */
  spaceBelow?: string;
}

/**
 * What a hosted toolbar's frame receives — see {@link HostedToolbar}. Every
 * node is built once by the host; the frame renders each at most once.
 */
export interface HostedToolbarParts {
  /**
   * The one options trigger: search, and every applicable control, behind one
   * button that shows a count badge while anything narrows the list. It is the
   * ONLY way to reach them, so render it — in the frame's own header, where the
   * user looks for the surface's controls. Hover-revealed off the DataView
   * root (which the frame renders inside), and pinned visible while a search
   * query is typed. `null` while the surface has no active view (its config
   * is loading, or authors no view).
   */
  options: ReactNode;
  /**
   * The collapsed view switcher, when the surface authors more than one view;
   * otherwise (one view, a pinned surface, no active view) `null`. Render it
   * when present: it is the only way to change views.
   */
  switcher: ReactNode;
  /** The create affordance (`DataViewProps.creators`) in its compact form, or
   *  `null` when the surface has none. */
  creators: ReactNode;
  /** The rows — the active view, or its loading / no-views state. */
  body: ReactNode;
}

/**
 * A DataView with NO toolbar band: the surface draws its own frame (typically a
 * small card inside someone else's chrome) and places the parts the host hands
 * it. For small, fixed lists where a band of search/filter/sort would be mostly
 * empty chrome — the controls stay reachable through {@link
 * HostedToolbarParts.options}.
 *
 * Not a {@link ToolbarArrangement}: an arrangement lays out a band and must
 * render the switcher and search inline, and it is ignored by the compact fold.
 * A hosted surface has no band, so it has neither obligation and no fold.
 *
 * A hosted surface owns its own header, so `title` and `actions` are not
 * accepted alongside it (the frame renders its own).
 */
export interface HostedToolbar {
  kind: "hosted";
  frame: ComponentType<HostedToolbarParts>;
}

/** `DataViewProps.toolbar`: a band layout, or a host-drawn frame. */
export type DataViewToolbarSpec = ToolbarArrangement | HostedToolbar;

/** Narrow a toolbar spec to the hosted form. */
export function isHostedToolbar(
  spec: DataViewToolbarSpec | undefined,
): spec is HostedToolbar {
  return spec !== undefined && "kind" in spec && spec.kind === "hosted";
}
