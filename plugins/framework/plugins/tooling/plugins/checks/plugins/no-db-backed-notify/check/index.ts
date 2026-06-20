import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const CALL = "defineExternalResource(";

// Legitimate, documented exceptions: resources that read a Postgres schema the
// change-feed DELIBERATELY excludes (only the `public` schema gets triggers).
// Such a resource is feed-blind despite reading the DB, so it must keep an
// explicit `notify` and therefore use `defineExternalResource`. Keep this list
// minimal — each entry is a schema the feed cannot see, not a convenience.
//   - jobs `resources.ts`: `jobsListResource` reads `graphile_worker.*`.
const ALLOWED_PATHS = [
  "plugins/infra/plugins/jobs/server/internal/resources.ts",
];

/**
 * For each `defineExternalResource(` occurrence in `masked`, return the byte
 * span of its argument-object — from the `(` to its matching `)` — by walking a
 * paren-depth counter over the masked source (strings/comments already blanked,
 * so braces/parens inside them can't throw off the count). Block-level scoping
 * means a file that mixes an external resource with *unrelated* `db.` use does
 * not false-positive; only a `db.` member access *inside* the call counts.
 */
function externalResourceSpans(masked: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let from = 0;
  for (;;) {
    const at = masked.indexOf(CALL, from);
    if (at < 0) break;
    // Position the cursor on the opening paren of the call.
    let i = at + CALL.length - 1;
    let depth = 0;
    const start = i;
    for (; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    spans.push({ start, end: i });
    from = i + 1;
  }
  return spans;
}

/** 1-based line number of byte offset `idx` in `src`. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

const check: Check = {
  id: "no-db-backed-notify",
  description:
    "Resources that read the DB must not use `defineExternalResource` (which exposes hand-`notify`) — the DB change-feed is their only invalidation path.",
  async run() {
    const root = await getRoot();

    // Fast pre-filter: candidate files that mention the call at all.
    const matches = await grepCode({
      root,
      pattern: /defineExternalResource\(/,
      grepArg: CALL,
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
      for (const span of externalResourceSpans(masked)) {
        const block = masked.slice(span.start, span.end + 1);
        if (dbAccess.test(block)) {
          offenders.push(`${rel}:${lineAt(masked, span.start)}`);
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
