import { join } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { contributionsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The static contributions facet stores the `Apps.App(...)` callee verbatim as
// the slot string (display head from the import map + `.App`), so an Apps.App
// contribution is exactly this.
const APPS_APP_SLOT = "Apps.App";

// A prop value VALID iff it is `<ident>.id` / `<ident>.basePath` for the SAME
// named AppRef binding. Captures the binding name so id/path agreement and
// registration can be checked.
const ID_FROM_REF = /^(\w+)\.id$/;
const PATH_FROM_REF = /^(\w+)\.basePath$/;

interface Offender {
  pluginPath: string;
  id: string | undefined;
  path: string | undefined;
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
  id: "apps-paths-from-app-ref",
  description:
    "every `Apps.App` contribution derives its `id`/`path` from a named `AppRef` (`<app>.id` / `<app>.basePath`), never from string/const literals — one source of truth for the typed link builder",
  async run(): Promise<CheckResult> {
    const root = await getRoot();

    // 1. The set of registered AppRef binding names: `export const <NAME> =
    //    defineApp(`. Only named exports can be referenced by a contribution, so
    //    only these matter. `maskStrings: false` is irrelevant here (the token
    //    is code), but kept explicit; comments/strings are already masked out.
    const refMatches = await grepCode({
      root,
      pattern: /export\s+const\s+(\w+)\s*=\s*defineApp\s*\(/,
      grepArg: "defineApp",
      maskStrings: false,
    });
    const appRefNames = new Set<string>();
    for (const m of refMatches) {
      const captured = /export\s+const\s+(\w+)\s*=\s*defineApp\s*\(/.exec(m.text);
      if (captured) appRefNames.add(captured[1]!);
    }

    // 2. Enumerate every Apps.App contribution across all plugins via the
    //    already-parsed contributions facet (props are raw source text).
    const tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true, facets: true });
    const offenders: Offender[] = [];

    for (const node of tree.byDir.values()) {
      const facet = getFacet(node, contributionsFacetDef);
      if (!facet) continue;
      for (const c of facet.static) {
        if (c.slot !== APPS_APP_SLOT) continue;

        const idRaw = c.props["id"]?.trim();
        const pathRaw = c.props["path"]?.trim();
        const idMatch = idRaw ? ID_FROM_REF.exec(idRaw) : null;
        const pathMatch = pathRaw ? PATH_FROM_REF.exec(pathRaw) : null;

        let reason: string | null = null;
        if (!idMatch || !pathMatch) {
          reason = "`id`/`path` must be `<app>.id` / `<app>.basePath` from an AppRef";
        } else if (idMatch[1] !== pathMatch[1]) {
          reason = `\`id\` (${idMatch[1]}) and \`path\` (${pathMatch[1]}) reference different AppRefs`;
        } else if (!appRefNames.has(idMatch[1]!)) {
          reason = `\`${idMatch[1]}\` is not a registered AppRef (no \`export const ${idMatch[1]} = defineApp(...)\`)`;
        }

        if (reason) {
          offenders.push({ pluginPath: node.path, id: idRaw, path: pathRaw, reason });
        }
      }
    }

    if (offenders.length === 0) return { ok: true };

    const lines = offenders.map(
      (o) =>
        `  ${o.pluginPath} — id: ${o.id ?? "<missing>"}, path: ${o.path ?? "<missing>"} (${o.reason})`,
    );
    return {
      ok: false,
      message: `${offenders.length} \`Apps.App\` contribution(s) not derived from a typed AppRef:\n${lines.join("\n")}`,
      hint:
        "Define the app's identity once with `defineApp` (from `@plugins/primitives/plugins/pane/core`) in the app's `shell/core` — " +
        "`export const fooApp = defineApp({ id: \"foo\", basePath: \"/foo\" });` — then write " +
        "`Apps.App({ id: fooApp.id, path: fooApp.basePath, ... })` in `shell/web/index.ts`. " +
        "This makes the app base path a single source of truth shared with the typed link builder " +
        "(`<route>.link(app, params)`), so `id`/`path` can never drift. See `apps/agent-manager` and `apps/pages` for the precedent.",
    };
  },
};

export default check;
