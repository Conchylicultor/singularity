import { defineBoundaries, zone, allow } from "./tooling/src/boundaries/config";

export default defineBoundaries({
  zones: [
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

    // Web entry point and tooling can import the web-sdk plugin (PluginProvider, PluginDefinition, etc.)
    allow("web     -> plugin.framework.web-sdk"),
    allow("tooling -> plugin.framework.web-sdk"),

    // Plugins can import central framework
    allow("plugin.** -> central"),

    // Plugins can import other plugins
    allow("plugin.** -> plugin.**"),
  ],

  // Composition roots that wire plugins together — exempt from boundary checks
  exclude: [
    "web/src/plugins.ts",
    "web/src/plugins.generated.ts",
    "web/src/App.tsx",
    "plugins/framework/plugins/server-core/bin/plugins.ts",
    "plugins/framework/plugins/server-core/bin/plugins.generated.ts",
    "plugins/framework/plugins/server-core/bin/index.ts",
    "central/bin/plugins.ts",
    "central/bin/plugins.generated.ts",
    "central/bin/index.ts",
    "boundary.config.ts",
    "eslint.config.ts",
  ],
});
