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
 *  derive from this; never hardcode the list elsewhere.
 *
 *  `e2e` holds a plugin's Playwright scripts. It is a first-class runtime because
 *  its `e2e/index.ts` barrel is genuine cross-plugin API (one plugin's e2e script
 *  imports another's domain flow helpers) and it carries its own isolation policy
 *  — `e2e` may reach `core` and other `e2e` barrels, never `web`/`server`, since
 *  an end-to-end test drives the deployed app through the browser rather than
 *  importing the code under test. */
export const RUNTIME_FOLDERS = ["web", "server", "central", "core", "shared", "e2e"] as const;
export type RuntimeFolder = (typeof RUNTIME_FOLDERS)[number];
