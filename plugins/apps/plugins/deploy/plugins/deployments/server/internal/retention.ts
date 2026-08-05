import { defineRetention } from "@plugins/infra/plugins/retention/server";
import { _deployRuns } from "./tables";

// A deploy ledger row is operational evidence — *what went onto this box and what
// happened* — and it only ever grows, one row per launched run. Ninety days is the
// window in which "when did this last change, and what did it say" is still a live
// question; past that, the box has been re-deployed many times over and the log
// channel's JSONL is the deeper archive. This `defineRetention` call IS
// `_deployRuns`'s growth bound; the bound is recorded only when `deployRunRetention`
// is mounted in `register: [...]` (see `../index.ts`), so a defined-but-unmounted
// policy records nothing.
//
// Swept on `started_at`, not `finished_at`: a run whose backend died mid-flight
// never got one, and age-forever rows are exactly what a retention sweep is for.
//
// `perWorktree: true`: `deploy_runs` lives in the per-worktree DB fork, so the
// sweep must run in every worktree backend (each over its own rows).
export const deployRunRetention = defineRetention({
  table: _deployRuns,
  column: "startedAt",
  ttlDays: 90,
  cron: "0 3 * * *",
  perWorktree: true,
});
