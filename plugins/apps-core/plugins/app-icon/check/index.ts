import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// `appIcon(symbol("…"))` in an app shell's web barrel — the icon the app
// draws. The capture is the Material Symbols name (e.g. `bug-report`).
const APP_ICON = /appIcon\(\s*symbol\(\s*["']([^"']+)["']/;
// `iconKey: "…"` inside a `defineApp({...})` core call (single line).
const ICON_KEY = /iconKey:\s*["']([^"']+)["']/;

/** Shell plugin dir from a `.../<shellDir>/<runtime>/...` path. */
function shellDirFrom(path: string, runtimeSeg: string): string | null {
  const i = path.indexOf(runtimeSeg);
  return i === -1 ? null : path.slice(0, i);
}

interface Offender {
  file: string;
  reason: string;
}

const check: Check = {
  id: "app-icon:key-in-sync",
  description:
    "every app shell's core `defineApp({ iconKey })` names the same Material Symbols glyph as the `appIcon(symbol(…))` in its web barrel",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();

    // 1. The drawn icon: every `appIcon(symbol("…"))` in a web barrel, indexed
    //    by its owning shell plugin dir.
    const webMatches = await grepCode({
      root,
      pattern: APP_ICON,
      grepArg: "appIcon",
    });
    const webByDir = new Map<string, { name: string; file: string }>();
    for (const m of webMatches) {
      const dir = shellDirFrom(m.path, "/web/");
      if (!dir) continue;
      const icon = APP_ICON.exec(m.text);
      if (!icon) continue;
      webByDir.set(dir, { name: icon[1]!, file: m.path });
    }

    // 2. Declared `iconKey`s from `defineApp({...})`, indexed by shell dir.
    const coreMatches = await grepCode({
      root,
      pattern: ICON_KEY,
      grepArg: "iconKey",
    });
    const coreByDir = new Map<string, { iconKey: string; file: string }>();
    for (const m of coreMatches) {
      const dir = shellDirFrom(m.path, "/core/");
      if (!dir) continue;
      const key = ICON_KEY.exec(m.text);
      if (!key) continue;
      coreByDir.set(dir, { iconKey: key[1]!, file: m.path });
    }

    // 3. Pair by shell dir and verify the two representations agree. Only the
    //    intersection matters: a web-only `appIcon(symbol("…"))` (e.g.
    //    `DEFAULT_APP_ICON` in this very plugin) is a legitimate non-shell usage
    //    with no `defineApp` to pair, and a core-only `defineApp({ iconKey })`
    //    (e.g. in `pane/core/route.test.ts`) has no shell web barrel — neither is
    //    drift. A real shell that drops one side is already caught by the type
    //    system (iconKey is required) or simply never renders.
    const offenders: Offender[] = [];
    for (const [dir, web] of webByDir) {
      const core = coreByDir.get(dir);
      if (!core) continue;
      if (core.iconKey !== web.name) {
        offenders.push({
          file: core.file,
          reason: `iconKey "${core.iconKey}" does not match web appIcon(symbol("${web.name}"))`,
        });
      }
    }

    if (offenders.length === 0) return { ok: true };

    const lines = offenders.map((o) => `  ${o.file} — ${o.reason}`);
    return {
      ok: false,
      message: `${offenders.length} app icon key mismatch(es):\n${lines.join("\n")}`,
      hint:
        'Keep `defineApp({ iconKey })` (shell/core) in sync with `appIcon(symbol("…"))` (shell/web): ' +
        'both are the Material Symbols name (e.g. "bug-report"). tsc checks that the name exists.',
    };
  },
};

export default check;
