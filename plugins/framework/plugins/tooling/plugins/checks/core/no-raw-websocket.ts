import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// The networking sub-plugin defines the primitives (SharedWebSocket,
// useReconnectingWebSocket); they're allowed to use the native WebSocket.
// `cli/` may use it for local tooling.
const ALLOWED_PATHS = [
  "plugins/primitives/plugins/networking/",
  "cli/",
  "plugins/framework/plugins/tooling/plugins/checks/core/no-raw-websocket.ts",
];

export const noRawWebsocket: Check = {
  id: "no-raw-websocket",
  description:
    "WebSocket clients must go through the shared `SharedWebSocket` primitive (not raw `new WebSocket`)",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(
      ["git", "grep", "-n", "--", "new WebSocket(", "*.ts", "*.tsx"],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out.split("\n").filter((line) => {
      const path = line.split(":", 1)[0];
      if (ALLOWED_PATHS.some((p) => path.startsWith(p))) return false;
      if (path.startsWith("research/")) return false;
      return true;
    });

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`new WebSocket(\` found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use `new SharedWebSocket(...)` from `@plugins/primitives/plugins/networking/web` instead. It mirrors the native WebSocket API but transparently shares a single connection across all tabs of the origin, so opening 20 tabs doesn't open 20 sockets or leave follower tabs without live updates.",
    };
  },
};
