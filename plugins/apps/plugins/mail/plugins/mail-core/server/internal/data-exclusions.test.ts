/**
 * Mail's real fork and backup exclusions against mail's real drizzle schema:
 * no table kept in a fork or a backup may have a foreign key to a table whose
 * rows are left out (pg_restore would fail re-adding it — see `database/admin`).
 *
 * The catalog is derived from the drizzle table objects rather than a live
 * database, so the test sees the schema this checkout declares, including a
 * link removed before its migration has run anywhere.
 *
 * Run: `./singularity test plugins/apps/plugins/mail`
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import {
  ExcludeFromBackup,
  ExcludeFromFork,
  planBackupExclusions,
  planForkExclusions,
  type CatalogForeignKey,
  type SchemaCatalog,
} from "@plugins/database/plugins/admin/server";
import mailCore, {
  _mailAccounts,
  _mailAttachments,
  _mailDrafts,
  _mailLabels,
  _mailMessageLabels,
  _mailMessages,
  _mailOutbox,
  _mailSyncState,
  _mailThreads,
} from "../index";
import { _mailDraftAttachmentsTable } from "./schema-attachments";

const TABLES: PgTable[] = [
  _mailAccounts,
  _mailSyncState,
  _mailLabels,
  _mailThreads,
  _mailMessages,
  _mailMessageLabels,
  _mailAttachments,
  _mailDrafts,
  _mailOutbox,
  _mailDraftAttachmentsTable,
];

function catalogOf(extra: CatalogForeignKey[] = []): SchemaCatalog {
  const foreignKeys: CatalogForeignKey[] = TABLES.flatMap((t) =>
    getTableConfig(t).foreignKeys.map((fk) => ({
      table: getTableName(t),
      constraint: fk.getName(),
      references: getTableName(fk.reference().foreignTable),
    })),
  );
  const tables = new Set<string>();
  for (const fk of [...foreignKeys, ...extra]) {
    tables.add(fk.table);
    tables.add(fk.references);
  }
  for (const t of TABLES) tables.add(getTableName(t));
  return {
    schemas: [
      {
        name: "public",
        tables: [...tables].sort(),
        partitions: {},
        foreignKeys: [...foreignKeys, ...extra].filter(
          (fk) => fk.table !== fk.references,
        ),
        bytes: 0,
        fromExtension: false,
      },
    ],
  };
}

const tableNames = (c: { table: PgTable | string }[]) =>
  c.map((x) => (typeof x.table === "string" ? x.table : getTableName(x.table)));

let backupTables: string[];
let forkTables: string[];

beforeAll(() => {
  collectContributions([
    { id: "apps/mail/mail-core", contributions: mailCore.contributions },
  ]);
  backupTables = tableNames(ExcludeFromBackup.getContributions());
  forkTables = tableNames(ExcludeFromFork.getContributions());
});

describe("mail's data exclusions", () => {
  test("leave the corpus and its sync state out of backups, and keep the rest", () => {
    expect([...backupTables].sort()).toEqual([
      "mail_attachments",
      "mail_message_labels",
      "mail_messages",
      "mail_sync_state",
      "mail_threads",
    ]);
  });

  test("no kept table links to a left-out one, in a backup or a fork", () => {
    const catalog = catalogOf();
    expect(() =>
      planBackupExclusions(catalog, { tables: backupTables }),
    ).not.toThrow();
    expect(() =>
      planForkExclusions(catalog, { tables: forkTables, schemas: [] }),
    ).not.toThrow();
  });

  test("the drafts → threads link this guards against would be refused", () => {
    const catalog = catalogOf([
      {
        table: "mail_drafts",
        constraint: "mail_drafts_thread_id_mail_threads_id_fk",
        references: "mail_threads",
      },
    ]);
    expect(() =>
      planBackupExclusions(catalog, { tables: backupTables }),
    ).toThrow(/"mail_drafts" links to "mail_threads"/);
    expect(() =>
      planForkExclusions(catalog, { tables: forkTables, schemas: [] }),
    ).toThrow(/"mail_drafts" links to "mail_threads"/);
  });
});
