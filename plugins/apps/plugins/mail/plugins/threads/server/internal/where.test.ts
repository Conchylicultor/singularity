import { test, expect, describe } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  clause,
  or,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { buildThreadsWhere } from "./where";

// The authored mailbox tabs are lowered on the CLIENT now (DataView operator
// sets → the filter language); `web/__tests__/authored-views.test.ts` pins that
// every tab lowers to its scope. This suite pins what the server does with a
// lowered filter.

const dialect = new PgDialect();

function render(frag: SQL | undefined): { sql: string; params: unknown[] } {
  if (frag === undefined) throw new Error("expected a WHERE fragment");
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

const ACCOUNT = "acct-1";

describe("buildThreadsWhere", () => {
  test("the account predicate is always present", () => {
    const { sql, params } = render(
      buildThreadsWhere({ accountId: ACCOUNT, filter: undefined }),
    );
    expect(sql).toContain('"mail_threads"."account_id" = $1');
    expect(params).toEqual([ACCOUNT]);
  });

  test("a mailbox scope compiles to jsonb containment over label_ids", () => {
    const { sql, params } = render(
      buildThreadsWhere({
        accountId: ACCOUNT,
        filter: clause("labels", "hasAll", ["INBOX"]),
      }),
    );
    expect(sql).toContain('"mail_threads"."label_ids" @> to_jsonb($2::text[])');
    expect(params).toEqual([ACCOUNT, ["INBOX"]]);
  });

  test("an unknown column THROWS — nothing is dropped", () => {
    // `accountId` is identity, never a filterable column: a request naming it
    // must not be able to widen or narrow the account scope.
    const filter = clause("accountId", "eq", "someone-elses") as Filter;
    expect(() => buildThreadsWhere({ accountId: ACCOUNT, filter })).toThrow(
      /"accountId"/,
    );
  });

  test("an OR-rooted filter stays parenthesized inside the outer AND", () => {
    const { sql, params } = render(
      buildThreadsWhere({
        accountId: ACCOUNT,
        filter: or(
          clause("labels", "hasAll", ["SPAM"]),
          clause("labels", "hasAll", ["TRASH"]),
        ),
      }),
    );
    expect(params).toEqual([ACCOUNT, ["SPAM"], ["TRASH"]]);
    expect(sql).toMatch(/\$2::text\[\]\)\) OR \(.*\$3::text\[\]/);
  });

  test("the lowered search box is a bound, LIKE-escaped param per column", () => {
    const { sql, params } = render(
      buildThreadsWhere({
        accountId: ACCOUNT,
        filter: or(
          clause("subject", "contains", "100% _off_"),
          clause("snippet", "contains", "100% _off_"),
        ),
      }),
    );
    expect(sql).toContain('("mail_threads"."subject")::text ILIKE $2::text');
    expect(params).toEqual([
      ACCOUNT,
      "%100\\% \\_off\\_%",
      "%100\\% \\_off\\_%",
    ]);
  });
});
