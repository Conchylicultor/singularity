import { type ReactElement, useEffect, useState } from "react";
import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Sonata,
  SonataToolbar,
  TEMPO_MATH_FLOOR,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { songsResource } from "../core";
import { Library } from "./slots";
import { SonataLibrarySurface } from "./components/library-surface";
import { SectionPane } from "./components/section-pane";

// Panes are declared first so their types are known before the component bodies
// reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

/**
 * The library index pane — Sonata's landing surface at bare `/sonata`. Empty
 * segment + `appPath` makes it the app's index pane (the empty route resolves
 * here via `useIndexMatch`). `chrome:false` because the gallery is its own UI.
 */
export const sonataLibraryPane = Pane.define({
  id: "sonata-library",
  segment: "",
  appPath: "/sonata",
  chrome: false,
  component: SonataLibrarySurface,
});

/**
 * The player pane at `/sonata/song/:songId` — a real URL that survives reload
 * and back/forward. Opened with `mode:"root"` so each open replaces the route
 * with a single full-surface pane (a fresh instance, hence a remount). The
 * optimistic `title` rides in `input` so the header shows immediately, before
 * the song resource confirms. `resolve` hydrates every source for the song on
 * direct navigation / reload (see {@link useSonataPlayerResolve}).
 */
export const sonataPlayerPane = Pane.define({
  id: "sonata-player",
  segment: "song/:songId",
  chrome: false,
  input: type<{ title: string }>(),
  resolve: useSonataPlayerResolve,
  component: SonataPlayerSurface,
  // Tab/document title: the canonical song name from the global songs resource
  // (reflects renames), falling back to the optimistic `input.title` carried at
  // open time while the resource loads. Self-contained — `useSonata()` context
  // is unavailable at the tab-surface level where this runs.
  useTitle: useSongTitle,
});

/** Canonical song title from the global resource, or the optimistic open title. */
function useSongTitle(
  { songId }: { songId: string },
  input: { title?: string },
): string | undefined {
  const songs = useResource(songsResource);
  if (songs.pending) return input.title;
  return songs.data.find((s) => s.id === songId)?.title ?? input.title;
}

/**
 * Resolve hook: hydrate every registered source's raw for `songId` and gate the
 * pane on the song existing. Lifted out of `useOpenSong` so hydration also runs
 * on direct navigation / reload (a deep-linked `/sonata/song/:id`), not only on a
 * library click. Source-agnostic: a source with no data for the song returns
 * `undefined` and is skipped.
 */
function useSonataPlayerResolve({ songId }: { songId: string }) {
  const songsResult = useResource(songsResource);
  const sources = Library.Source.useContributions();
  const { setRawMap } = useSonata();
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- async hydration with cancellation flag: fans out over the dynamic plugin-contributed Library.Source registry (Promise.all of per-source hydrate), so a single useResource/useEndpoint cannot express it; setHydratedFor(null) resets the settle gate before the await and setRawMap/setHydratedFor(songId) commit only after the cancel guard, which is genuinely stateful (no derive-in-render equivalent). */
    setHydratedFor(null);
    void (async () => {
      const rawMap: Record<string, unknown> = {};
      await Promise.all(
        sources.map(async (s) => {
          const raw = await s.hydrate(songId);
          if (raw !== undefined) rawMap[s.sourceId] = raw;
        }),
      );
      if (cancelled) return;
      setRawMap(rawMap);
      setHydratedFor(songId);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [songId, sources, setRawMap]);

  const hydrated = hydratedFor === songId;
  // `found` is gated by `hydrated` (requires the effect above to complete), so
  // the resource is guaranteed settled by the time `found` can be true. Reading
  // `.data` only when not pending avoids the collapse.
  const found = hydrated && !songsResult.pending && songsResult.data.some((s) => s.id === songId);
  return { pending: !hydrated, found };
}

/**
 * The player surface — a full-surface pane: the `Sonata.Toolbar` host (← Library
 * + title + display picker on the left, transport/volume on the right), the
 * `Sonata.Transport` strip, the active display (`Sonata.Display.Dispatch`), and
 * the collapsible `SectionPane`.
 */
function SonataPlayerSurface(): ReactElement {
  const { songId } = sonataPlayerPane.useParams();
  const input = sonataPlayerPane.useInput();
  const { score, tempoScale, activeDisplayId, setCurrentSong, clearCurrentSong } =
    useSonata();

  // Mark this song open on mount (once per open — each open is a fresh
  // `mode:"root"` instance, so this fires exactly once and bumps `songOpenEpoch`).
  // Clear on unmount so library-state effects don't mis-attribute playback.
  // Title comes from `input.title` (set by the library on open); `resolve` gated
  // `found` on the song existing, so by mount the resource is settled but we
  // avoid reading it here to keep the dependency footprint minimal.
  useEffect(() => {
    setCurrentSong({ id: songId, title: input.title ?? "Untitled" });
    return () => clearCurrentSong();
    // Re-run only when the song id changes; `setCurrentSong`/`clearCurrentSong`
    // are stable. `input.title` is intentionally read once at open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // Enumerate displays via the dispatch slot's contributions — the `Extra`
  // metadata (id/label/icon/capabilities) is fully readable; only `component`
  // is sealed. Never names a specific display.
  const displays = Sonata.Display.useContributions();
  const effectiveDisplayId = activeDisplayId ?? displays[0]?.id ?? null;

  return (
    <Column
      fill
      scrollBody={false}
      className="h-full bg-background text-foreground"
      header={
        <>
          {/* Toolbar: the PaneToolbar host renders both zones — Start (← Library,
              title, display picker; contributed by this plugin) and End (transport,
              volume; contributed by transport-bar / engine). Both reorderable. */}
          <SonataToolbar.Host />

          {/* Transport strip: full-width progression bar (and future transport
              widgets). Renders nothing when no contributor is present. */}
          <Sonata.Transport.Render>
            {(t) => <t.component key={t.id} />}
          </Sonata.Transport.Render>
        </>
      }
      body={
        /* Main area: the active display + free-floating Section panels. */
        <Stack direction="row" gap="none" align="stretch" className="h-full">
          <Clip fill>
            {effectiveDisplayId ? (
              <Sonata.Display.Dispatch
                score={score}
                // Displays scale geometry by this to cancel the scale folded into
                // `score`; floor it so a frozen 0% (which scales `score` by the
                // same floor) cancels to a finite layout instead of NaN.
                tempoScale={Math.max(tempoScale, TEMPO_MATH_FLOOR)}
                activeDisplayId={effectiveDisplayId}
              />
            ) : (
              <Center className="h-full p-2xl">
                <Text as="div" variant="body" tone="muted">
                  No display selected.
                </Text>
              </Center>
            )}
          </Clip>

          {/* Free-floating panels (current-chord readout, controls, …),
              collapsible to a thin rail. */}
          <SectionPane />
        </Stack>
      }
    />
  );
}
