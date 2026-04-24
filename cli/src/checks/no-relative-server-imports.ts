import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const noRelativeServerImports: Check = {
  id: "no-relative-server-imports",
  description:
    "Plugin server files must import from `@server/` alias, not relative `../../server/src/` paths",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(
      ["git", "grep", "-rn", "-E", `from ['"](\\.\\./)+server/src/`, "--", "plugins/"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out.split("\n").filter(Boolean);
    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `relative server/src import found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use the `@server/*` alias instead of relative paths (e.g. `@server/types`, `@server/db/client`, `@server/resources`). The alias is defined in `server/tsconfig.json`.",
    };
  },
};
