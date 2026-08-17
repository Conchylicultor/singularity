import { defineBoundaries, zone, allow } from "./core/config";

export default defineBoundaries({
  zones: [zone("plugin", { match: "plugins", discover: "plugin-tree" })],

  // Layer 1: Runtime isolation (default-deny — unlisted = blocked)
  runtimes: {
    // `data-dirs` is absent from `web` and `core` ON PURPOSE. A data-dir
    // declaration reaches `paths/core`, which calls `homedir()` at module scope
    // — a single such edge into the web bundle breaks it at module eval. `core`
    // is web-importable, so granting `core -> data-dirs` would open that path
    // transitively; the browser names a directory through the `paths/display`
    // string literals instead.
    //
    // KNOW WHAT THIS DOES AND DOES NOT CATCH. The evaluator only extracts
    // specifiers matching `ZONE_SPECIFIER_RE` (`boundaries/core/check.ts`) and
    // short-circuits when source and target zones are equal, so it polices the
    // CROSS-PLUGIN alias form (`@plugins/other/data-dirs` from a `core/` file)
    // and not a plugin reaching its own `../data-dirs` relatively. The
    // cross-plugin form is the one that matters — it is how a genuinely
    // web-reachable `core/` would acquire this edge — and the same-plugin
    // relative form was never policed for `paths/core` either (`checks/core`
    // imports it directly today). Do not read this row as airtight.
    web: ["web", "core", "shared"],
    server: ["server", "core", "shared", "data-dirs"],
    central: ["central", "core", "shared", "data-dirs"],
    core: ["core"],
    shared: ["shared", "core", "data-dirs"],
    // Declarations of the directories a plugin owns under the data root. A leaf
    // runtime: it reads `paths/core` to build its paths and nothing else, so it
    // can be imported cross-plugin (two plugins sharing one directory — e.g.
    // pgbouncer writing into the embedded cluster's dir — import the single
    // declaration rather than each joining the root).
    "data-dirs": ["data-dirs", "core"],
    // e2e/ — Playwright scripts that drive the deployed app from OUTSIDE it.
    // They may use other plugins' `core` types and other plugins' `e2e` flow
    // helpers (the shared harness, the "open a blank Pages doc" flow), and are
    // denied `web`/`server`/`shared`: an end-to-end test asserts on the running
    // app through the browser, never by importing the code under test.
    e2e: ["e2e", "core"],
  },

  runtimeExceptions: [
    "plugin.infra.secrets.central -> plugin.infra.paths.server",
  ],

  // Layer 2: Zone DAG (first-match, default-deny)
  edges: [
    // packages/ umbrella children are utility code, globally accessible
    allow("** -> plugin.plugin-meta.plugin-tree"),
    allow("** -> plugin.packages.retry"),
    allow("** -> plugin.packages.semaphore"),

    // Config origin codegen and check import config_v2 core (hash, types) and barrel-import
    allow("tooling -> plugin.config_v2"),
    allow("tooling -> plugin.config_v2.store"),
    allow("tooling -> plugin.plugin-meta.barrel-import"),

    // Plugins can import other plugins
    allow("plugin.** -> plugin.**"),
  ],

  // Composition roots that wire plugins together — exempt from boundary checks
  exclude: [
    "plugins/framework/plugins/web-sdk/core/web.generated.ts",
    "plugins/framework/plugins/web-core/web/App.tsx",
    "plugins/framework/plugins/server-core/core/server.generated.ts",
    "plugins/framework/plugins/server-core/bin/index.ts",
    "plugins/framework/plugins/central-core/core/central.generated.ts",
    "plugins/framework/plugins/central-core/bin/index.ts",
    "plugins/framework/plugins/tooling/plugins/checks/core/check.generated.ts",
    "plugins/framework/plugins/tooling/plugins/lint/core/lint.generated.ts",
    "eslint.config.ts",
  ],
});
