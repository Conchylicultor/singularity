import { Resource } from "@plugins/framework/plugins/server-core/core";

// The preloaded resource keys, read GENERICALLY from the shared collection —
// never by naming a specific resource (collection-consumer separation). A resource
// opts in on its shared client descriptor (`preload: "boot"` or
// `"boot-and-keep"` — both preload); `Resource.Declare` derives the flag from the
// resource, so it appears here.
export function preloadedKeys(): string[] {
  return Resource.Declare.getContributions()
    .filter((c) => c.preload !== undefined)
    .map((c) => c.key);
}
