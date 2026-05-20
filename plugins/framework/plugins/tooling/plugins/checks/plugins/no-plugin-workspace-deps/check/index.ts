type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

interface Offender {
  file: string;
  dep: string;
  range: string;
}

const check: Check = {
  id: "no-plugin-workspace-deps",
  description:
    "Plugin package.jsons must not declare `workspace:*` deps — cross-plugin imports go through `@plugins/*` path aliases, not npm workspaces",
  async run() {
    const root = await getRoot();
    const lsFiles = Bun.spawn(
      ["git", "ls-files", "plugins/**/package.json"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const fileList = (await new Response(lsFiles.stdout).text())
      .split("\n")
      .filter(Boolean);

    const offenders: Offender[] = [];
    for (const file of fileList) {
      let json: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      try {
        const text = await Bun.file(`${root}/${file}`).text();
        json = JSON.parse(text);
      } catch {
        continue;
      }
      for (const section of ["dependencies", "devDependencies"] as const) {
        const deps = json[section];
        if (!deps) continue;
        for (const [dep, range] of Object.entries(deps)) {
          if (typeof range === "string" && range.startsWith("workspace:")) {
            offenders.push({ file, dep, range });
          }
        }
      }
    }

    if (offenders.length === 0) return { ok: true };

    const lines = offenders.map((o) => `${o.file}: "${o.dep}": "${o.range}"`);
    return {
      ok: false,
      message: `workspace:* dep declared in ${offenders.length} plugin package.json(s):\n    ${lines.join("\n    ")}`,
      hint:
        "Remove the workspace dep. Plugins import each other via the `@plugins/*` tsconfig path alias — no package.json wiring needed. Adding a workspace dep also forces every umbrella to be listed in the root `workspaces` glob, which is brittle.",
    };
  },
};

export default check;
