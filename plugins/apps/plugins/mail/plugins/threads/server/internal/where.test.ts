import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { FilterGroup } from "@plugins/primitives/plugins/data-view/core";
// Self-registers every fields storage/filter-sql capability, so `tags` / `bool`
// operators resolve here exactly as they do in the running server.
import "@plugins/fields/plugins/server-capabilities-loader/server";
import { buildThreadsWhere } from "./where";

const dialect = new PgDialect();

function render(frag: SQL | undefined): { sql: string; params: unknown[] } {
  if (frag === undefined) throw new Error("expected a WHERE fragment");
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

function group(...children: FilterGroup["children"]): FilterGroup {
  return { kind: "group", id: "g", conjunction: "and", children };
}

const ACCOUNT = "acct-1";

/**
 * The eight mailbox tabs are AUTHORED CONFIG, not code — and a rule whose
 * `fieldId` or `operatorId` does not resolve is dropped **fail-soft** by
 * `compileWhere`, which means that tab silently shows every thread in the account
 * instead of its mailbox. Nothing else in the system would notice.
 *
 * So this suite reads the real config file and compiles each authored filter to
 * SQL, asserting the rule survives. It is the only thing standing between a
 * typo'd operator id and a Spam tab showing the inbox.
 */
const CONFIG_PATH = join(
  import.meta.dir,
  // internal → server → threads → plugins → mail → plugins → apps → plugins → repo root
  "../../../../../../../..",
  "config/apps/mail/threads/mail-threads.jsonc",
);

interface AuthoredRow {
  id: string;
  name: string;
  view: { type: string; sort?: unknown[]; filter?: FilterGroup };
}

function authoredViews(): AuthoredRow[] {
  const errors: { error: number; offset: number; length: number }[] = [];
  const doc = parseJsonc(readFileSync(CONFIG_PATH, "utf8"), errors) as {
    views?: AuthoredRow[];
  };
  if (errors.length > 0) {
    throw new Error(`${CONFIG_PATH} is not parseable JSONC: ${JSON.stringify(errors)}`);
  }
  const views = doc.views ?? [];
  if (views.length === 0) throw new Error(`${CONFIG_PATH} authored no views`);
  return views;
}

/** Compile one authored view's filter (with only the account predicate beside it). */
function compileAuthored(row: AuthoredRow): { sql: string; params: unknown[] } {
  return render(
    buildThreadsWhere({
      accountId: ACCOUNT,
      filter: row.view.filter ?? null,
      query: "",
    }),
  );
}

describe("the authored mailbox tabs round-trip to real SQL", () => {
  // Each tab paired with a fragment its compiled SQL must contain, plus the
  // operand(s) that must appear as bound params. A dropped rule fails both.
  const EXPECTED: Record<string, { sql: string; params: unknown[] }> = {
    inbox: { sql: '"label_ids" @> $2::jsonb', params: ['["INBOX"]'] },
    starred: { sql: 'COALESCE("mail_threads"."starred", false) = $2', params: [true] },
    important: {
      sql: 'COALESCE("mail_threads"."important", false) = $2',
      params: [true],
    },
    sent: { sql: '"label_ids" @> $2::jsonb', params: ['["SENT"]'] },
    drafts: { sql: '"label_ids" @> $2::jsonb', params: ['["DRAFT"]'] },
    all: { sql: "IS NULL OR NOT", params: ['["SPAM"]', '["TRASH"]'] },
    spam: { sql: '"label_ids" @> $2::jsonb', params: ['["SPAM"]'] },
    trash: { sql: '"label_ids" @> $2::jsonb', params: ['["TRASH"]'] },
  };

  test("the config authors exactly the eight expected mailbox ids, in order", () => {
    expect(authoredViews().map((v) => v.id)).toEqual(Object.keys(EXPECTED));
  });

  test("every tab carries an explicit slug id, a name, and the date-desc sort", () => {
    for (const row of authoredViews()) {
      expect(row.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.view.type).toBe("list");
      expect(row.view.sort).toEqual([
        { fieldId: "lastMessageAt", direction: "desc" },
      ]);
    }
  });

  for (const row of authoredViews()) {
    test(`"${row.id}" compiles its scope instead of being dropped`, () => {
      const expected = EXPECTED[row.id];
      if (!expected) throw new Error(`unexpected authored view id "${row.id}"`);

      const { sql, params } = compileAuthored(row);
      expect(sql).toContain(expected.sql);
      // $1 is always the account predicate; the scope's own operands follow. Had
      // the rule been dropped, `params` would be `[ACCOUNT]` alone.
      expect(params).toEqual([ACCOUNT, ...expected.params]);
    });
  }

  test("a tab whose filter the user cleared shows the whole account, not an error", () => {
    // Clearing a mailbox's filter is now legitimate — that is the point of v2.
    const { params } = render(
      buildThreadsWhere({ accountId: ACCOUNT, filter: null, query: "" }),
    );
    expect(params).toEqual([ACCOUNT]);
  });
});

describe("buildThreadsWhere", () => {
  test("the account predicate is always present", () => {
    const { sql } = render(
      buildThreadsWhere({ accountId: ACCOUNT, filter: null, query: "" }),
    );
    expect(sql).toContain('"mail_threads"."account_id" = $1');
  });

  test("an unmapped field is dropped fail-soft, leaving the account intact", () => {
    const { params } = render(
      buildThreadsWhere({
        accountId: ACCOUNT,
        filter: group({
          kind: "rule",
          id: "r1",
          fieldId: "accountId",
          operatorId: "is",
          value: "someone-elses-account",
        }),
        query: "",
      }),
    );
    expect(params).toEqual([ACCOUNT]);
  });

  test("an OR-rooted filter stays parenthesized inside the outer AND", () => {
    const { sql, params } = render(
      buildThreadsWhere({
        accountId: ACCOUNT,
        filter: {
          kind: "group",
          id: "g",
          conjunction: "or",
          children: [
            { kind: "rule", id: "r1", fieldId: "labels", operatorId: "contains", value: "SPAM" },
            { kind: "rule", id: "r2", fieldId: "labels", operatorId: "contains", value: "TRASH" },
          ],
        },
        query: "",
      }),
    );
    expect(params).toEqual([ACCOUNT, '["SPAM"]', '["TRASH"]']);
    expect(sql).toContain(
      '("mail_threads"."label_ids" @> $2::jsonb or "mail_threads"."label_ids" @> $3::jsonb)',
    );
  });

  test("the search term is a bound param with LIKE wildcards escaped", () => {
    const { params } = render(
      buildThreadsWhere({ accountId: ACCOUNT, filter: null, query: "100% _off_" }),
    );
    expect(params).toEqual([ACCOUNT, "%100\\% \\_off\\_%", "%100\\% \\_off\\_%"]);
  });
});
