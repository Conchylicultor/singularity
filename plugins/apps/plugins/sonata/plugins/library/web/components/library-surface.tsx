import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";

/**
 * The library index surface — Sonata's landing pane at `/sonata`. The (separate)
 * library plugin contributes its gallery to `Sonata.Home`; this surface just
 * gives it the full area. Renders blank if nothing is contributed yet.
 */
export function SonataLibrarySurface() {
  return (
    <Column
      fill
      scrollBody={false}
      className="h-full bg-background text-foreground"
      body={
        <Sonata.Home.Render>{(h) => <h.component key={h.id} />}</Sonata.Home.Render>
      }
    />
  );
}
