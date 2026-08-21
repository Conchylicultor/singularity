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
    // provision/ — install-time provisioning steps (postinstall). A step may
    // read `core` and other plugins' `provision` barrels; NOTHING may read a
    // `provision` barrel back, because provisioning DOWNLOADS AND INSTALLS —
    // work no request path may ever start. That is not hypothetical: the
    // chromium installer used to sit in `browser-fetch/core`, and a thumbnail
    // render called it, so a missing binary blocked a backend's event loop for
    // a ~150 MB download (see that plugin's `provision/index.ts`).
    //
    // Listing it here does a second thing: `checkRuntime` returns true when the
    // source runtime is null, and every `provision/` file resolved to null
    // before this row — so a provisioning step could import `@plugins/x/web`
    // and nothing would say a word. Now it is policed in both directions.
    //
    // `runtimeNames` derives from these keys, so `@plugins/<p>/provision` also
    // becomes a legal cross-plugin barrel (plugin-boundaries R4) — which is how
    // two plugins share ONE installer instead of copying it. Its R6 DAG edges
    // are tagged `provision` and fall outside the web/server/central cycle
    // graphs; a provisioning graph is a handful of leaf steps, not a lattice.
    provision: ["provision", "core"],
    // e2e/ — Playwright scripts that drive the deployed app from OUTSIDE it.
    // They may use other plugins' `core` types and other plugins' `e2e` flow
    // helpers (the shared harness, the "open a blank Pages doc" flow), and are
    // denied `web`/`server`/`shared`: an end-to-end test asserts on the running
    // app through the browser, never by importing the code under test.
    //
    // `data-dirs` is granted for the same reason `server` has it: an e2e script
    // is a Node process on the host, and some of them assert on a file the app
    // wrote under the data root (the config override a filter edit persists).
    // Without the declaration the only way to name that file is to join the
    // root by hand — an undeclared path, spelled a second time, which is the
    // whole failure mode the registry exists to end. Importing a declaration
    // reads a path; it does not import the code under test.
    e2e: ["e2e", "core", "data-dirs"],
    // cli/ — a plugin's `./singularity <verb>` contribution. A CLI command is a
    // host process like a server, so it may reach `core`, its own `shared`,
    // declared `data-dirs`, other plugins' `server` barrels, and other plugins'
    // `cli` barrels. That last edge is the point: shared CLI machinery lives in
    // a `cli/` barrel rather than being copied, exactly as `provision` shares one
    // chromium installer and `tooling/e2e-harness` shares one Playwright harness.
    // `runtimeNames` derives from these keys, so `@plugins/<p>/cli` becomes a
    // legal cross-plugin barrel with no other edit.
    //
    // `web` is denied: a terminal verb that reached a browser barrel would drag
    // React into the CLI process, and there is no such thing as a CLI rendering
    // a component.
    //
    // THIS ROW DOES NOT CARRY THE EAGER-WEIGHT RULE, and must not be read as
    // doing so. Every plugin's `cli/index.ts` is loaded on EVERY `./singularity`
    // invocation (commander needs names and flags before it parses), while the
    // command's implementation must not be. That constraint is a property of one
    // file, not of the runtime, so it is enforced by
    // `cli:command-declarations-light` — which measures each `cli/index.ts`'s
    // STATIC closure only. An implementation sitting next to the declaration is
    // free to reach `server`; the declaration reaching it is the error.
    cli: ["cli", "core", "shared", "data-dirs", "server"],
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
