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
const ALLOWED_PLUGIN_IMPORT_RE = /@plugins\/packages\/|@plugins\/plugin-meta\/plugins\/plugin-tree\/|@plugins\/[^'"]*\/core\b/;

// Only plugins/ itself and the composition roots may import from plugins/
const ALLOWED_DIRS = ["plugins/"];
const COMPOSITION_ROOTS = [
  "plugins/framework/plugins/web-core/web/plugins.ts",
  "plugins/framework/plugins/web-core/web/plugins.generated.ts",
  "plugins/framework/plugins/server-core/bin/plugins.ts",
  "plugins/framework/plugins/server-core/bin/plugins.generated.ts",
  "plugins/framework/plugins/central-core/bin/plugins.ts",
  "plugins/framework/plugins/central-core/bin/plugins.generated.ts",
  "plugins/framework/plugins/web-core/web/App.tsx",
];

export const noPluginImportsInCore: Check = {
  id: "no-plugin-imports-in-core",
  description:
    "Non-plugin code may only import from `@plugins/*/core` (public API). Other plugin runtimes (web, server, shared) are off-limits.",
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
      hint: "Non-plugin code may import from `@plugins/<name>/core` (public API) but not from other plugin runtimes. Move shared types to the plugin's core/ barrel.",
    };
  },
};
