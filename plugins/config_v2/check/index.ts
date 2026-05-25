type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

async function grepPluginDirs(
  root: string,
  pattern: string,
  suffix: string,
): Promise<Set<string>> {
  const proc = Bun.spawn(["git", "grep", "-lF", "--", pattern], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()).trim();
  if (!out) return new Set();
  const dirs = new Set<string>();
  for (const line of out.split("\n")) {
    const path = line.trim();
    if (!path.endsWith(suffix)) continue;
    dirs.add(path.slice(0, path.length - suffix.length));
  }
  return dirs;
}

const check: Check = {
  id: "config-v2:registrations-paired",
  description:
    "Every ConfigV2.Register (server) must have a matching ConfigV2.WebRegister (web), and vice versa",
  async run() {
    const root = await getRoot();

    const [serverDirs, webDirs] = await Promise.all([
      grepPluginDirs(root, "ConfigV2.Register({", "/server/index.ts"),
      grepPluginDirs(root, "ConfigV2.WebRegister({", "/web/index.ts"),
    ]);

    const missingWeb: string[] = [];
    const missingServer: string[] = [];

    for (const dir of serverDirs) {
      if (!webDirs.has(dir)) missingWeb.push(dir);
    }
    for (const dir of webDirs) {
      if (!serverDirs.has(dir)) missingServer.push(dir);
    }

    if (missingWeb.length === 0 && missingServer.length === 0) return { ok: true };

    missingWeb.sort();
    missingServer.sort();

    const parts: string[] = [];
    if (missingWeb.length > 0) {
      parts.push(
        `${missingWeb.length} plugin(s) have ConfigV2.Register (server) but no ConfigV2.WebRegister (web):\n` +
          missingWeb.map((d) => `    ${d}`).join("\n"),
      );
    }
    if (missingServer.length > 0) {
      parts.push(
        `${missingServer.length} plugin(s) have ConfigV2.WebRegister (web) but no ConfigV2.Register (server):\n` +
          missingServer.map((d) => `    ${d}`).join("\n"),
      );
    }

    return {
      ok: false,
      message: parts.join("\n\n"),
      hint: [
        missingWeb.length > 0 &&
          "Add ConfigV2.WebRegister({ descriptor }) to the web/index.ts contributions[] of each listed plugin.",
        missingServer.length > 0 &&
          "Add ConfigV2.Register({ descriptor }) to the server/index.ts contributions[] of each listed plugin.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  },
};

export default check;
