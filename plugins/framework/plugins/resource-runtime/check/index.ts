import { isTestCodePath } from "@plugins/framework/plugins/plugin-id/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  inputKeyed?: boolean;
  run(): Promise<CheckResult>;
};

// A `RoutePlan` / `ReachPlan` is minted, never written: the type carries a
// module-private brand only `mintRoutePlan` / `mintReachPlan` can put on it, and
// `createResource` refuses a plan without it. This check closes the last door —
// WHO may call the minters. A route's `columns` gate which updates reach the
// resource, so only the compiler that renders the SQL may state them.
//
// The minters' own module and the barrel that re-exports them are allowed, as
// is test code (a harness injects routes directly). Every other production
// caller is a compiler that does not exist yet: add it here with the reason.
const ALLOWED = new Set([
  // The definition.
  "plugins/framework/plugins/resource-runtime/core/routing.ts",
  // The public re-export.
  "plugins/framework/plugins/resource-runtime/core/index.ts",
  // The query compilers' one minter (window / point routes, the grouping reach).
  "plugins/infra/plugins/query-resource/server/internal/routes.ts",
]);

const PATTERN = "mint(Route|Reach)Plan";

const check: Check = {
  id: "resource-runtime:compiled-routes",
  // INPUT-KEYED: a pure `grepCode` over tracked sources.
  inputKeyed: true,
  description:
    "A live resource's route plan (`RoutePlan` / `ReachPlan`) is written by a query compiler, never by hand: only the minters' module, the query-resource compilers' `routes.ts`, and test code may call `mintRoutePlan` / `mintReachPlan`. A route's `columns` decide which updates reach the resource, so a hand-kept list that missed a column the SQL reads would silently drop that column's updates. See research/2026-09-29-global-scoped-change-routing.md.",
  async run() {
    const root = await getWorktreeRoot();
    const matches = await grepCode({
      root,
      pattern: new RegExp(`\\b${PATTERN}\\b`),
      grepArg: PATTERN,
    });
    const offenders = matches.filter(
      (m) => !ALLOWED.has(m.path) && !isTestCodePath(m.path.split("/")),
    );
    if (offenders.length === 0) return { ok: true };
    return {
      ok: false,
      message: `A route plan is minted outside a query compiler in ${offenders.length} place(s):\n    ${offenders.map((m) => `${m.path}:${m.line}:${m.text.trim()}`).join("\n    ")}`,
      hint: "Serve the resource through a compiler that emits its routes from the same declaration it renders the SQL from — a collection is a `liveCollection` served by `serveCollection` (`plugins/network/plugins/live`). A new compiler that must mint plans is added to the allowlist in plugins/framework/plugins/resource-runtime/check/index.ts, with the reason.",
    };
  },
};

export default check;
