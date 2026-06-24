import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * The library index surface — Sonata's landing pane at `/sonata`. The (separate)
 * library plugin contributes its gallery to `Sonata.Home`; this surface just
 * paints it. Rendered inside `PaneChrome` (which owns the "Library" title and the
 * single body scroll), so this returns the `Sonata.Home` content directly — its
 * own `DataView` fills and scrolls under the chrome's `PaneScroll`. Renders blank
 * if nothing is contributed yet.
 */
export function SonataLibrarySurface() {
  return <Sonata.Home.Render>{(h) => <h.component key={h.id} />}</Sonata.Home.Render>;
}
