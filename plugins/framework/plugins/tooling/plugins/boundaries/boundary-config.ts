import { defineBoundaries, zone, allow } from "./core/config";

export default defineBoundaries({
  zones: [
    zone("cli", { match: "cli" }),
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

    // Plugins can import other plugins
    allow("plugin.** -> plugin.**"),
  ],

  // Composition roots that wire plugins together — exempt from boundary checks
  exclude: [
    "plugins/framework/plugins/web-core/web/plugins.ts",
    "plugins/framework/plugins/web-core/web/plugins.generated.ts",
    "plugins/framework/plugins/web-core/web/App.tsx",
    "plugins/framework/plugins/server-core/bin/plugins.ts",
    "plugins/framework/plugins/server-core/bin/plugins.generated.ts",
    "plugins/framework/plugins/server-core/bin/index.ts",
    "plugins/framework/plugins/central-core/bin/plugins.ts",
    "plugins/framework/plugins/central-core/bin/plugins.generated.ts",
    "plugins/framework/plugins/central-core/bin/index.ts",
    "eslint.config.ts",
  ],
});
