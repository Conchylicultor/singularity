import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { maskSource, markerCallSpans, lineAt } from "@plugins/plugin-meta/plugins/parse-utils/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// Legitimate, documented exceptions: resources that read a Postgres schema the
// change-feed DELIBERATELY excludes (only the `public` schema gets triggers).
// Such a resource is feed-blind despite reading the DB, so it must keep an
// explicit `notify` and therefore use `defineExternalResource`. Keep this list
// minimal — each entry is a schema the feed cannot see, not a convenience.
//   - jobs `resources.ts`: `jobsListResource` reads `graphile_worker.*`.
const ALLOWED_PATHS = [
  "plugins/infra/plugins/jobs/server/internal/resources.ts",
];

const check: Check = {
  id: "no-db-backed-notify",
  description:
    "Resources that read the DB must not use `defineExternalResource` (which exposes hand-`notify`) — the DB change-feed is their only invalidation path.",
  async run() {
    const root = await getWorktreeRoot();

    // Fast pre-filter: candidate files mentioning the bare identifier. We match
    // `\bdefineExternalResource\b` — NOT a `(`-anchored token — because the
    // call's generic form (`defineExternalResource<…>(…)`) can SPAN LINES, so a
    // per-line `(`-anchored pre-filter would miss it and wrongly drop the file.
    // The precise `<…>`-tolerant, whole-file span walk happens below via
    // `markerCallSpans`.
    const matches = await grepCode({
      root,
      pattern: /\bdefineExternalResource\b/,
      grepArg: "defineExternalResource",
      fixed: true,
      maskStrings: true,
    });
    const candidatePaths = [...new Set(matches.map((m) => m.path))];

    // The DB handle is always reached as a `db.` member access (db.select /
    // db.insert / db.update / db.delete / db.execute / db.query). We scan the
    // MASKED source so `db.` inside a string or comment never counts, and scope
    // the search to each `defineExternalResource(...)` call's own argument span
    // (block-level, not file-level) so unrelated `db.` use elsewhere in the file
    // is not a false positive.
    const dbAccess = /\bdb\./;

    const offenders: string[] = [];
    for (const rel of candidatePaths) {
      if (ALLOWED_PATHS.some((p) => rel.startsWith(p))) continue;
      const src = await Bun.file(`${root}/${rel}`)
        .text()
        .catch(() => null);
      if (src == null) continue;
      const masked = maskSource(src, { strings: true });
      for (const span of markerCallSpans(masked, "defineExternalResource")) {
        const block = masked.slice(span.open, span.close + 1);
        if (dbAccess.test(block)) {
          offenders.push(`${rel}:${lineAt(masked, span.identifier)}`);
        }
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `DB-backed \`defineExternalResource(\` found in ${offenders.length} place(s) (loader reads the DB via \`db.\`):\n    ${offenders.join("\n    ")}`,
      hint:
        "A resource whose loader reads Postgres must use `defineResource` (no hand-`notify`) and rely on the DB change-feed for invalidation — that's the only path that can never miss a write. `defineExternalResource` is exclusively for resources whose truth lives OUTSIDE Postgres (git/file watchers, transcript reads, in-memory registries, secrets); only those get a callable `notify`.",
    };
  },
};

export default check;
