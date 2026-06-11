import { readFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

/**
 * Checks the SOURCE-demand class of CSS custom-property gaps: a fallback-less
 * `var(--x)` reference in any repo CSS that points at a token nothing supplies
 * (no token-group schema key, no `--x:` CSS declaration). Catches typos,
 * renames, and orphaned runtime-only vars.
 *
 * It does NOT catch runtime-supply gaps — e.g. a sparse tweakcn preset failing
 * to emit a token-group var it is silent on. `--font-size-caption` IS a
 * token-group key, hence in SUPPLY here; whether a given preset actually emits
 * it at runtime is the injector's job (Part A's merge base + completeness
 * assertion), not this static check.
 *
 * Disjoint from `app-css-utilities-in-sync` (which reconciles `@utility` class
 * names against control-utilities.ts) — complementary, no overlap.
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

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

const check: Check = {
  id: "css-vars-supplied",
  description:
    "Every fallback-less var(--x) in repo CSS must reference a token supplied by a token-group schema or a CSS declaration",
  async run() {
    const root = await getRoot();

    const cssFiles = await gitLsFiles(root, "plugins/**/*.css");
    const groupFiles = await gitLsFiles(
      root,
      "plugins/ui/plugins/tokens/plugins/*/shared/group.ts",
    );

    // DEMAND: fallback-less var(--x) references, mapped to their first file.
    const demand = new Map<string, string>();
    // SUPPLY: every token a group schema or a CSS declaration provides.
    const supply = new Set<string>();

    for (const rel of cssFiles) {
      const code = stripComments(readFileSync(join(root, rel), "utf8"));

      // DEMAND: var(--x) or var(--x, …). 2nd group `)` ⇒ fallback-less.
      for (const m of code.matchAll(/var\(\s*(--[\w-]+)\s*(,|\))/g)) {
        const name = m[1];
        const delimiter = m[2];
        if (!name || delimiter !== ")") continue;
        if (name.startsWith("--tw-")) continue; // Tailwind internals
        if (!demand.has(name)) demand.set(name, rel);
      }

      // SUPPLY: every `--x:` declaration.
      for (const m of code.matchAll(/(--[\w-]+)\s*:/g)) {
        if (m[1]) supply.add(m[1]);
      }
    }

    // SUPPLY: token-group schema keys → kebab-cased CSS vars.
    for (const rel of groupFiles) {
      const code = stripComments(readFileSync(join(root, rel), "utf8"));
      // Top-level schema keys: `fontSizeCaption: {` / `"categorical-1": {`.
      // The `{` after the colon excludes nested `default:`/`label:` (followed
      // by a string literal).
      for (const m of code.matchAll(
        /(?:"([\w-]+)"|([A-Za-z_$][\w$]*))\s*:\s*\{/g,
      )) {
        const key = m[1] ?? m[2];
        if (key) supply.add(`--${camelToKebab(key)}`);
      }
    }

    const offenders = [...demand.entries()].filter(
      ([name]) => !supply.has(name),
    );
    if (offenders.length > 0) {
      const lines = offenders
        .map(([name, file]) => `  ${name} (${file})`)
        .join("\n");
      return {
        ok: false,
        message: `Fallback-less var() references with no supplier:\n${lines}`,
        hint: "Every fallback-less var(--x) must be supplied by a token-group schema (plugins/ui/plugins/tokens/.../group.ts) or a CSS declaration. Add the token, declare it in app.css, or give the reference a var(--x, <fallback>).",
      };
    }

    return { ok: true };
  },
};

export default check;
