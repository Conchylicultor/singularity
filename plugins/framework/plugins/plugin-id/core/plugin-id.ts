/** A plugin's canonical hierarchy id, dot-separated, e.g. "conversations.conversation-view". */
export type PluginId = string & { readonly __brand: "PluginId" };

/** Cast a raw string from a serialization boundary (DB, URL, JSON, codegen literal) to PluginId. */
export const asPluginId = (s: string): PluginId => s as PluginId;

/** Slash form for the config store path: "conversations/conversation-view". NOT the fs path. */
export const asPath = (id: PluginId): string => id.split(".").join("/");

/** Real filesystem path under plugins/: "conversations/plugins/conversation-view". */
export const asFsPath = (id: PluginId): string =>
  id.split(".").join("/plugins/");

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
 *  importing the code under test.
 *
 *  `provision` holds a plugin's install-time provisioning step (postinstall).
 *  Same two reasons: its `provision/index.ts` is genuine cross-plugin API (the
 *  e2e harness and `browser-fetch` share ONE chromium installer rather than
 *  copying it), and it carries its own isolation policy — a provisioning step
 *  may reach `core` and other `provision` barrels, and NOTHING may reach back
 *  into it, because provisioning downloads and installs: work no request path
 *  may ever start. */
export const RUNTIME_FOLDERS = [
  "web",
  "server",
  "central",
  "core",
  "shared",
  "e2e",
  "provision",
  "data-dirs",
  "cli",
] as const;
export type RuntimeFolder = (typeof RUNTIME_FOLDERS)[number];

/** Whether a runtime folder's facts belong in the GENERATED plugin docs
 *  (`docs/plugins-details.md` and each plugin's `CLAUDE.md` reference block).
 *
 *  Doc visibility is a property of the runtime, so it is declared here beside the
 *  runtime set — the doc renderer consumes the derived set below and never names a
 *  folder itself. `Record<RuntimeFolder, boolean>` is exhaustive by construction:
 *  adding a runtime folder is a type error until it declares its doc policy.
 *
 *  `e2e` is omitted: an e2e barrel is real cross-plugin API, but only to other e2e
 *  scripts — no `web`/`server`/`core` caller can reach it, so its `Uses`/`Exports`
 *  facts spend every agent's context on a surface none of them can depend on. */
const RUNTIME_FOLDER_DOCUMENTED: Record<RuntimeFolder, boolean> = {
  web: true,
  server: true,
  central: true,
  core: true,
  shared: true,
  e2e: false,
  // `provision` is undocumented for the same reason as `e2e`: the barrel is
  // real cross-plugin API, but only to other provisioning steps — no
  // `web`/`server`/`core` caller may import it (that is the whole point), so
  // its `Uses`/`Exports` facts would spend every agent's context on a surface
  // none of them can depend on.
  provision: false,
  // `data-dirs` holds a plugin's declarations of the directories it owns under
  // the singularity data root. Undocumented not because the facts are private —
  // the folder IS a legal cross-plugin barrel, so two plugins sharing one
  // directory import a single declaration — but because the generated reference
  // is the wrong reader for them. "Who owns this directory, and may I delete
  // it?" is answered against the LIVE filesystem by
  // `paths:no-undeclared-data-dirs` and by `getDataDirs()`, which a stale doc
  // block cannot do; duplicating the set into every CLAUDE.md would spend
  // context on a second, drift-prone copy of a registry that is already
  // enumerable at runtime.
  "data-dirs": false,
  // `cli` is the one non-web/server runtime that IS documented. Unlike `e2e` and
  // `provision`, whose barrels only other e2e scripts / provisioning steps can
  // reach, a `cli/` folder's headline fact is user-facing: this plugin owns
  // `./singularity <verb>`. That is precisely what an agent needs to read out of
  // the generated reference before adding a second verb for the same job, and it
  // is not answerable from anywhere else — a command name is not a filename.
  cli: true,
};

/** Runtime folders the generated plugin docs omit — the doc renderer's generic
 *  filter over a fact's folder key (non-runtime groups are never members). */
export const UNDOCUMENTED_RUNTIME_FOLDERS: ReadonlySet<string> = new Set(
  RUNTIME_FOLDERS.filter((rt) => !RUNTIME_FOLDER_DOCUMENTED[rt]),
);
