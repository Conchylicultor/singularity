import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "no-relative-server-imports",
  description:
    "Plugin server files must import from `@server/` alias, not relative `../../server/src/` paths",
  async run() {
    const root = await getRoot();
    // strings: false — the offending value lives in the import path string.
    const matches = await grepCode({
      root,
      pattern: /from ['"](\.\.\/)+plugins\/framework\/plugins\/server-core\/core\//,
      grepArg: `from ['"](\\.\\./)+plugins/framework/plugins/server-core/core/`,
      maskStrings: false,
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
