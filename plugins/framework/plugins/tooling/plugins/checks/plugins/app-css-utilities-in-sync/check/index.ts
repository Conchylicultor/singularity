import { readFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const APP_CSS = "plugins/framework/plugins/web-core/web/theme/app.css";
const CUSTOM_UTILITIES = "plugins/framework/plugins/web-core/web/theme/custom-utilities.ts";

/**
 * Extract every `@utility <name>` declaration from app.css. CSS block comments
 * are stripped first so a prose mention of `@utility …` inside a comment is not
 * mistaken for a real declaration.
 */
function declaredUtilities(css: string): Set<string> {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of code.matchAll(/@utility\s+([\w-]+)/g)) {
    const name = m[1];
    if (name) out.add(name);
  }
  return out;
}

/**
 * Extract the registered utility names from custom-utilities.ts by text-parsing
 * the string literals inside every `const <NAME>_UTILITIES = [ … ]` array. The
 * `*_UTILITIES` suffix convention is what makes the registry total: any new family
 * is picked up automatically. Text-parse (not import) to avoid runtime/boundary
 * questions. Group ids / conflict ids are scalar fields, never inside these
 * arrays, so they are correctly excluded.
 */
function registeredUtilities(ts: string): Set<string> {
  const out = new Set<string>();
  for (const arr of ts.matchAll(/\w+_UTILITIES\s*=\s*\[([^\]]*)\]/g)) {
    const body = arr[1];
    if (!body) continue;
    for (const lit of body.matchAll(/["'`]([\w-]+)["'`]/g)) {
      const token = lit[1];
      if (token) out.add(token);
    }
  }
  return out;
}

const check: Check = {
  id: "app-css-utilities-in-sync",
  description:
    "Every custom @utility in app.css must be registered in custom-utilities.ts (the twMerge source of truth), and vice versa",
  async run() {
    const root = await getRoot();
    const css = readFileSync(join(root, APP_CSS), "utf8");
    const ts = readFileSync(join(root, CUSTOM_UTILITIES), "utf8");

    const declared = declaredUtilities(css);
    const registered = registeredUtilities(ts);

    // Forward: every registered name must be declared in app.css.
    const missing = [...registered].filter((name) => !declared.has(name));
    if (missing.length > 0) {
      return {
        ok: false,
        message: `app.css missing @utility: ${missing.join(", ")}`,
        hint: "Add the @utility to app.css or remove it from custom-utilities.ts.",
      };
    }

    // Reverse (total): every @utility declared in app.css must be registered, so
    // cn()/twMerge knows about it. An unregistered custom utility is the
    // silent-strip / fail-to-dedupe bug class — fail loudly instead.
    const unregistered = [...declared].filter((name) => !registered.has(name));
    if (unregistered.length > 0) {
      return {
        ok: false,
        message: `app.css declares unregistered @utility: ${unregistered.join(", ")}`,
        hint:
          "Add it to a *_UTILITIES array in web-core/web/theme/custom-utilities.ts and give it a CUSTOM_UTILITY_REGISTRY entry " +
          "(extend a built-in group, a synthetic group + conflictsWith, or standalone with a reason).",
      };
    }

    return { ok: true };
  },
};

export default check;
