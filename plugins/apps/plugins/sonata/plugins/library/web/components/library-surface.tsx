import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * The library index surface — Sonata's landing pane at `/sonata`. The (separate)
 * library plugin contributes its gallery to `Sonata.Home`; this surface just
 * gives it the full area. Renders blank if nothing is contributed yet.
 */
export function SonataLibrarySurface() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <Sonata.Home.Render>{(h) => <h.component key={h.id} />}</Sonata.Home.Render>
    </div>
  );
}
