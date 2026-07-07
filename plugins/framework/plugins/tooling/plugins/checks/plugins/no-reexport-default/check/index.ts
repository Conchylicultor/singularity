import { existsSync, readFileSync } from "fs";
import { join, relative } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const RUNTIMES = ["web", "server", "central"] as const;

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const INLINE_DEFAULT_RE = /(^|\n)\s*export\s+default\s+\{/;
const REEXPORT_DEFAULT_RE = /(^|\n)\s*export\s*\{[^}]*\bdefault\b[^}]*\}\s*from\b/;
const ANY_DEFAULT_RE =
  /(^|\n)\s*export\s+default\b|export\s*\{[^}]*\bdefault\b[^}]*\}/;

const check: Check = {
  id: "no-reexport-default",
  description:
    "Every plugin barrel (web|server|central)/index.ts must use inline `export default { ... } satisfies *PluginDefinition` — no re-exports, no missing defaults",
  async run() {
    const root = await getRoot();
    const pluginsRoot = join(root, "plugins");
    if (!existsSync(pluginsRoot)) return { ok: true };

    const tree = await buildPluginTree(pluginsRoot, { skipBarrelImport: true });
    const missing: string[] = [];
    const reexported: string[] = [];

    for (const node of tree.byDir.values()) {
      for (const runtime of RUNTIMES) {
        const barrel = join(node.dir, runtime, "index.ts");
        if (!existsSync(barrel)) continue;

        // Fully mask comments, regex literals, AND string interiors: the three
        // regexes only detect code constructs (`export default`, `export { …
        // default … } from`), never read a string value — so masking strings
        // closes the string-embedded false-positive (a default-export shape
        // mentioned in a comment or string can't be mistaken for a real one).
        const src = maskSource(readFileSync(barrel, "utf8"));
        const rel = relative(root, barrel);

        if (!ANY_DEFAULT_RE.test(src)) {
          missing.push(rel);
        } else if (REEXPORT_DEFAULT_RE.test(src) && !INLINE_DEFAULT_RE.test(src)) {
          reexported.push(rel);
        }
      }
    }

    const problems = [
      ...missing.map((f) => `  missing default export: ${f}`),
      ...reexported.map((f) => `  re-exported default: ${f}`),
    ];

    if (problems.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${problems.length} barrel(s) violate inline default export rule:\n${problems.join("\n")}`,
      hint: "Add `export default { description } satisfies ServerPluginDefinition` (or PluginDefinition / CentralPluginDefinition) inline in the barrel. (`id` is derived from the plugin path — never authored; there is no `name` field.)",
    };
  },
};

export default check;
