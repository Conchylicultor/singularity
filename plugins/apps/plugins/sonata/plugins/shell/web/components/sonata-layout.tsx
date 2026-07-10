import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { Sonata } from "../slots";
import { SonataProvider } from "../context";
import { CursorStoreProvider } from "../cursor-store";
import { KeyModeStoreProvider } from "../key-mode-store";
import { TransposeStoreProvider } from "../transpose-store";
import { RhythmStoreProvider } from "../rhythm-store";

/**
 * Sonata's app surface. Sonata is a pure full-surface app, so it mounts the
 * full-pane renderer directly: the active pane (the library index at `/sonata`
 * or the player at `/sonata/song/:songId`) fills the whole surface. Navigation
 * is URL-driven via the pane router — reload / back / forward all persist.
 *
 * Alongside the renderer it keeps the headless, always-mounted Sonata-scoped
 * side effects (e.g. play recording) so they observe context regardless of which
 * pane is active.
 *
 * The cursor and key-mode scoped stores are provided HERE, wrapping
 * `SonataProvider`, so each Sonata surface (desktop window / keep-alive tab) gets
 * its own isolated playback state. They wrap from the OUTSIDE because
 * `SonataProvider`'s own body both writes the cursor (rAF transport loop) and
 * reads the key-mode flag (`baseScore` memo) — a component can't use a store's
 * hooks if it renders that store's `<Provider>` in its own JSX (the hooks would
 * resolve above the Provider). With the providers one level up, `SonataProvider`
 * and every child use the normal hooks.
 */
export function SonataLayout() {
  return (
    <CursorStoreProvider>
      <KeyModeStoreProvider>
        <TransposeStoreProvider>
          <RhythmStoreProvider>
            <SonataProvider>
              <div className="h-full min-h-0">
                <FullPane />
                <Sonata.Effect.Mount />
              </div>
            </SonataProvider>
          </RhythmStoreProvider>
        </TransposeStoreProvider>
      </KeyModeStoreProvider>
    </CursorStoreProvider>
  );
}
