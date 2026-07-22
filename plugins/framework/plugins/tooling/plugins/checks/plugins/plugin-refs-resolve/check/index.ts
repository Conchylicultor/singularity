import { join } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { parse as parseJsonc } from "jsonc-parser";
import { getWorktreeRoot, spawnCaptured } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

interface Violation {
  where: string;
  literal: string;
  detail: string;
}

async function gitLsFiles(root: string, pathspec: string): Promise<string[]> {
  const result = await spawnCaptured(["git", "ls-files", pathspec], { cwd: root });
  const out = result.stdout.trim();
  return out ? out.split("\n").filter((l) => l.length > 0) : [];
}

// Reduce a path under plugins/ ("primitives/plugins/terminal/web/x.tsx") to its
// maximal plugin-dir prefix ("primitives/plugins/terminal") by walking the
// alternating `<seg>(/plugins/<seg>)*` grammar buildPluginTree assigns — the
// plugin dir ends at the first non-"plugins" interstitial (a runtime dir).
function pluginDirPrefix(relUnderPlugins: string): string {
  const segs = relUnderPlugins.split("/");
  let prefix = segs[0] ?? "";
  let i = 1;
  while (segs[i] === "plugins" && segs[i + 1]) {
    prefix += `/plugins/${segs[i + 1]}`;
    i += 2;
  }
  return prefix;
}

// A reference is only validated when the ENTIRE string literal is a `plugins/`
// path (optionally ending in a trailing slash and/or a `*`/`**` glob). This is
// the shape of every real data reference (resolveFrom, lint/check allowlist
// entries) and cleanly excludes a path embedded in a prose sentence — which the
// check cannot adjudicate. Returns the path under plugins/, or null.
function pluginPathFromLiteral(s: string): string | null {
  const cut = s.split("*")[0]!.replace(/\/+$/, "");
  if (!/^plugins(?:\/[A-Za-z0-9._-]+)+$/.test(cut)) return null;
  return cut.replace(/^plugins\//, "");
}

// Quoted string literals on a line (single/double quotes; covers our cases —
// resolveFrom/allowlist entries never use template literals).
const STRING_LITERAL_RE = /"([^"]*)"|'([^']*)'/g;
// Line pre-filter: a bare `plugins/<seg>` (NOT `@plugins/...` imports, NOT an
// interior `/plugins/`). Coarse — the per-literal test above is authoritative.
const LINE_RE = /(?<![@\w/])plugins(?:\/[A-Za-z0-9._-]+)+/;
// `${pluginId}:${id}` reorder entryKey; pluginId is the dot-id before the colon.
const ENTRY_KEY_RE = /^[a-z0-9][a-z0-9.-]*:[a-z0-9][a-z0-9.-]*$/i;

// Recursively collect every string element of any `items` array (reorder
// overrides store contribution entryKeys as `${pluginId}:${id}` strings there).
function collectItemStrings(node: unknown, acc: string[]): void {
  if (Array.isArray(node)) {
    for (const el of node) collectItemStrings(el, acc);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "items" && Array.isArray(v)) {
        for (const el of v) {
          if (typeof el === "string") acc.push(el);
          else collectItemStrings(el, acc);
        }
      } else {
        collectItemStrings(v, acc);
      }
    }
  }
}

const check: Check = {
  id: "plugin-refs-resolve",
  description:
    "plugin path/id string literals (resolveFrom, lint/check allowlists, reorder overrides) resolve to a real plugin",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    const tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true });
    const pathSet = new Set(tree.byPath.keys());
    const idSet = new Set([...tree.byDir.values()].map((n) => n.id as string));
    const violations: Violation[] = [];

    // --- Surface A/B: bare `plugins/...` path literals in .ts/.tsx -----------
    // (resolveFrom, lint `ignores` burndown lists, check ALLOWED prefixes).
    // git grep narrows candidates; the masked re-scan drops comments/regex;
    // maskStrings:false keeps string text so the per-literal test sees it.
    const matches = await grepCode({
      root,
      grepArg: "(^|[^@A-Za-z0-9_/])plugins/",
      pattern: LINE_RE,
      maskStrings: false,
    });
    for (const m of matches) {
      if (m.path.endsWith(".generated.ts")) continue; // generated, not hand-authored
      for (const lit of m.text.matchAll(STRING_LITERAL_RE)) {
        const value = lit[1] ?? lit[2] ?? "";
        const underPlugins = pluginPathFromLiteral(value);
        if (underPlugins == null) continue;
        const prefix = pluginDirPrefix(underPlugins);
        if (!pathSet.has(prefix)) {
          violations.push({ where: `${m.path}:${m.line}`, literal: value, detail: `plugin path "${prefix}" does not resolve` });
        }
      }
    }

    // --- Surface C: reorder override `pluginId:id` entryKeys -----------------
    for (const rel of await gitLsFiles(root, "config")) {
      if (!rel.endsWith(".jsonc")) continue;
      const text = await Bun.file(join(root, rel)).text().catch(() => null);
      if (text == null) continue;
      const keys: string[] = [];
      collectItemStrings(parseJsonc(text), keys);
      for (const key of keys) {
        if (!ENTRY_KEY_RE.test(key)) continue;
        const pluginId = key.slice(0, key.indexOf(":"));
        if (!idSet.has(pluginId)) {
          violations.push({ where: rel, literal: key, detail: `plugin id "${pluginId}" does not resolve` });
        }
      }
    }

    if (violations.length === 0) return { ok: true };
    const shown = violations.slice(0, 50).map((v) => `  ${v.where} — "${v.literal}" (${v.detail})`);
    const more = violations.length > 50 ? `\n  … +${violations.length - 50} more` : "";
    return {
      ok: false,
      message: `${violations.length} unresolved plugin reference(s):\n${shown.join("\n")}${more}`,
      hint:
        "A plugin was likely moved or renamed. Update each reference to the plugin's new path/id — " +
        "these are string literals that nothing else validates.",
    };
  },
};

export default check;
