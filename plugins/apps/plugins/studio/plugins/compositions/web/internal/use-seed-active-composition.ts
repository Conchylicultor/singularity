import { useEffect, useRef } from "react";
import {
  useManifestItems,
  setActiveComposition,
  setCompareComposition,
} from "@plugins/plugin-meta/plugins/composition/web";
import { manifestItemToManifest } from "@plugins/plugin-meta/plugins/composition/core";

/**
 * Drive the module-level active-composition store from the URL. Seeds the store with the
 * manifest named by the pane's `:id` param, exactly ONCE per id.
 *
 * The `seededFor` ref — not the dep array — is the guard. `item` is a fresh object on every
 * `manifests` config write, so an `[item]`-keyed effect would re-fire after each save() and
 * CLOBBER the in-progress draft `updateActiveDraft` is building. `item` is still read (not
 * just `id`) because config may not have settled on a deep link's first paint; the ref is
 * stamped only once a real item exists.
 *
 * There is deliberately NO cleanup. clearActive() on unmount would be a correctness bug:
 * Studio sidebar nav uses mode:"root", which unmounts this pane, and explorer/membership's
 * tint reads useActiveComposition() from this same store. Pick a composition here, then go
 * look at the Explorer — the store MUST outlive the pane. clearActive stays a user action.
 */
export function useSeedActiveComposition(id: string): void {
  const items = useManifestItems();
  const item = items.find((it) => it.id === id);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!item || seededFor.current === id) return;
    seededFor.current = id;
    setActiveComposition(structuredClone(manifestItemToManifest(item)));
    setCompareComposition(null);
  }, [id, item]);
}
