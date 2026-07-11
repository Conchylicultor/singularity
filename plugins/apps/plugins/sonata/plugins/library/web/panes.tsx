import { type ReactElement, useEffect, useState } from "react";
import { Pane, PaneChrome, type, type Hint } from "@plugins/primitives/plugins/pane/web";
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
 * here via `useIndexMatch`). Standard chrome with a "Library" title; the
 * `Sonata.Home` gallery owns its scroll inside the chrome's single `PaneScroll`.
 */
export const sonataLibraryPane = Pane.define({
  id: "sonata-library",
  segment: "",
  appPath: "/sonata",
  component: SonataLibraryBody,
});

function SonataLibraryBody(): ReactElement {
  return (
    <PaneChrome pane={sonataLibraryPane} title="Library">
      <SonataLibrarySurface />
    </PaneChrome>
  );
}

/**
 * The player pane at `/sonata/song/:songId` — a real URL that survives reload
 * and back/forward. Opened with `mode:"root"` so each open replaces the route
 * with a single full-surface pane (a fresh instance, hence a remount). The
 * optimistic `title` rides in `hint` purely as a DISPLAY value for `useTitle`
 * (the browser-tab / tab-strip label before `songsResource` settles) — it is
 * NOT a data source: the toolbar title and every consumer read the canonical
 * row from `songsResource`. `resolve` hydrates every source for the song on
 * direct navigation / reload (see {@link useSonataPlayerResolve}).
 */
export const sonataPlayerPane = Pane.define({
  id: "sonata-player",
  segment: "song/:songId",
  chrome: { header: SonataToolbar },
  // Display-only optimistic label for `useTitle` (tab/document title) before the
  // songs resource settles. Structurally unwritable: `Hint.pick` hands it back
  // only alongside the canonical value, and it is never persisted. The title is
  // library-owned (`songsResource`); the shell keeps no mirror.
  hint: type<{ title: string }>(),
  resolve: useSonataPlayerResolve,
  component: SonataPlayerSurface,
  // Tab/document title: the canonical song name from the global songs resource
  // (reflects renames), falling back to the optimistic hint carried at open time
  // while the resource loads. Self-contained — `useSonata()` context is
  // unavailable at the tab-surface level where this runs.
  useTitle: useSongTitle,
});

/** Canonical song title from the global resource, or the optimistic open hint. */
function useSongTitle(
  { songId }: { songId: string },
  hint: Hint<{ title: string }>,
): string | undefined {
  const songs = useResource(songsResource);
  // `canonical` stays `undefined` until the resource settles — precisely what
  // `pick` reads as "not known yet", so the hint shows through in the meantime
  // and is superseded the instant the real row (and any rename) arrives.
  let canonical: string | undefined;
  if (!songs.pending) canonical = songs.data.find((s) => s.id === songId)?.title;
  return hint.pick("title", canonical);
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
 * The player surface. `SonataToolbar` (← Library + title + display picker on the
 * left, transport/volume/jog wheel on the right) is the pane header via
 * `chrome: { header: SonataToolbar }`; the surface body is the `Sonata.Transport`
 * strip (body top), the active display (`Sonata.Display.Dispatch`), and the
 * collapsible `SectionPane`.
 */
function SonataPlayerSurface(): ReactElement {
  const { songId } = sonataPlayerPane.useParams();
  const { score, tempoScale, effectiveDisplayId, setCurrentSong, clearCurrentSong } =
    useSonata();

  // Mark this song open on mount (once per open — each open is a fresh
  // `mode:"root"` instance, so this fires exactly once and bumps `songOpenEpoch`).
  // Clear on unmount so library-state effects don't mis-attribute playback. Only
  // the bare id is marked open: the title is library-owned (`songsResource`), so
  // there is nothing to seed here.
  useEffect(() => {
    setCurrentSong(songId);
    return () => clearCurrentSong();
    // Re-run only when the song id changes; `setCurrentSong`/`clearCurrentSong`
    // are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  return (
    // The toolbar (Start: ← Library, title, display picker; End: transport,
    // volume, jog wheel — contributed by transport-bar / engine / piano-roll) IS
    // the pane header: `PaneChrome` renders `SonataToolbar`'s zones via
    // `chrome: { header: SonataToolbar }` on `sonataPlayerPane`. The full-width
    // Transport progress strip moves OUT of the header INTO the body top (the
    // first child below), and the display + Section panels fill the rest. The
    // body is a single `h-full` column under the chrome's inert `PaneScroll`.
    <PaneChrome pane={sonataPlayerPane}>
      <Column
        fill
        scrollBody={false}
        className="h-full bg-background text-foreground"
        header={
          /* Transport strip: full-width progression bar (and future transport
             widgets). Renders nothing when no contributor is present. */
          <Sonata.Transport.Render>
            {(t) => <t.component key={t.id} />}
          </Sonata.Transport.Render>
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
    </PaneChrome>
  );
}
