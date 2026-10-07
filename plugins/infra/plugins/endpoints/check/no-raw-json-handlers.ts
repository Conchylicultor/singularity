import type { Check } from "@plugins/framework/plugins/tooling/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// Server/central handlers must build JSON responses through implement(), which
// calls Response.json() for you (200 for a returned object, 204 for void). A raw
// Response.json() in a handler bypasses the typed contract. Legitimate raw
// handlers (binary/stream/custom-status) use `new Response(...)`, never
// Response.json().
//
// A handler that is legitimately raw (it cannot go through implement()) is
// exempted, with its reason, in its own plugin's `exempt/index.ts`. Keep that
// set tight: if a NEW file matches, investigate rather than exempting — the
// default answer is to use implement().
const RULE = "endpoints:no-raw-json-handlers";

const check: Check = {
  id: "endpoints:no-raw-json-handlers",
  description:
    "Server/central JSON responses must go through implement(); raw Response.json() in a handler is forbidden",
  exemptable: {
    [RULE]:
      "builds a raw `Response.json()` in a server/central handler instead of returning an object from implement()",
  },
  async run(ctx) {
    const root = await getWorktreeRoot();
    const exempt = await ctx.exempt(RULE);

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
      if (!m.path.includes("/server/") && !m.path.includes("/central/"))
        continue;

      if (exempt.skips(m.path)) continue;

      offenders.push(`${m.path}:${m.line}:${m.text}`);
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} raw Response.json() handler(s) bypassing implement():\n    ${offenders.join("\n    ")}`,
      hint: "Return a plain object from implement() (auto-wrapped in Response.json(); void → 204). Raw new Response(...) is only for binary/stream/custom-status, and a handler that needs it declares an exemption (rule `endpoints:no-raw-json-handlers`) in its plugin's `exempt/index.ts`. See @plugins/infra/plugins/endpoints CLAUDE.md.",
    };
  },
};

export default check;
