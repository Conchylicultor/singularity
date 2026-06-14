import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/web";

// Module-level registry of param-less GLOBAL descriptors to hydrate from the
// boot snapshot. The boot task runs BEFORE PluginProvider mounts (see web-core
// App.tsx `runBootTasks`), so it can't read contributions through React's
// `useContributions()`. Instead each `BootSnapshot.Hydrate({ descriptor })`
// contribution self-registers here when the owning plugin's `contributions`
// array is constructed at load time — which `loadPlugins` resolves before the
// boot task runs. The slot still exists as a first-class, documented
// contribution; this registry is just its boot-time (non-React) read side.
const descriptors = new Map<string, ResourceDescriptor<unknown>>();

function register(descriptor: ResourceDescriptor<unknown>): void {
  descriptors.set(descriptor.key, descriptor);
}

export function registeredDescriptors(): ResourceDescriptor<unknown>[] {
  return [...descriptors.values()];
}

export const BootSnapshot = {
  // Register a param-less global resource descriptor for boot-snapshot
  // hydration. Pair with the server-side `Resource.Declare(r, { bootCritical: true })`
  // opt-in — the snapshot ships keys, this maps each key back to its client
  // descriptor for `hydrateResource`.
  Hydrate: (() => {
    const slot = defineSlot<{ descriptor: ResourceDescriptor<unknown> }>(
      "boot-snapshot.hydrate",
    );
    // Wrap the factory so constructing the contribution also self-registers the
    // descriptor into the boot-time read registry.
    const factory = ((props: { descriptor: ResourceDescriptor<unknown> }) => {
      register(props.descriptor);
      return slot(props);
    }) as typeof slot;
    factory.id = slot.id;
    factory.useContributions = slot.useContributions;
    return factory;
  })(),
};
