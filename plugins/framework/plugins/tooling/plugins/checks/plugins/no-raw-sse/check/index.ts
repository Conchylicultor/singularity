import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; inputKeyed?: boolean; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const ALLOWED_PATHS = [
  "plugins/framework/plugins/tooling/plugins/checks/plugins/no-raw-sse/check/index.ts",
];

const check: Check = {
  id: "no-raw-sse",
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-websocket for rationale.
  inputKeyed: true,
  description:
    "Live state must go through `defineResource` / `useResource`; no raw `text/event-stream` writers in TS",
  async run() {
    const root = await getRoot();
    const matches = await grepCode({
      root,
      pattern: /text\/event-stream/,
      grepArg: "text/event-stream",
      fixed: true,
      maskStrings: false,
    });

    const offenders = matches
      .filter((m) => {
        if (ALLOWED_PATHS.includes(m.path)) return false;
        if (m.path.startsWith("research/")) return false;
        return true;
      })
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`text/event-stream\` response found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Live state belongs in `defineResource` (server) + `useResource` (web); see `server/CLAUDE.md` → \"defineResource\". Append-only firehoses (terminal, log tails) belong on a dedicated WS route. The gateway's SSE endpoint for external log streams is Go and out of scope for this check.",
    };
  },
};

export default check;
