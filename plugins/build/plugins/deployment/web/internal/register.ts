// Eagerly pull the deployment core module into the web import graph so its
// ResourceDescriptor self-registers (each `resourceDescriptor(...)` call registers
// into the live-state key→descriptor map on module evaluation).
//
// `build.deployment` is boot-critical (declared server-side in ../../server).
// boot-snapshot resolves every boot-critical key to its client descriptor via
// `resourceDescriptorByKey` BEFORE first paint, so the descriptor module must sit
// in the EAGER web import graph rather than behind a lazy boundary.
//
// Anchored here, in the plugin that OWNS the resource, rather than relying on
// whichever consumer happens to import core — the Build button's chain and the
// stale-tab reload dot both read it, and neither should be load-bearing for the
// descriptor existing.
import "@plugins/build/plugins/deployment/core";
