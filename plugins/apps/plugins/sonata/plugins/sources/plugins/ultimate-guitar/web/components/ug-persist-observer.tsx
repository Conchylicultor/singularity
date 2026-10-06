import { useEffect, useRef } from "react";
import { useSongDocument } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { useSonataApp } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { UgSourceRawSchema } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/alignment/core";
import { compile } from "../compile";
import { UG_SOURCE_ID } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { useSaveUltimateGuitar } from "../actions";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Headless, always-mounted persistence observer for the Ultimate Guitar source,
 * contributed to `Sonata.Effect`. Treats the context (`rawById`) as the source of
 * truth and debounce-persists a full `UgTab` snapshot (plus derived duration / end
 * beat) to the server whenever the raw's `tab` changes — never on the fresh load
 * that opening a song triggers (which bumps `songOpenEpoch`), and never when only
 * `raw.alignment` changes (an alignment landing is not an edit), only on edits.
 *
 * This lives OUTSIDE the editor section deliberately: a section body is unmounted
 * while its card is collapsed, so an in-body debounced save would silently drop a
 * pending edit (the effect cleanup clears the timer) and stop observing the moment
 * the card is collapsed mid-debounce — data loss. A `Sonata.Effect` is mounted for
 * the whole open song regardless of card state, so no edit is ever lost. Its
 * internal `rawValue === undefined` guard (and the `UgSourceRawSchema` parse) make it a
 * no-op for songs of any other source.
 *
 * The `PUT` persists `title: songName` (the one place a UG song's title is
 * written); the toolbar title re-renders off the library's live `songs` value,
 * not an in-memory mirror.
 */
export function UltimateGuitarPersistObserver() {
  const { sourceRaw } = useSongDocument();
  const { currentSongId, songOpenEpoch } = useSonataApp();
  const saveTab = useSaveUltimateGuitar();

  const rawValue = sourceRaw(UG_SOURCE_ID);

  const seededEpoch = useRef(songOpenEpoch);
  // The tab as last persisted (or as opened), serialized. Only a change of the
  // TAB is an edit: the alignment child rewrites `raw.alignment` when a job
  // lands, and that must never read as a sheet edit (nor re-save it).
  const savedTab = useRef<string | null>(null);
  useEffect(() => {
    if (!currentSongId || rawValue === undefined) return;
    const parsed = UgSourceRawSchema.safeParse(rawValue);
    if (!parsed.success) return;
    const raw = parsed.data;
    const tabJson = JSON.stringify(raw.tab);
    // Skip the echo right after a song opens (hydrate set raw / bumped epoch),
    // and the first raw this observer sees when it mounts on an open song.
    if (seededEpoch.current !== songOpenEpoch || savedTab.current === null) {
      seededEpoch.current = songOpenEpoch;
      savedTab.current = tabJson;
      return;
    }
    if (tabJson === savedTab.current) return;
    const id = currentSongId;
    const timer = setTimeout(() => {
      savedTab.current = tabJson;
      const score = compile(raw);
      const endBeat = scoreEndBeat(score);
      saveTab(id, {
        ...raw.tab,
        durationSec: beatToSeconds(score, endBeat),
        endBeat,
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawValue, currentSongId, songOpenEpoch, saveTab]);

  return null;
}
