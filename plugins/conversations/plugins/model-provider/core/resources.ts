import { liveValue } from "@plugins/network/plugins/live/core";
import { ModelCatalogSchema } from "./catalog";

/**
 * The model catalog, pushed whole whenever it changes — a new version
 * discovered, a family's current version moving, a version retired. Served by
 * `model-provider/catalog` from the host-global `catalog.json` it watches, so
 * every backend on the machine sees main's discovery live.
 *
 * `boot-and-keep`: every model picker, hint and label reads it, often in
 * surfaces that mount late, and none of them may render a stand-in for it.
 */
export const modelCatalog = liveValue("model-provider.catalog", {
  schema: ModelCatalogSchema,
  preload: "boot-and-keep",
});
