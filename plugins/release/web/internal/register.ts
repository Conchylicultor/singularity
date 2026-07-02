// Eagerly pull the release core module into the web import graph so its
// ResourceDescriptors self-register (each `resourceDescriptor(...)` call registers
// into the live-state key→descriptor map on module evaluation).
//
// `release.history` and `release.previews` are boot-critical (declared server-side
// in ../server). boot-snapshot resolves every boot-critical key to its client
// descriptor via `resourceDescriptorByKey` BEFORE first paint — so the descriptor
// module must sit in the EAGER web import graph, not behind a lazy boundary.
//
// The release engine ships no boot-mounted UI: its only consumer, the Studio
// release pane, lazy-loads @plugins/release/core (its pane bodies mount on demand).
// Without this eager import the descriptors would register too late, boot-snapshot
// could not hydrate release.* and would file a crash report every boot. Anchoring
// the eager registration here ties it to the plugin that OWNS the resources rather
// than to whichever consumer happens to import core.
import "@plugins/release/core";
