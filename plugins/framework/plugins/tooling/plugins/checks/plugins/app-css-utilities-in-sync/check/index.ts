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
const CONTROL_UTILITIES = "plugins/framework/plugins/web-core/web/theme/control-utilities.ts";

// Reverse-guard patterns: declarations in app.css owned by control-utilities.ts.
// Any @utility matching one of these MUST appear in the expected set, else it is
// an orphan registration the twMerge config never learned about.
const OWNED = [/^control-/, /^p-(chip|control|row)$/];
const OWNED_EXACT = new Set(["icon-auto"]);

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
 * Extract the expected utility names from control-utilities.ts by text-parsing
 * the quoted string literals inside the exported array literals
 * (CONTROL_HEIGHT_UTILITIES / CONTROL_ICON_UTILITIES / PAD_UTILITIES) plus the
 * `ICON_AUTO_UTILITY = "..."` scalar. Text-parse (not import) to avoid any
 * runtime/boundary question.
 */
function expectedUtilities(ts: string): Set<string> {
  const out = new Set<string>();

  for (const name of ["CONTROL_HEIGHT_UTILITIES", "CONTROL_ICON_UTILITIES", "PAD_UTILITIES"]) {
    const arrayMatch = ts.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    const body = arrayMatch?.[1];
    if (body) {
      for (const lit of body.matchAll(/["'`]([\w-]+)["'`]/g)) {
        const token = lit[1];
        if (token) out.add(token);
      }
    }
  }

  const scalar = ts.match(/ICON_AUTO_UTILITY\s*=\s*["'`]([\w-]+)["'`]/);
  const scalarName = scalar?.[1];
  if (scalarName) out.add(scalarName);

  return out;
}

const check: Check = {
  id: "app-css-utilities-in-sync",
  description:
    "Custom @utility classes in app.css must stay in sync with control-utilities.ts (the twMerge mirror)",
  async run() {
    const root = await getRoot();
    const css = readFileSync(join(root, APP_CSS), "utf8");
    const ts = readFileSync(join(root, CONTROL_UTILITIES), "utf8");

    const declared = declaredUtilities(css);
    const expected = expectedUtilities(ts);

    // Forward: every expected name must be declared in app.css.
    const missing = [...expected].filter((name) => !declared.has(name));
    if (missing.length > 0) {
      return {
        ok: false,
        message: `app.css missing @utility: ${missing.join(", ")}`,
        hint: "Add the @utility to app.css or update control-utilities.ts.",
      };
    }

    // Reverse: every owned-namespace declaration must be registered in
    // control-utilities.ts (so its twMerge conflict is configured).
    const unregistered = [...declared].filter((name) => {
      if (expected.has(name)) return false;
      const owned = OWNED_EXACT.has(name) || OWNED.some((re) => re.test(name));
      return owned;
    });
    if (unregistered.length > 0) {
      return {
        ok: false,
        message: `app.css declares unregistered utility: ${unregistered.join(", ")}`,
        hint: "Register it in control-utilities.ts and add its twMerge conflict in web-core/web/lib/utils.ts.",
      };
    }

    return { ok: true };
  },
};

export default check;
