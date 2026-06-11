import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchBracket } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { TOKEN_GROUP_VARS } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

/**
 * Enforces that every token-group CSS var has exactly ONE declaring owner.
 * Token *value* resolution is a deliberate layered cascade (default → preset →
 * override); token *declaration* is the opposite — it must be single-owner, and
 * any overlap there is a real, ambiguous conflict that ThemeInjector or the
 * cascade would resolve silently/order-dependently.
 *
 * Fails if:
 *  (a) any var appears in 2+ token groups (cross-group collision); or
 *  (b) any token-group var is also DECLARED (`--x:`, not a `var(--x)` reference)
 *      in tracked CSS, EXCLUDING declarations inside `@theme { … }` /
 *      `@theme inline { … }` blocks (Tailwind's build-time utility-token layer,
 *      a defined lower-precedence position rather than an ambiguous same-level
 *      conflict).
 */

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

async function gitLsFiles(root: string, glob: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files", glob], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()).trim();
  return out ? out.split("\n") : [];
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Blank out the interior of every `@theme { … }` / `@theme inline { … }` block
 * (replaced by spaces, length preserved) so `--x:` declarations inside them are
 * not seen as ambiguous same-level runtime declarations. Brace matching reuses
 * `matchBracket` (skips comments/strings).
 */
function maskThemeBlocks(src: string): string {
  let out = src;
  const re = /@theme\b[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) {
    const braceStart = out.indexOf("{", m.index);
    if (braceStart < 0) break;
    const braceEnd = matchBracket(out, braceStart, "{", "}");
    if (braceEnd < 0) break;
    out =
      out.slice(0, braceStart + 1) +
      " ".repeat(braceEnd - braceStart - 1) +
      out.slice(braceEnd);
    re.lastIndex = braceEnd;
  }
  return out;
}

const check: Check = {
  id: "css-vars-single-owner",
  description:
    "Every token-group CSS var has exactly one declaring owner (no cross-group collision; no static-CSS re-declaration outside @theme)",
  async run() {
    const root = await getRoot();

    // (a) Cross-group collisions: var → the groups that claim it.
    const owners = new Map<string, string[]>();
    for (const [groupId, vars] of Object.entries(TOKEN_GROUP_VARS)) {
      for (const v of vars) {
        const list = owners.get(v);
        if (list) list.push(groupId);
        else owners.set(v, [groupId]);
      }
    }
    const collisions = [...owners.entries()].filter(
      ([, groups]) => groups.length > 1,
    );

    // Set of all token-group vars (any group), for the static-CSS overlap scan.
    const tokenGroupVars = new Set(owners.keys());

    // (b) Static-CSS overlap: token-group vars DECLARED outside @theme blocks.
    // The web app.css lives under plugins/ (web-core), so the plugins glob
    // covers every tracked CSS file.
    const cssFiles = await gitLsFiles(root, "plugins/**/*.css");
    const overlaps: { name: string; file: string }[] = [];
    for (const rel of cssFiles) {
      const raw = readFileSync(join(root, rel), "utf8");
      const code = maskThemeBlocks(stripComments(raw));
      for (const mm of code.matchAll(/(--[\w-]+)\s*:/g)) {
        const name = mm[1];
        if (name && tokenGroupVars.has(name)) overlaps.push({ name, file: rel });
      }
    }

    if (collisions.length === 0 && overlaps.length === 0) return { ok: true };

    const parts: string[] = [];
    if (collisions.length) {
      const lines = collisions
        .map(([name, groups]) => `  ${name} — claimed by: ${groups.join(", ")}`)
        .join("\n");
      parts.push(`Token-group var declared by multiple groups:\n${lines}`);
    }
    if (overlaps.length) {
      const lines = overlaps
        .map((o) => `  ${o.name} (${o.file})`)
        .join("\n");
      parts.push(
        `Token-group var re-declared in static CSS (outside @theme):\n${lines}`,
      );
    }
    return {
      ok: false,
      message: parts.join("\n\n"),
      hint: "Each token-group var must have exactly one declaring owner. For a cross-group collision, rename one group's schema key. For a static-CSS overlap, reference the token via var(--x) (never declare it) — a token's only declaring owner is its token group (emitted by ThemeInjector).",
    };
  },
};

export default check;
