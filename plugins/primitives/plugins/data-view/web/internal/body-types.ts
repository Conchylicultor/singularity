import type { ReactNode } from "react";
import type { ResolvedViewInstance } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type {
  DataViewDensity,
  DataViewId,
  DataViewProps,
  DataViewToolbarSpec,
  ToolbarParts,
} from "../../core";
import type { DataViewContribution } from "../slots";
import type { ReadyViewModel } from "./use-data-view-model";

/**
 * Per-surface chrome the shell builds once and hands to the body. The body
 * renders the toolbar (its query input is a per-instance concern), but the
 * switcher, the surface `title`/`actions`, and the toolbar-height measurement
 * ref all belong to the surface — they must survive an active-instance switch.
 */
export interface DataViewShellChrome {
  /** The view switcher in both forms — `EditableViewSwitcher` (`strip`) and
   *  `CollapsedViewSwitcher` (`chip`) — built by the shell (model inputs only)
   *  and placed by the toolbar as opaque nodes. Both `null` when pinned. */
  switcher: ToolbarParts["switcher"];
  /** Number of view instances — the compact toolbar hides a single-view switcher. */
  switcherCount: number;
  title?: ReactNode;
  actions?: ReactNode;
  /**
   * The surface's declared density (`DataViewProps.density`). It travels on the
   * chrome rather than reaching the body twice because both hosts —
   * `DataView` and `MergedDataView` — build their chrome through the one
   * `DataViewShellFrame`, so there is a single place the value can be set and a
   * single place the body reads it from. Absent ⇒ `"comfortable"`.
   */
  density?: DataViewDensity;
  /** The surface's toolbar (`DataViewProps.toolbar`): a band arrangement, or a
   *  hosted frame; absent ⇒ the default bar. A surface property, carried like
   *  `density`. */
  toolbar?: DataViewToolbarSpec;
  /** The search placeholder (`DataViewProps.searchPlaceholder`), a surface
   *  property carried like `toolbar`. Absent ⇒ `"Search…"`. */
  searchPlaceholder?: string;
  /** The shell's toolbar-measurement ref. The body attaches it to the toolbar's
   *  `<Sticky>` so the shell can publish the measured height as
   *  `--dv-header-offset` on the shell root. */
  stickyRef: (node: HTMLElement | null) => void;
}

/**
 * Everything a data source supplies: the full `DataViewProps` surface minus the
 * per-surface keys the shell owns (`storageKey` / `title` / `actions` /
 * `defaultView` / `views` / `density` / `toolbar` / `searchPlaceholder`).
 *
 * `density` is on that list for the same reason `title` is: it describes the
 * SURFACE, not the data bundle, and the body reads it off `chrome`. Omitting it
 * here means a source contributor cannot even spell a density the host would
 * then silently ignore.
 */
export type DataViewSourceBundle<TRow> = Omit<
  DataViewProps<TRow>,
  | "storageKey"
  | "title"
  | "actions"
  | "defaultView"
  | "views"
  | "density"
  | "toolbar"
  | "searchPlaceholder"
>;

/** Props of the per-active-instance body (`DataViewBody`). */
export interface DataViewBodyProps<TRow> extends DataViewSourceBundle<TRow> {
  storageKey: DataViewId;
  viewModel: ReadyViewModel;
  activeInstance: ResolvedViewInstance<DataViewContribution>;
  chrome: DataViewShellChrome;
  /** Scopes the server-page cache per source; `""` (the default) on the
   *  single-source path. See `useServerDataSource`. */
  sourceScope?: string;
}
