import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  MAIL_SYSTEM_VIEWS,
  labelViewId,
  type MailViewFilter,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import {
  _mailLabels,
  _mailThreads,
  mailViewFilterSql,
  resolveMailAccountId,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { mailLabelsResource, mailViewCountsResource } from "../../core";

// User labels for the connected account, ordered by name. Drives the label
// section of the mailbox sidebar. Push-scoped to `mail_labels`, so every label
// upsert from the sync engine auto-pushes through the DB change-feed. Returns []
// on a cold mailbox (no account yet) rather than throwing.
export const mailLabelsServerResource = defineResource(mailLabelsResource, {
  mode: "push",
  identityTable: "mail_labels",
  loader: async () => {
    const accountId = await resolveMailAccountId();
    if (!accountId) return [];
    return db
      .select()
      .from(_mailLabels)
      .where(
        and(eq(_mailLabels.accountId, accountId), eq(_mailLabels.type, "user")),
      )
      .orderBy(_mailLabels.name);
  },
});

// Unread thread counts per view, keyed by view id (system ids like `inbox` plus
// `label:<id>` for user labels). Drives the sidebar's unread badges. Push-scoped
// to `mail_threads` and debounced, so it recomputes at most every 250ms under a
// burst of thread writes. One scan: each view becomes a `count(*) filter (where
// <predicate>)` aggregate over the account's unread threads, sharing the single
// `mailViewFilterSql` compiler with the thread-list query so the two can never
// disagree on what a view means.
export const mailViewCountsServerResource = defineResource(
  mailViewCountsResource,
  {
    mode: "push",
    identityTable: "mail_threads",
    debounceMs: 250,
    loader: async (): Promise<Record<string, number>> => {
      const accountId = await resolveMailAccountId();
      if (!accountId) return {};

      const labels = await db
        .select({ id: _mailLabels.id })
        .from(_mailLabels)
        .where(
          and(
            eq(_mailLabels.accountId, accountId),
            eq(_mailLabels.type, "user"),
          ),
        );

      const views: { id: string; filter: MailViewFilter }[] = [
        ...MAIL_SYSTEM_VIEWS.map((v) => ({ id: v.id, filter: v.filter })),
        ...labels.map((l) => ({
          id: labelViewId(l.id),
          filter: { kind: "label", labelId: l.id } satisfies MailViewFilter,
        })),
      ];

      // Alias each aggregate `vN` — a dynamic `label:<id>` view id is not a safe
      // SQL identifier, so we keep the mapping in JS and reconstruct after.
      const selection: Record<string, SQL<number>> = {};
      views.forEach((v, i) => {
        selection[`v${i}`] =
          sql<number>`count(*) filter (where ${mailViewFilterSql(v.filter)})`;
      });

      const [row] = await db
        .select(selection)
        .from(_mailThreads)
        .where(
          and(
            eq(_mailThreads.accountId, accountId),
            eq(_mailThreads.unread, true),
          ),
        );

      const counts: Record<string, number> = {};
      const raw = (row ?? {}) as Record<string, unknown>;
      views.forEach((v, i) => {
        counts[v.id] = Number(raw[`v${i}`] ?? 0);
      });
      return counts;
    },
  },
);
