import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { resolveIconSvgNodes } from "@plugins/primitives/plugins/icon-picker/server";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// `mdAppIcon(MdXxx)` in an app shell's web barrel — the authoritative icon
// source. The capture is the react-icons component token (e.g. `MdBugReport`).
const MD_APP_ICON = /mdAppIcon\(\s*(Md\w+)/;
// `iconKey: "snake_case"` inside a `defineApp({...})` core call (single line).
const ICON_KEY = /iconKey:\s*["']([^"']+)["']/;

/**
 * Derive the MD icon map key from a react-icons component token, inverting the
 * generator's `Md` + capitalize-each-snake-segment rule
 * (`bug_report` → `MdBugReport`): strip `Md`, insert `_` before every non-leading
 * uppercase letter, lowercase. `MdBugReport` → `bug_report`, `MdPiano` → `piano`.
 */
function deriveIconKey(mdToken: string): string {
  return mdToken
    .replace(/^Md/, "")
    .replace(/(?<!^)([A-Z])/g, "_$1")
    .toLowerCase();
}

/** Shell plugin dir from a `.../<shellDir>/<runtime>/...` path. */
function shellDirFrom(path: string, runtimeSeg: string): string | null {
  const i = path.indexOf(runtimeSeg);
  return i === -1 ? null : path.slice(0, i);
}

interface Offender {
  file: string;
  reason: string;
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "app-icon:key-in-sync",
  description:
    "every app shell's core `defineApp({ iconKey })` matches the `mdAppIcon(MdXxx)` in its web barrel and resolves to a real MD icon",
  async run(): Promise<CheckResult> {
    const root = await getRoot();

    // 1. Authoritative icon source: every `mdAppIcon(MdXxx)` in a web barrel,
    //    indexed by its owning shell plugin dir.
    const webMatches = await grepCode({ root, pattern: MD_APP_ICON, grepArg: "mdAppIcon" });
    const webByDir = new Map<string, { mdToken: string; file: string }>();
    for (const m of webMatches) {
      const dir = shellDirFrom(m.path, "/web/");
      if (!dir) continue;
      const md = MD_APP_ICON.exec(m.text);
      if (!md) continue;
      webByDir.set(dir, { mdToken: md[1]!, file: m.path });
    }

    // 2. Declared `iconKey`s from `defineApp({...})`, indexed by shell dir.
    const coreMatches = await grepCode({ root, pattern: ICON_KEY, grepArg: "iconKey" });
    const coreByDir = new Map<string, { iconKey: string; file: string }>();
    for (const m of coreMatches) {
      const dir = shellDirFrom(m.path, "/core/");
      if (!dir) continue;
      const key = ICON_KEY.exec(m.text);
      if (!key) continue;
      coreByDir.set(dir, { iconKey: key[1]!, file: m.path });
    }

    // 3. Pair by shell dir and verify the two representations agree. Only the
    //    intersection matters: a web-only `mdAppIcon(MdXxx)` (e.g.
    //    `DEFAULT_APP_ICON` in this very plugin) is a legitimate non-shell usage
    //    with no `defineApp` to pair, and a core-only `defineApp({ iconKey })`
    //    (e.g. in `pane/core/route.test.ts`) has no shell web barrel — neither is
    //    drift. A real shell that drops one side is already caught by the type
    //    system (iconKey is required) or simply never renders.
    const offenders: Offender[] = [];
    for (const [dir, web] of webByDir) {
      const core = coreByDir.get(dir);
      if (!core) continue;
      const expected = deriveIconKey(web.mdToken);
      if (core.iconKey !== expected) {
        offenders.push({
          file: core.file,
          reason: `iconKey "${core.iconKey}" does not match web mdAppIcon(${web.mdToken}) → expected "${expected}"`,
        });
        continue;
      }
      if (resolveIconSvgNodes(core.iconKey) == null) {
        offenders.push({
          file: core.file,
          reason: `iconKey "${core.iconKey}" (from mdAppIcon(${web.mdToken})) does not resolve to a known MD icon`,
        });
      }
    }

    if (offenders.length === 0) return { ok: true };

    const lines = offenders.map((o) => `  ${o.file} — ${o.reason}`);
    return {
      ok: false,
      message: `${offenders.length} app icon key mismatch(es):\n${lines.join("\n")}`,
      hint:
        "Keep `defineApp({ iconKey })` (shell/core) in sync with `mdAppIcon(MdXxx)` (shell/web). " +
        "The key is the MD icon name in snake_case (MdBugReport → \"bug_report\", MdPiano → \"piano\").",
    };
  },
};

export default check;
