import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Sonata } from "../slots";
import { SonataProvider } from "../context";
import { CursorStoreProvider } from "../cursor-store";
import { LoadedSongProvider } from "../loaded-song";
import { SongSettingsMount } from "../song-setting-mount";

/**
 * Sonata's app surface. Sonata is a pure full-surface app: the sidebar-less
 * app shell around the full-pane renderer, so the active pane (the library
 * index at `/sonata` or the player at `/sonata/song/:songId`) fills the whole
 * surface and its header — the surface's top chrome — carries the app
 * launcher at its leading edge. Navigation
 * is URL-driven via the pane router — reload / back / forward all persist.
 *
 * Alongside the renderer it keeps the headless, always-mounted Sonata-scoped
 * side effects (e.g. play recording) so they observe context regardless of which
 * pane is active, and the per-song setting observers (`Sonata.SongSetting`,
 * mounted afresh for each loaded song).
 *
 * The cursor store and the loaded song (content + per-song settings) are
 * provided HERE, wrapping `SonataProvider`, so each Sonata surface (desktop
 * window / keep-alive tab) gets its own isolated playback state. They wrap from
 * the OUTSIDE because `SonataProvider`'s own body both writes the cursor (rAF
 * transport loop) and loads and reads the song (`setRawMap`, the `baseScore`
 * memo) — a component can't use a store's hooks if it renders that store's
 * `<Provider>` in its own JSX (the hooks would resolve above the Provider). With
 * the providers one level up, `SonataProvider` and every child use the normal
 * hooks.
 */
export function SonataLayout() {
  return (
    <CursorStoreProvider>
      <LoadedSongProvider>
        <SonataProvider>
          <div className="h-full min-h-0">
            <AppShellLayout>
              <FullPane />
            </AppShellLayout>
            <Sonata.Effect.Mount />
            <SongSettingsMount />
          </div>
        </SonataProvider>
      </LoadedSongProvider>
    </CursorStoreProvider>
  );
}
