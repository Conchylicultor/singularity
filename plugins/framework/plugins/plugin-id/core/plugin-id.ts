/** A plugin's canonical hierarchy id, dot-separated, e.g. "conversations.conversation-view". */
export type PluginId = string & { readonly __brand: "PluginId" };

/** Cast a raw string from a serialization boundary (DB, URL, JSON, codegen literal) to PluginId. */
export const asPluginId = (s: string): PluginId => s as PluginId;

/** Slash form for the config store path: "conversations/conversation-view". NOT the fs path. */
export const asPath = (id: PluginId): string => id.split(".").join("/");

/** Real filesystem path under plugins/: "conversations/plugins/conversation-view". */
export const asFsPath = (id: PluginId): string => id.split(".").join("/plugins/");

/** Segments for breadcrumbs / last-segment matching. */
export const pluginIdSegments = (id: PluginId): string[] => id.split(".");

/** The plugin source/barrel runtime folders — the isolation + bundling vocabulary
 *  and single source of truth. boundary-config keys and every per-runtime grouping
 *  derive from this; never hardcode the list elsewhere. */
export const RUNTIME_FOLDERS = ["web", "server", "central", "core", "shared"] as const;
export type RuntimeFolder = (typeof RUNTIME_FOLDERS)[number];
