import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { searchEndpoint } from "../../core/endpoints";
import type { SearchResult } from "../../core/schemas";
import { buildPrefixTsQuery } from "./build-tsquery";

interface SearchRow extends Record<string, unknown> {
  source: string;
  entity_id: string;
  title: string;
  route: string;
  metadata: Record<string, unknown> | null;
  snippet: string;
}

// Ranked full-text search. Builds a prefix-aware tsquery, runs it against the
// GIN-indexed `tsv` column, and produces a highlighted `ts_headline` snippet
// (falling back to the title for title-only matches). Returns [] for queries
// that sanitize to nothing.
export const handleSearch = implement(searchEndpoint, async ({ query }) => {
  const tsq = buildPrefixTsQuery(query.q);
  if (tsq === null) return [];

  const sources =
    query.sources
      ?.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [];

  // Drizzle expands a JS array inside a `sql` template into a comma-separated
  // list of bound params — correct for `IN (…)` but NOT for `ANY(…::text[])`
  // (which needs a single array value, and otherwise raises a malformed-array
  // / type error → 500). Use the `IN` form so the expansion is well-formed.
  const sourceFilter =
    sources.length > 0 ? sql`AND d.source IN (${sql.join(sources, sql`, `)})` : sql``;

  const result = await db.execute<SearchRow>(sql`
    SELECT
      d.source,
      d.entity_id,
      d.title,
      d.route,
      d.metadata,
      ts_headline(
        'english',
        d.body,
        q.query,
        'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=12,MinWords=4'
      ) AS snippet,
      ts_rank(d.tsv, q.query) AS rank
    FROM search_documents d, to_tsquery('english', ${tsq}) q(query)
    WHERE d.tsv @@ q.query
    ${sourceFilter}
    ORDER BY rank DESC
    LIMIT 30
  `);

  return result.rows.map((row): SearchResult => {
    // ts_headline yields "" when the match was title-only (empty body match);
    // fall back to the title so the row still shows something meaningful.
    const snippet = row.snippet && row.snippet.length > 0 ? row.snippet : row.title;
    return {
      source: row.source,
      entityId: row.entity_id,
      title: row.title,
      snippet,
      route: row.route,
      metadata: row.metadata ?? null,
    };
  });
});
