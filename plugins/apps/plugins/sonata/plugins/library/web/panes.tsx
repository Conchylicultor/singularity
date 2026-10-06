import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  Pane,
  PaneChrome,
  type,
  type Hint,
  defineRoute,
  resolveRow,
  type ResolveResult,
} from "@plugins/primitives/plugins/pane/web";
import { mapRow, useLiveRow } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useLoadDocument,
  useSongDocument,
} from "@plugins/apps/plugins/sonata/plugins/document/web";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";
import { barStartBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  PlayerDisplay,
  PlayerTransport,
} from "@plugins/apps/plugins/sonata/plugins/player/web";
import { useSonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { sonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/core";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { songLibrary } from "../core";
import { Library } from "./slots";
import { SonataLibrarySurface } from "./components/library-surface";
import { SongTitle } from "./components/song-title-field";
import { SectionPane } from "./components/section-pane";
import { formatBarParam, parseBarParam } from "./bar-param";

// Panes are declared first so their types are known before the component bodies
// reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

/**
 * The library index pane — Sonata's landing surface at bare `/sonata`.
 * `appIndex` marks it as the app's index pane (the empty route resolves here
 * via `useIndexMatch`). Standard chrome with a "Library" title; the
 * `Sonata.Home` gallery owns its scroll inside the chrome's single `PaneScroll`.
 */
export const sonataLibraryPane = Pane.define({
  title: "Library",
  route: defineRoute({ id: "sonata-library", segment: "" }),
  app: sonataApp,
  appIndex: true,
  component: SonataLibraryBody,
});

function SonataLibraryBody(): ReactElement {
  return (
    <PaneChrome pane={sonataLibraryPane}>
      <SonataLibrarySurface />
    </PaneChrome>
  );
}

/**
 * The player pane at `/sonata/song/:songId/:bar?` — a real URL that survives
 * reload and back/forward. The optional `bar` opens the song with its playhead
 * parked at that bar (see {@link useSonataPlayerResolve}); build such a link
 * with {@link sonataSongLink}. Opened with `mode:"root"` so each open replaces the route
 * with a single full-surface pane (a fresh instance, hence a remount). The
 * optimistic `title` rides in `hint` purely as a DISPLAY value for `title.text`
 * (the browser-tab / tab-strip label before the song's live row settles) —
 * it is NOT a data source: the header title and every consumer read the
 * canonical row from `songLibrary`. `useResolve` hydrates every source for the song on
 * direct navigation / reload (see {@link useSonataPlayerResolve}).
 */
const sonataPlayerRoute = defineRoute({
  id: "sonata-player",
  segment: "song/:songId/:bar?",
});

export const sonataPlayerPane = Pane.define({
  route: sonataPlayerRoute,
  app: sonataApp,
  // Display-only optimistic label for `title.text` (tab/document title) before the
  // song's row settles. Structurally unwritable: `Hint.pick` hands it back
  // only alongside the canonical value, and it is never persisted. The title is
  // library-owned (`songLibrary`); the shell keeps no mirror.
  hint: type<{ title: string }>(),
  useResolve: useSonataPlayerResolve,
  component: SonataPlayerSurface,
  // Title: `text` (tab/document title) is the canonical song name from its live
  // library row (reflects renames), falling back to the optimistic hint
  // carried at open time while it loads. Self-contained — the player scope
  // is unavailable at the tab-surface level where it runs. The header paints
  // `component` instead: the inline-editable title, mounted inside the pane so
  // it may read app context.
  title: { useText: useSongTitle, component: SongTitle },
  // Main surface: aux panes opened to the right never steal the tab title.
  titleOwner: true,
});

/**
 * The app-rooted link to a library song in the player, optionally at a bar —
 * the one spelling of the player URL for a caller outside the app (a file
 * preview's "Open in Sonata").
 */
export function sonataSongLink(songId: string, bar?: number): string {
  return sonataPlayerRoute.link(
    sonataApp,
    bar === undefined ? { songId } : { songId, bar: formatBarParam(bar) },
  );
}

/** Canonical song title from its live library row, or the optimistic open hint. */
function useSongTitle(
  { songId }: { songId: string },
  hint: Hint<{ title: string }>,
): string | undefined {
  const song = useLiveRow(songLibrary, songId);
  // `canonical` stays `undefined` until the row settles — precisely what
  // `pick` reads as "not known yet", so the hint shows through in the meantime
  // and is superseded the instant the real row (and any rename) arrives. A
  // failed read offers its last-seen row (`stale`), else the hint stays.
  const canonical = foldResource(
    mapRow(song, (row) => row?.title),
    {
      loading: () => undefined,
      error: (_error, stale) => stale,
      ready: (title) => title,
    },
  );
  return hint.pick("title", canonical);
}

/**
 * Resolve hook: hydrate every registered source's raw for `songId` and gate the
 * pane on the song existing. Lifted out of `useOpenSong` so hydration also runs
 * on direct navigation / reload (a deep-linked `/sonata/song/:id`), not only on a
 * library click. Source-agnostic: a source with no data for the song returns
 * `undefined` and is skipped.
 *
 * Also places the playhead at the URL's `:bar?`: with the load (a seek-on-load
 * intent the session's content reset honours), or — when only the bar changed
 * on the song already loaded — by a direct seek. A malformed bar segment is no
 * bar ({@link parseBarParam}); a bar past the song's end clamps to its last bar.
 */
function useSonataPlayerResolve({
  songId,
  bar: barParam,
}: {
  songId: string;
  bar?: string;
}): ResolveResult {
  const song = useLiveRow(songLibrary, songId);
  const sources = Library.Source.useContributions();
  const loadDocument = useLoadDocument();
  const { requestSeekOnLoad, seekTo, score } = useSession();
  const { content } = useSongDocument();
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const bar = parseBarParam(barParam);
  const barRef = useLatestRef(bar);
  // The (song, bar) the playhead was last placed for — by the load intent armed
  // with a load, or by a direct seek. Lets the bar effect below tell a bar
  // CHANGE on the loaded song (seek now) from the bar a load already honours.
  const placedForRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- async hydration with cancellation flag: fans out over the dynamic plugin-contributed Library.Source registry (Promise.all of per-source hydrate), so a single useLive/useEndpoint cannot express it; setHydratedFor(null) resets the settle gate before the await and loadDocument/setHydratedFor(songId) commit only after the cancel guard, which is genuinely stateful (no derive-in-render equivalent). */
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
      // Open at the URL's bar: armed in the same turn as the load, so the
      // session's content reset — which parks the playhead at the timeline
      // origin otherwise — parks it at the bar instead. The bar's beat is read
      // off the NEW score (its meter map), which only the reset has.
      const target = barRef.current;
      if (target !== undefined) {
        requestSeekOnLoad((loaded) => barStartBeat(loaded, target));
      }
      placedForRef.current = placementKey(songId, target);
      // The song id travels WITH its content: loading it hands the song's
      // settings over in the same write (see `useLoadDocument`).
      loadDocument({ kind: "library", songId }, rawMap);
      setHydratedFor(songId);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [songId, sources, loadDocument, requestSeekOnLoad, barRef]);

  const hydrated = hydratedFor === songId;
  const ready = hydrated && content.kind === "ready";

  // A bar change on the song already loaded here (`/song/X/3` → `/song/X/9`
  // in place) reloads nothing, so no content reset runs to honour a load
  // intent: seek directly. The bar a load armed is already placed (see
  // `placedForRef`), so this never fights the reset; a URL that drops its bar
  // leaves the playhead where it is.
  useEffect(() => {
    if (!ready) return;
    const key = placementKey(songId, bar);
    if (placedForRef.current === key) return;
    placedForRef.current = key;
    if (bar !== undefined) seekTo(barStartBeat(score, bar));
  }, [ready, songId, bar, score, seekTo]);
  // Not known yet until BOTH the hydration effect above has completed and the
  // song's row has settled — a loading row is never read as "no such song" (a
  // not-found flash on a deep link whose hydration beat the read).
  if (!hydrated) return { status: "pending" };
  return resolveRow(song);
}

/** Identifies where the playhead was placed for: a song, at a bar or its start. */
function placementKey(songId: string, bar: number | undefined): string {
  return `${songId}@${bar ?? "start"}`;
}

/**
 * The player surface. The pane's OWN header carries the whole player bar: the
 * song title is the pane title (an inline-editable node, since it needs the
 * loaded row), and ← Library, the display picker, transport, volume and the jog
 * wheel are contributions to `sonataPlayerPane.Actions` — which side of the row
 * each lands on is the slot's reorder config. The surface body is the
 * player's transport strip (`PlayerTransport`, body top), its active display
 * (`PlayerDisplay`), and the collapsible `SectionPane`.
 */
function SonataPlayerSurface(): ReactElement {
  const { songId } = sonataPlayerPane.useParams();
  const { setCurrentSong, clearCurrentSong } = useSonataApp();

  // Mark this song open on mount (once per open — each open is a fresh
  // `mode:"root"` instance, so this fires exactly once and bumps `songOpenEpoch`).
  // Clear on unmount so library-state effects don't mis-attribute playback. Only
  // the bare id is marked open: the title is library-owned (`songLibrary`), so
  // there is nothing to seed here.
  useEffect(() => {
    setCurrentSong(songId);
    return () => clearCurrentSong();
    // Re-run only when the song id changes; `setCurrentSong`/`clearCurrentSong`
    // are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  return (
    // The player bar IS the pane header — one slot, title included. The
    // full-width Transport progress strip stays OUT of it, in the body top (the
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
          <PlayerTransport />
        }
        body={
          /* Main area: the active display + free-floating Section panels. */
          <Stack direction="row" gap="none" align="stretch" className="h-full">
            <PlayerDisplay />

            {/* Free-floating panels (current-chord readout, controls, …),
                collapsible to a thin rail. */}
            <SectionPane />
          </Stack>
        }
      />
    </PaneChrome>
  );
}
