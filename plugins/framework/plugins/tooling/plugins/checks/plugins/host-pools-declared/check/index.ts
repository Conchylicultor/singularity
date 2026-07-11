import { grepImports } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const BARREL = "@plugins/packages/plugins/host-semaphore/server";

// The structural bar: `createHostSemaphore` may be imported by `host-admission`
// only, so a new host pool cannot appear without going through the registry and
// taking budget from the others (host-admission/core's RESERVED_POOLS + the
// host-budget check). Anyone else importing the primitive directly is declaring
// an unbudgeted pool.
//
// The primitive's own files (barrel, internal, tests) reach it by RELATIVE path,
// never the `@plugins/...` specifier this filter matches, so they are excluded by
// construction — no allowlist entry needed for them.
const ALLOWED_PREFIXES = [
  // The registry — the one legitimate owner.
  "plugins/infra/plugins/host-admission/server/",
];

// Importers not yet migrated onto `defineHostPool`. Now EMPTY — every host pool
// (cpu, push, layout-geometry, and the four server pools) is declared through
// `defineHostPool`, so `host-admission/server` is the sole legitimate importer
// of `createHostSemaphore` and this allowlist has nothing left to grandfather.
const PENDING_MIGRATION: string[] = [];

function allowed(path: string): boolean {
  return (
    ALLOWED_PREFIXES.some((p) => path.startsWith(p)) || PENDING_MIGRATION.includes(path)
  );
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "host-pools-declared",
  description:
    "Only host-admission may import createHostSemaphore — every host pool is declared through defineHostPool",
  async run() {
    // grepImports is string-safe by construction (findImports masks strings), so a
    // barrel path written inside a string/fixture can never match. Match on the
    // exact barrel specifier.
    const matches = await grepImports({
      root: await getRoot(),
      grepArg: BARREL,
      fixed: true,
      filter: (s) => s === BARREL,
      pathspecs: ["plugins/"],
    });

    const offenders = matches.filter((m) => !allowed(m.path));
    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `createHostSemaphore imported outside host-admission in ${offenders.length} place(s):\n    ` +
        offenders.map((m) => `${m.path}:${m.line}`).join("\n    "),
      hint: "Declare the pool via defineHostPool from @plugins/infra/plugins/host-admission/server (which owns its CPU/RAM budget) instead of taking createHostSemaphore directly.",
    };
  },
};

export default check;
