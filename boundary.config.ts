import { defineBoundaries, zone, allow } from "./tooling/src/boundaries/config";

export default defineBoundaries({
  zones: [
    zone("core", { match: "plugin-core" }),
    zone("server", { match: "server" }),
    zone("web", { match: "web" }),
    zone("central", { match: "central" }),
    zone("cli", { match: "cli" }),
    zone("tooling", { match: "tooling" }),
    zone("plugin", { match: "plugins", discover: "plugin-tree" }),
  ],

  // Layer 1: Runtime isolation (default-deny — unlisted = blocked)
  runtimes: {
    web: ["web", "core", "shared"],
    server: ["server", "core", "shared"],
    central: ["central", "core", "shared"],
    core: ["core"],
    shared: ["shared", "core"],
  },

  runtimeExceptions: [
    "plugin.infra.secrets.central -> plugin.infra.paths.server",
  ],

  // Layer 2: Zone DAG (first-match, default-deny)
  edges: [
    // packages/ umbrella children are utility code, globally accessible
    allow("** -> plugin.plugin-meta.plugin-tree"),
    allow("** -> plugin.packages.retry"),

    // Top-level packages can import core
    allow("server  -> core"),
    allow("web     -> core"),
    allow("central -> core"),
    allow("cli     -> core"),
    allow("tooling -> core"),

    // Plugins can import core and server/central frameworks
    allow("plugin.** -> core"),
    allow("plugin.** -> server"),
    allow("plugin.** -> central"),

    // Server framework can import plugin public API (core runtime only — enforced by runtime isolation + R10)
    allow("server -> plugin.**"),

    // Plugins can import other plugins
    allow("plugin.** -> plugin.**"),
  ],

  // Composition roots that wire plugins together — exempt from boundary checks
  exclude: [
    "web/src/plugins.ts",
    "web/src/plugins.generated.ts",
    "web/src/App.tsx",
    "server/src/plugins.ts",
    "server/src/plugins.generated.ts",
    "server/src/index.ts",
    "central/src/plugins.ts",
    "central/src/plugins.generated.ts",
    "central/src/index.ts",
    "boundary.config.ts",
    "eslint.config.ts",
  ],
});
