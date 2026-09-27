import {
  lineAt,
  markerCallSpans,
  maskSource,
  matchBracket,
  parseStringField,
  type MarkerCallSpan,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// The pure half of no-db-backed-notify: find every externally-served resource
// whose call reads the DB. No git, no fs — the check feeds it sources from
// listCandidateSources — so which calls count, and what the exemption covers,
// are unit-testable on literal strings.

/**
 * The two spellings of a resource with a hand-`notify`: the old
 * `defineExternalResource(…)`, and network/live's
 * `serveValue(value, { source: "external", … })`. Only serveValue's external
 * arm has `notify`, so a `source: "db"` call is not a candidate.
 */
export const NOTIFY_MARKERS = ["defineExternalResource", "serveValue"] as const;
export type NotifyMarker = (typeof NOTIFY_MARKERS)[number];

// Legitimate, documented exceptions: resources that read a Postgres schema the
// change-feed DELIBERATELY excludes (only the `public` schema gets triggers).
// Such a resource is feed-blind despite reading the DB, so it must keep an
// explicit `notify` and therefore be served external — by either spelling, so
// an entry covers both. Keep this list minimal — each entry is a schema the
// feed cannot see, not a convenience.
//   - jobs `resources.ts`: `jobs-list` reads `graphile_worker.*`.
export const ALLOWED_PATHS = [
  "plugins/infra/plugins/jobs/server/internal/resources.ts",
];

export interface DbBackedNotify {
  path: string;
  line: number;
  marker: NotifyMarker;
}

// The DB handle is always reached as a `db.` member access (db.select /
// db.insert / db.update / db.delete / db.execute / db.query).
const DB_ACCESS = /\bdb\./;

/**
 * Every externally-served resource in `sources` whose call reads the DB. Each
 * source is scanned MASKED, so `db.` inside a string or comment never counts,
 * and the search is scoped to each call's own argument span (block-level, not
 * file-level) so unrelated `db.` use elsewhere in the file is not a false
 * positive. A file under {@link ALLOWED_PATHS} is skipped whole.
 */
export function scanDbBackedNotify(
  sources: ReadonlyArray<{ rel: string; src: string }>,
): DbBackedNotify[] {
  const out: DbBackedNotify[] = [];
  for (const { rel, src } of sources) {
    if (ALLOWED_PATHS.some((p) => rel.startsWith(p))) continue;
    const masked = maskSource(src, { strings: true });
    for (const marker of NOTIFY_MARKERS) {
      for (const span of markerCallSpans(masked, marker)) {
        if (marker === "serveValue" && !servesExternal(src, masked, span)) {
          continue;
        }
        if (DB_ACCESS.test(masked.slice(span.open, span.close + 1))) {
          out.push({
            path: rel,
            line: lineAt(masked, span.identifier),
            marker,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Is this `serveValue(value, { … })` call the external arm? Its second argument
 * must be an inline options object whose OWN `source:` (depth 0 of that object,
 * so an object literal inside the loader never answers) is the literal
 * `"external"`. Anything else — the db arm, or a call whose options are not an
 * inline object, like `serveValue`'s own declaration `(value: …, opts: …)` —
 * is not a candidate. A computed `source: expr` is not read either: the
 * resources facet already throws on one, so it never gets past a build. A
 * `source` the facet cannot see — shorthand `{ source }`, one inside a spread,
 * or options passed as a variable — is not read here either (a false negative,
 * like a loader passed by reference, whose `db.` sits outside the call).
 */
function servesExternal(
  src: string,
  masked: string,
  span: MarkerCallSpan,
): boolean {
  const comma = firstTopLevelComma(masked, span.open + 1, span.close);
  if (comma < 0) return false;
  let open = comma + 1;
  while (open < span.close && /\s/.test(masked[open]!)) open++;
  if (masked[open] !== "{") return false;
  const close = matchBracket(masked, open, "{", "}");
  if (close < 0 || close > span.close) return false;
  const source = parseStringField(src.slice(open + 1, close), "source", {
    depth0: true,
  });
  return source.kind === "value" && source.value === "external";
}

/** Index of the first `,` at bracket depth 0 in `masked[from, to)`, or -1. */
function firstTopLevelComma(masked: string, from: number, to: number): number {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const c = masked[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) return i;
  }
  return -1;
}
