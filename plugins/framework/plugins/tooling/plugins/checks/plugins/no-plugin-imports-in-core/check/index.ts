import { grepImports } from "@plugins/framework/plugins/tooling/plugins/checks/core";
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

// A plugin-runtime specifier: contains `/plugins/`, or starts with the
// workspace-name (`@singularity/plugin-`) or `@plugins/` alias forms.
const PLUGIN_IMPORT_SPEC_RE = /(?:\/plugins\/|^@singularity\/plugin-|^@plugins\/)/;

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
    // git grep narrows candidate files (broad import shape); then grepImports
    // structurally scans each via findImports and keeps only plugin-runtime
    // specifiers. String-safe by construction — an import written inside a
    // string/fixture can never match, so no `maskStrings` knob is needed.
    const matches = await grepImports({
      root,
      grepArg: `(from|require|export \\* from) ['"][^'""]*(\/plugins\/|@singularity\/plugin-|@plugins\/)`,
      filter: (spec) => PLUGIN_IMPORT_SPEC_RE.test(spec),
    });

    const offenders = matches
      // ALLOWED_DIRS / COMPOSITION_ROOTS are path predicates; ALLOWED_PLUGIN_IMPORT_RE
      // is a specifier predicate (matches @plugins/…/core and the exempt paths).
      .filter((m) => !ALLOWED_DIRS.some((dir) => m.path.startsWith(dir)))
      .filter((m) => !COMPOSITION_ROOTS.some((f) => m.path === f))
      .filter((m) => !ALLOWED_PLUGIN_IMPORT_RE.test(m.specifier))
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `plugin imports found outside plugins/ (${offenders.length} occurrence(s)):\n    ${offenders.join("\n    ")}`,
      hint: "Non-plugin code may import from `@plugins/<name>/core` (public API) but not from other plugin runtimes. Move shared types to the plugin's core/ barrel.",
    };
  },
};

export default check;
