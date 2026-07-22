import { grepImports } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "no-relative-server-imports",
  description:
    "Plugin server files must import from `@server/` alias, not relative `../../server/src/` paths",
  async run() {
    const root = await getWorktreeRoot();
    // grepImports is string-safe by construction: findImports masks strings
    // fully, so an import written inside a string/fixture can never match. The
    // filter runs on the bare specifier (no leading `from "`), anchored at `^`.
    const matches = await grepImports({
      root,
      grepArg: `from ['"](\\.\\./)+plugins/framework/plugins/server-core/core/`,
      filter: (s) => /^(\.\.\/)+plugins\/framework\/plugins\/server-core\/core\//.test(s),
      pathspecs: ["plugins/"],
    });

    const offenders = matches.map((m) => `${m.path}:${m.line}:${m.text}`);
    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `relative server/src import found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use the `@server/*` alias instead of relative paths (e.g. `@server/types`, `@server/db/client`, `@server/resources`). The alias is defined in `plugins/framework/plugins/server-core/tsconfig.json`.",
    };
  },
};

export default check;
