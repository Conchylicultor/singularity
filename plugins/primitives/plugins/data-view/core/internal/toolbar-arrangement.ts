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
}
