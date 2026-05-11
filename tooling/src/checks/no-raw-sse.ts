import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Only this check's own source may mention the raw string (for matching).
const ALLOWED_PATHS = [
  "tooling/src/checks/no-raw-sse.ts",
];

export const noRawSse: Check = {
  id: "no-raw-sse",
  description:
    "Live state must go through `defineResource` / `useResource`; no raw `text/event-stream` writers in TS",
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
        "Live state belongs in `defineResource` (server) + `useResource` (web); see `server/CLAUDE.md` → \"defineResource\". Append-only firehoses (terminal, log tails) belong on a dedicated WS route. The gateway's SSE endpoint for external log streams is Go and out of scope for this check.",
    };
  },
};
