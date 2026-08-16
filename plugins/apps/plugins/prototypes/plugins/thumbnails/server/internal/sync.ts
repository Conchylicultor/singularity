import { listPrototypeMetas } from "@plugins/apps/plugins/prototypes/plugins/files/server";
import type { ThumbnailState } from "../../core";
import { hasThumbnail } from "./cache";
import { decideThumbnail } from "./decide";
import { fingerprintPrototype } from "./fingerprint";
import { renderThumbnailJob } from "./jobs";
import { readThumbnailState, replaceThumbnailStates } from "./state";

/**
 * Reconcile every prototype's thumbnail state against the filesystem, and
 * enqueue whatever is missing.
 *
 * This is the only place that decides what needs rendering, and it is driven by
 * the fingerprint alone — so it is idempotent, and running it at boot is the
 * same act as running it on a file change. A prototype that vanished loses its
 * state by construction (the map is rebuilt, not patched).
 */
export async function syncThumbnails(): Promise<void> {
  const metas = await listPrototypeMetas();

  const next = new Map<string, ThumbnailState>();
  const pending: { name: string; key: string }[] = [];

  for (const meta of metas) {
    let key: string;
    try {
      key = await fingerprintPrototype(meta.name);
    } catch (err) {
      // Deleted between the listing and the hash. A benign race: the watcher
      // fires again for the removal, and this prototype simply has no state
      // until then.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }

    const decision = decideThumbnail(
      key,
      await hasThumbnail(key),
      readThumbnailState(meta.name),
    );
    next.set(meta.name, decision.state);
    if (decision.render) pending.push({ name: meta.name, key });
  }

  replaceThumbnailStates(next);

  // Enqueue after the push, so an open gallery shows `rendering` immediately
  // rather than after the queue round-trip.
  for (const item of pending) {
    await renderThumbnailJob.enqueue(item);
  }
}
