import { useEffect } from "react";
import {
  setKeyAutoDetect,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { keyAutoDetectResource } from "../../shared/resources";

/**
 * Headless: syncs the open song's persisted key-auto-detect setting into the
 * shell's module-level store, which the score pipeline reads to decide whether
 * to override the authored key with inference. Mounted via `Sonata.Effect`
 * (always inside the provider) so it can read context.
 *
 * The store is a global singleton (one Sonata app mounts at a time), so this is
 * the sole owner of "which song's setting is in force": it writes the current
 * song's value, and writes `false` when no song is open — otherwise the previous
 * song's override would leak into the next. It waits for the resource to resolve
 * before writing, so a still-loading rollup never collapses to a false "off".
 */
export function KeyModeObserver() {
  const { currentSongId } = useSonata();
  const result = useResource(keyAutoDetectResource);

  useEffect(() => {
    if (result.pending) return; // wait for truth before touching the store
    const enabled = currentSongId
      ? (result.data.find((r) => r.songId === currentSongId)?.enabled ?? false)
      : false;
    setKeyAutoDetect(enabled);
  }, [result, currentSongId]);

  return null;
}
