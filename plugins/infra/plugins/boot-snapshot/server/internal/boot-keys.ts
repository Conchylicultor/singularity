import { Resource } from "@plugins/framework/plugins/server-core/core";

// The boot-critical resource keys, read GENERICALLY from the shared collection —
// never by naming a specific resource (collection-consumer separation). A
// resource opts in at its declaration site with `Resource.Declare(r, { bootCritical: true })`.
export function bootCriticalKeys(): string[] {
  return Resource.Declare.getContributions()
    .filter((c) => c.bootCritical)
    .map((c) => c.key);
}
