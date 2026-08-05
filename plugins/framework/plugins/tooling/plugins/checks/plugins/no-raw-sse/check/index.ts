import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; inputKeyed?: boolean; run(): Promise<CheckResult> };

const ALLOWED_PATHS = [
  "plugins/framework/plugins/tooling/plugins/checks/plugins/no-raw-sse/check/index.ts",
];

/**
 * A line that names the token as an **`Accept` request header** — which is the
 * exact opposite of what this check bans. A writer says "I am SENDING a stream";
 * an `Accept` header says "I can RECEIVE one", and produces no stream at all.
 *
 * Not a hypothetical carve-out: the MCP Streamable HTTP transport REQUIRES a
 * caller to accept both `application/json` and `text/event-stream`, answering
 * 406 otherwise — unconditionally, `enableJsonResponse` included
 * (`sdk/…/webStandardStreamableHttp.js`, `handlePostRequest`). So every MCP
 * client must name the token, and without this the check would ban calling our
 * own `POST /api/mcp/:conversationId` from TS at all.
 *
 * Deliberately scoped to the matched LINE and deliberately not smarter. A header
 * split across two lines still trips the check — a false POSITIVE, loud and
 * fixed by joining the line, rather than a hole a real writer could hide in.
 * Default-deny is preserved: this exempts one recognizable shape, not a path.
 */
const ACCEPT_HEADER = /\baccept\b["']?\s*[:,]/i;

const check: Check = {
  id: "no-raw-sse",
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-websocket for rationale.
  inputKeyed: true,
  description:
    "Live state must go through `defineResource` / `useResource`; no raw `text/event-stream` writers in TS",
  async run() {
    const root = await getWorktreeRoot();
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
        if (ACCEPT_HEADER.test(m.text)) return false;
        return true;
      })
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`text/event-stream\` response found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint:
        "Live state belongs in `defineResource` (server) + `useResource` (web); see `server/CLAUDE.md` → \"defineResource\". Append-only firehoses (terminal, log tails) belong on a dedicated WS route. The gateway's SSE endpoint for external log streams is Go and out of scope for this check. A CLIENT declaring `Accept: application/json, text/event-stream` (e.g. any MCP caller, which the transport 406s without) is not a writer and is already exempt — keep the header on ONE line so the exemption can see it.",
    };
  },
};

export default check;
