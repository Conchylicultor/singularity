import type { Check } from "@plugins/framework/plugins/tooling/core";
import { grepImports } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

const BARREL = "@plugins/packages/plugins/host-semaphore/server";

// The structural bar: `createHostSemaphore` may be imported by `host-admission`
// only, so a new host pool cannot appear without going through the registry and
// being declared in the pool table (host-admission/core's HOST_POOLS) and
// sized under the host-budget check. Anyone else importing the primitive
// directly is declaring a pool nothing bounds.
//
// The primitive's own files (barrel, internal, tests) reach it by RELATIVE path,
// never the `@plugins/...` specifier this filter matches, so they are excluded by
// construction. The one legitimate importer — host-admission, the registry —
// declares its exemption in its own `exempt/index.ts`.

const check: Check = {
  id: "host-pools-declared",
  description:
    "Only host-admission may import createHostSemaphore — every host pool is declared through defineHostPool",
  exemptable: {
    "host-pools-declared":
      "imports createHostSemaphore directly — declaring a host pool nothing bounds, outside the host-admission registry",
  },
  async run(ctx) {
    // grepImports is string-safe by construction (findImports masks strings), so a
    // barrel path written inside a string/fixture can never match. Match on the
    // exact barrel specifier.
    const matches = await grepImports({
      root: await getWorktreeRoot(),
      grepArg: BARREL,
      fixed: true,
      filter: (s) => s === BARREL,
      pathspecs: ["plugins/"],
    });

    const exempt = await ctx.exempt("host-pools-declared");
    const offenders = matches.filter((m) => !exempt.skips(m.path));
    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `createHostSemaphore imported outside host-admission in ${offenders.length} place(s):\n    ` +
        offenders.map((m) => `${m.path}:${m.line}`).join("\n    "),
      hint: "Declare the pool via defineHostPool from @plugins/infra/plugins/host/plugins/host-admission/server (which owns its CPU/RAM budget) instead of taking createHostSemaphore directly.",
    };
  },
};

export default check;
