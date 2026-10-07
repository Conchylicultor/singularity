import type { Check } from "@plugins/framework/plugins/tooling/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

const check: Check = {
  id: "no-raw-event-source",
  // INPUT-KEYED (Stage 1). Pure `grepCode` — see no-raw-websocket for rationale.
  inputKeyed: true,
  description:
    "SSE streams must go through the shared ReconnectingEventSource primitive (not raw `new EventSource`)",
  exemptable: {
    "no-raw-event-source":
      "constructs a raw `new EventSource(` — only the networking primitive that every client shares may",
  },
  outOfScope: ["research"],
  async run(ctx) {
    const root = await getWorktreeRoot();
    const matches = await grepCode({
      root,
      pattern: /new EventSource\(/,
      grepArg: "new EventSource(",
      fixed: true,
      maskStrings: true,
    });

    const exempt = await ctx.exempt("no-raw-event-source");
    const offenders = matches
      .filter((m) => !exempt.skips(m.path))
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw \`new EventSource(\` found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: "Use `new ReconnectingEventSource(...)` from `@plugins/primitives/plugins/networking/web` instead. It handles reconnection and inter-tab sharing (leader election) so opening many tabs doesn't saturate the server. A file that genuinely must construct one declares it in its own plugin's `exempt/index.ts` (rule `no-raw-event-source`).",
    };
  },
};

export default check;
