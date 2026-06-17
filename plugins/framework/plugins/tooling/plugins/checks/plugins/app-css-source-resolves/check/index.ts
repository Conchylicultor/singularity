import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const APP_CSS = "plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css";

/**
 * Extract every `@source "<glob>"` path from app.css. CSS block comments are
 * stripped first so a prose mention inside a comment is not mistaken for a real
 * directive.
 */
function declaredSources(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const m of code.matchAll(/@source\s+["']([^"']+)["']/g)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/**
 * The `@source` glob in app.css steers Tailwind's class-name scan. It is written
 * as a relative path from app.css's own directory, so relocating app.css (e.g.
 * the css/ umbrella moves) silently re-aims it at the wrong subtree — Tailwind
 * then only generates utilities used inside that subtree and every color/class
 * used elsewhere renders unstyled. This check pins the resolved target to the
 * repo-root `plugins/` directory so the relative chain can never drift unnoticed.
 */
const check: Check = {
  id: "app-css-source-resolves",
  description:
    "The @source glob in app.css must resolve to the repo-root plugins/ directory (a wrong relative depth silently narrows Tailwind's scan)",
  async run() {
    const root = await getRoot();
    const cssPath = join(root, APP_CSS);
    const css = readFileSync(cssPath, "utf8");
    const cssDir = dirname(cssPath);
    const expected = join(root, "plugins");

    const sources = declaredSources(css);
    if (sources.length === 0) {
      return {
        ok: false,
        message: `app.css declares no @source — Tailwind has nothing to scan for class names.`,
        hint: `Add @source "${relative(cssDir, expected)}/"; to ${APP_CSS}.`,
      };
    }

    const resolvesToPlugins = sources.some(
      (glob) => resolve(cssDir, glob) === expected,
    );
    if (!resolvesToPlugins) {
      const got = sources
        .map((glob) => `"${glob}" → ${relative(root, resolve(cssDir, glob))}`)
        .join(", ");
      return {
        ok: false,
        message: `No @source in app.css resolves to the repo-root plugins/ directory. Got: ${got}.`,
        hint: `Fix the relative depth so it points at plugins/ — from ${APP_CSS} that is @source "${relative(cssDir, expected)}/";`,
      };
    }

    return { ok: true };
  },
};

export default check;
