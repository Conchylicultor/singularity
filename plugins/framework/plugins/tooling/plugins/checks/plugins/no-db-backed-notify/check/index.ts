import { listCandidateSources } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { NOTIFY_MARKERS, scanDbBackedNotify } from "./scan";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "no-db-backed-notify",
  description:
    'Resources that read the DB must not be served external (`defineExternalResource`, or `serveValue` with `source: "external"`), which exposes hand-`notify` — the DB change-feed is their only invalidation path.',
  async run() {
    // Fast pre-filter: candidate files mentioning either bare identifier. We
    // match the identifiers — NOT a `(`-anchored token — because a call's
    // generic form (`defineExternalResource<…>(…)`) can SPAN LINES, so a
    // per-line `(`-anchored pre-filter would miss it and wrongly drop the file.
    // The precise `<…>`-tolerant, whole-file span walk happens in the scan via
    // `markerCallSpans`. listCandidateSources reads the scan tree (untracked
    // files included), so the verdict is over the exact bytes checked.
    const sources = await listCandidateSources({
      grepArg: NOTIFY_MARKERS.join("|"),
      fixed: false,
    });
    const offenders = scanDbBackedNotify(sources).map(
      (o) => `${o.path}:${o.line} (${o.marker})`,
    );

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `DB-backed external resource found in ${offenders.length} place(s) (its call reads the DB via \`db.\`):\n    ${offenders.join("\n    ")}`,
      hint: 'A resource whose loader reads Postgres must be served from the DB arm — `serveValue(value, { source: "db", … })` (the old spelling: `defineResource`) — with no hand-`notify`, and rely on the DB change-feed for invalidation: that\'s the only path that can never miss a write. The external arm — `serveValue(value, { source: "external", … })` (the old spelling: `defineExternalResource`) — is exclusively for resources whose truth lives OUTSIDE Postgres (git/file watchers, transcript reads, in-memory registries, secrets); only those get a callable `notify`.',
    };
  },
};

export default check;
