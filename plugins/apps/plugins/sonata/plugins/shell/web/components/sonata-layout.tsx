import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { Sonata } from "../slots";
import { SonataProvider } from "../context";

/**
 * Sonata's app surface. Sonata is a pure full-surface app, so it mounts the
 * full-pane renderer directly: the active pane (the library index at `/sonata`
 * or the player at `/sonata/song/:songId`) fills the whole surface. Navigation
 * is URL-driven via the pane router — reload / back / forward all persist.
 *
 * Alongside the renderer it keeps the headless, always-mounted Sonata-scoped
 * side effects (e.g. play recording) so they observe context regardless of which
 * pane is active.
 */
export function SonataLayout() {
  return (
    <SonataProvider>
      <div className="h-full min-h-0">
        <FullPane />
        <Sonata.Effect.Render>
          {(e) => <e.component key={e.id} />}
        </Sonata.Effect.Render>
      </div>
    </SonataProvider>
  );
}
