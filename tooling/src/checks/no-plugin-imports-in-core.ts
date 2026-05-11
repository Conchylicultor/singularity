import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Detects import/require/export statements whose specifier resolves into the plugins layer
const PLUGIN_IMPORT_RE =
  /(?:from|require|export\s+\*\s+from)\s+['"][^'"]*(?:\/plugins\/|@singularity\/plugin-|@plugins\/)/;

// Imports from @plugins/packages/ are allowed everywhere — the packages umbrella
// is pure utility code (equivalent to the old packages/ directory), not plugin code.
const ALLOWED_PLUGIN_IMPORT_RE = /@plugins\/packages\/|@plugins\/plugin-meta\/plugins\/plugin-tree\//;

// Only plugins/ itself and the composition roots may import from plugins/
const ALLOWED_DIRS = ["plugins/"];
const COMPOSITION_ROOTS = [
  "web/src/plugins.ts",
  "web/src/plugins.generated.ts",
  "server/src/plugins.ts",
  "server/src/plugins.generated.ts",
  "central/src/plugins.ts",
  "central/src/plugins.generated.ts",
  "web/src/App.tsx",
];

export const noPluginImportsInCore: Check = {
  id: "no-plugin-imports-in-core",
  description:
    "Only `plugins/` may import from other plugins — `server/`, `plugin-core/`, `web/`, `cli/`, etc. must never import from `plugins/`",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-En",
        "--",
        `(from|require|export \\* from) ['"][^'""]*(\/plugins\/|@singularity\/plugin-|@plugins\/)`,
        "*.ts",
        "*.tsx",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out
      .split("\n")
      .filter((line) => !ALLOWED_DIRS.some((dir) => line.startsWith(dir)))
      .filter((line) => !COMPOSITION_ROOTS.some((f) => line.startsWith(f + ":")))
      .filter((line) => PLUGIN_IMPORT_RE.test(line))
      .filter((line) => !ALLOWED_PLUGIN_IMPORT_RE.test(line));

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `plugin imports found outside plugins/ (${offenders.length} occurrence(s)):\n    ${offenders.join("\n    ")}`,
      hint: "Move shared types/values to plugin-core or a shared package. Plugins depend on core — core must never depend on plugins.",
    };
  },
};
