import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const ALLOWED_PATHS = [
  "server/src/index.ts",
  "cli/src/checks/no-raw-sse.ts",
];

export const noRawSse: Check = {
  id: "no-raw-sse",
  description:
    "SSE responses must go through the core multiplex (`sseRoutes`), not raw `text/event-stream` handlers",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(
      ["git", "grep", "-n", "--", "text/event-stream", "*.ts", "*.tsx"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out.split("\n").filter((line) => {
      const path = line.split(":", 1)[0];
      if (ALLOWED_PATHS.includes(path)) return false;
      if (path.startsWith("research/")) return false;
      return true;
    });

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`text/event-stream\` response found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Declare the stream in `sseRoutes` on the plugin's ServerPluginDefinition and emit via `send(...)` inside `subscribe()`. The core multiplex at `server/src/index.ts` owns response encoding and heartbeat. See `server/CLAUDE.md` → \"SseHandler Interface\".",
    };
  },
};
