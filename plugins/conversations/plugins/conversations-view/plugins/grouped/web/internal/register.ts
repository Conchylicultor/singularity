// Eagerly pull the grouped core module into the web import graph so its
// ResourceDescriptor self-registers (the `resourceDescriptor("conversation-groups",
// …)` call registers into the live-state key→descriptor map on module evaluation).
//
// `conversation-groups` is boot-critical (declared in ../../core/internal/schemas).
// boot-snapshot resolves every boot-critical key to its client descriptor BEFORE
// first paint, so the descriptor module must sit in the EAGER web import graph, not
// behind a lazy boundary.
//
// The grouped plugin ships no boot-mounted UI of its own — the DataView Grouped tab
// (data-view/plugins/grouped) is the (lazy) UI consumer. Anchoring the eager
// registration here ties it to the plugin that OWNS the resource rather than to
// whichever consumer happens to import core.
import "@plugins/conversations/plugins/conversations-view/plugins/grouped/core";
