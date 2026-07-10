import { useEffect, useRef } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { UgTabSchema } from "../../core";
import { compile } from "../compile";
import { UG_SOURCE_ID } from "../constants";
import { useSaveUltimateGuitar } from "../actions";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Headless, always-mounted persistence observer for the Ultimate Guitar source,
 * contributed to `Sonata.Effect`. Treats the context (`rawById`) as the source of
 * truth and debounce-persists a full `UgTab` snapshot (plus derived duration / end
 * beat) to the server whenever the raw changes — never on the fresh load that
 * opening a song triggers (which bumps `songOpenEpoch`), only on edits.
 *
 * This lives OUTSIDE the editor section deliberately: a section body is unmounted
 * while its card is collapsed, so an in-body debounced save would silently drop a
 * pending edit (the effect cleanup clears the timer) and stop observing the moment
 * the card is collapsed mid-debounce — data loss. A `Sonata.Effect` is mounted for
 * the whole open song regardless of card state, so no edit is ever lost. Its
 * internal `rawValue === undefined` guard (and the `UgTabSchema` parse) make it a
 * no-op for songs of any other source.
 *
 * The `PUT` persists `title: songName` (the one place a UG song's title is
 * written); the toolbar title re-renders off the library's `songsResource`, not an
 * in-memory mirror.
 */
export function UltimateGuitarPersistObserver() {
  const { sourceRaw, currentSongId, songOpenEpoch } = useSonata();
  const saveTab = useSaveUltimateGuitar();

  const rawValue = sourceRaw(UG_SOURCE_ID);

  const seededEpoch = useRef(songOpenEpoch);
  useEffect(() => {
    if (!currentSongId || rawValue === undefined) return;
    // Skip the echo right after a song opens (hydrate set raw / bumped epoch).
    if (seededEpoch.current !== songOpenEpoch) {
      seededEpoch.current = songOpenEpoch;
      return;
    }
    const parsed = UgTabSchema.safeParse(rawValue);
    if (!parsed.success) return;
    const id = currentSongId;
    const tab = parsed.data;
    const timer = setTimeout(() => {
      const score = compile(tab);
      const endBeat = scoreEndBeat(score);
      saveTab(id, {
        ...tab,
        durationSec: beatToSeconds(score, endBeat),
        endBeat,
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawValue, currentSongId, songOpenEpoch, saveTab]);

  return null;
}
