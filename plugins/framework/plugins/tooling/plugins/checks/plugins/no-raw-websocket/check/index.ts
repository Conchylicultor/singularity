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
  "plugins/framework/plugins/tooling/plugins/checks/plugins/no-raw-websocket/check/index.ts",
  // Standalone bun forensics script dialing a bun --inspect debug socket — a
  // process-to-process debugger connection, not a browser tab. SharedWebSocket
  // (cross-tab connection sharing) is structurally inapplicable, same category
  // as the cli/ exemption above.
  "plugins/debug/plugins/op-wedge-watchdog/scripts/",
];

const check: Check = {
  id: "no-raw-websocket",
  // INPUT-KEYED (Stage 1). The verdict is a pure function of `grepCode` — the
  // only fs/tree access — so its entire read surface routes through the recording
  // view (query selection + per-candidate content). See read-set.ts / runner.ts.
  inputKeyed: true,
  description:
    "WebSocket clients must go through the shared `SharedWebSocket` primitive (not raw `new WebSocket`)",
  async run() {
    const root = await getRoot();
    const matches = await grepCode({
      root,
      pattern: /new WebSocket\(/,
      grepArg: "new WebSocket(",
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
      message: `raw \`new WebSocket(\` found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Use `new SharedWebSocket(...)` from `@plugins/primitives/plugins/networking/web` instead. It mirrors the native WebSocket API but transparently shares a single connection across all tabs of the origin, so opening 20 tabs doesn't open 20 sockets or leave follower tabs without live updates.",
    };
  },
};

export default check;
