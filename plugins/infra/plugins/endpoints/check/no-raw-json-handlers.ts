import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Server/central handlers must build JSON responses through implement(), which
// calls Response.json() for you (200 for a returned object, 204 for void). A raw
// Response.json() in a handler bypasses the typed contract. Legitimate raw
// handlers (binary/stream/custom-status) use `new Response(...)`, never
// Response.json().
//
// Each entry below is a path PREFIX that is legitimately raw, with the reason it
// cannot go through implement(). Keep this list tight: if a NEW file matches,
// investigate rather than allowlisting — the default answer is to use implement().
const ALLOWED: { prefix: string; reason: string }[] = [
  // The primitive itself: implement() legitimately calls Response.json().
  { prefix: "plugins/infra/plugins/endpoints/", reason: "the endpoints primitive — implement() owns Response.json()" },
  // Framework 500 fallback when a handler throws before any typed response.
  { prefix: "plugins/framework/plugins/server-core/bin/index.ts", reason: "framework 500 error fallback" },
  { prefix: "plugins/framework/plugins/central-core/bin/index.ts", reason: "framework 500 error fallback" },
  // handleClassify returns 202 Accepted; implement() always emits 200/204.
  { prefix: "plugins/conversations/plugins/conversation-category/server/internal/routes.ts", reason: "202 Accepted status (implement() is 200/204 only)" },
  // 400/404 guards emitted before an NDJSON stream Response.
  { prefix: "plugins/debug/plugins/worktree-cleanup/server/internal/handle-delete.ts", reason: "400/404 guards before an NDJSON stream response" },
  // events-test long-poll / onDeadline test handlers (custom statuses + timeouts).
  { prefix: "plugins/infra/plugins/events-test/server/internal/", reason: "long-poll / onDeadline test handlers" },
];

const check: Check = {
  id: "endpoints:no-raw-json-handlers",
  description:
    "Server/central JSON responses must go through implement(); raw Response.json() in a handler is forbidden",
  async run() {
    const root = await getRoot();

    const matches = await grepCode({
      root,
      pattern: /Response\.json\(/,
      grepArg: "Response\\.json\\(",
      maskStrings: false,
      pathspecs: ["*.ts"],
    });

    const offenders: string[] = [];
    for (const m of matches) {
      if (!m.path.startsWith("plugins/")) continue;
      // Server/central code only; never web.
      if (m.path.includes("/web/")) continue;
      if (!m.path.includes("/server/") && !m.path.includes("/central/")) continue;

      if (ALLOWED.some((a) => m.path.startsWith(a.prefix))) continue;

      offenders.push(`${m.path}:${m.line}:${m.text}`);
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} raw Response.json() handler(s) bypassing implement():\n    ${offenders.join("\n    ")}`,
      hint: "Return a plain object from implement() (auto-wrapped in Response.json(); void → 204). Raw new Response(...) is only for binary/stream/custom-status. See @plugins/infra/plugins/endpoints CLAUDE.md.",
    };
  },
};

export default check;
