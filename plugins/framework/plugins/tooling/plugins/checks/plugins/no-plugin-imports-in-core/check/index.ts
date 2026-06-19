import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { compositionRoots } from "@plugins/framework/plugins/tooling/plugins/boundaries/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const PLUGIN_IMPORT_RE =
  /(?:from|require|export\s+\*\s+from)\s+['"][^'"]*(?:\/plugins\/|@singularity\/plugin-|@plugins\/)/;

const ALLOWED_PLUGIN_IMPORT_RE = /@plugins\/packages\/|@plugins\/plugin-meta\/plugins\/plugin-tree\/|@plugins\/[^'"]*\/core\b/;

const ALLOWED_DIRS = ["plugins/"];
// Composition roots that legitimately wire plugins together are exempt. The
// single source of truth is boundary-config.ts's `exclude` list (same set the
// boundary checker skips) — never maintain a parallel copy here.
const COMPOSITION_ROOTS = compositionRoots;

const check: Check = {
  id: "no-plugin-imports-in-core",
  description:
    "Non-plugin code may only import from `@plugins/*/core` (public API). Other plugin runtimes (web, server, shared) are off-limits.",
  async run() {
    const root = await getRoot();
    // git grep narrows candidate files (same broad import shape as before); then
    // grepCode re-scans masked source with PLUGIN_IMPORT_RE (the source of truth).
    // strings: false — the offending value lives in the import path string.
    const matches = await grepCode({
      root,
      pattern: PLUGIN_IMPORT_RE,
      grepArg: `(from|require|export \\* from) ['"][^'""]*(\/plugins\/|@singularity\/plugin-|@plugins\/)`,
      maskStrings: false,
    });

    const offenders = matches
      .map((m) => `${m.path}:${m.line}:${m.text}`)
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

export default check;
