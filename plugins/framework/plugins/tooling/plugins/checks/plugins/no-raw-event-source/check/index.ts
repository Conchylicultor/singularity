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
  "plugins/primitives/plugins/networking/",
  "cli/",
  "plugins/framework/plugins/tooling/plugins/checks/plugins/no-raw-event-source/check/index.ts",
];

const check: Check = {
  id: "no-raw-event-source",
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-websocket for rationale.
  inputKeyed: true,
  description:
    "SSE streams must go through the shared ReconnectingEventSource primitive (not raw `new EventSource`)",
  async run() {
    const root = await getRoot();
    const matches = await grepCode({
      root,
      pattern: /new EventSource\(/,
      grepArg: "new EventSource(",
      fixed: true,
      maskStrings: true,
    });

    const offenders = matches
      .filter((m) => {
        if (ALLOWED_PATHS.some((p) => m.path.startsWith(p))) return false;
        if (m.path.startsWith("research/")) return false;
        return true;
      })
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`new EventSource(\` found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use `new ReconnectingEventSource(...)` from `@plugins/primitives/plugins/networking/web` instead. It handles reconnection and inter-tab sharing (leader election) so opening many tabs doesn't saturate the server.",
    };
  },
};

export default check;
