import typedWebFetches from "./typed-web-fetches";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// All plugins have been migrated to defineEndpoint + implement().
// No legacy allowlist entries remain.
const ALLOWED = new Set<string>([]);

const typedHandlers: Check = {
  id: "endpoints:typed-handlers",
  description:
    "HTTP route handlers must use defineEndpoint + implement(); literal route strings in httpRoutes are forbidden for new plugins",
  async run() {
    const root = await getRoot();

    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-nE",
        '"(GET|POST|PUT|PATCH|DELETE) /[^"]*"[ ]*:',
        "--",
        "*.ts",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders: string[] = [];
    for (const line of out.split("\n")) {
      const path = line.split(":", 1)[0];

      if (
        !path.startsWith("plugins/") ||
        (!path.includes("/server/index.ts") &&
          !path.includes("/central/index.ts"))
      )
        continue;

      const content = line.split(":").slice(2).join(":").trimStart();
      if (content.startsWith("//") || content.startsWith("*")) continue;

      if (ALLOWED.has(path)) continue;

      offenders.push(line);
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} literal route key(s) not using defineEndpoint:\n    ${offenders.join("\n    ")}`,
      hint: "Define endpoints with defineEndpoint() in core/endpoints.ts and use implement() in server handlers. See @plugins/agents for the canonical example.",
    };
  },
};

export default [typedHandlers, typedWebFetches];
