import { count, max } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _mailThreads } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { inboxRevisionResource as inboxRevisionDescriptor } from "../../core";

// The live invalidation tick for the inbox DataView. A coarse revision over
// `mail_threads` — row count + max(updatedAt) as epoch-millis — hashed to a
// scalar string. On any thread write the change-feed recomputes it; if the value
// actually changed the client refetches its loaded pages in place. `mode:"push"`
// suppresses byte-identical payloads, so it only pulses on a genuine change.
// Independent of thread-list's tick — this plugin owns its own.
export const inboxRevisionServerResource = defineResource(inboxRevisionDescriptor, {
  mode: "push",
  identityTable: "mail_threads",
  debounceMs: 250,
  loader: async (): Promise<{ rev: string }> => {
    const [agg] = await db
      .select({ total: count(), maxUpdated: max(_mailThreads.updatedAt) })
      .from(_mailThreads);
    const total = agg?.total ?? 0;
    const maxUpdatedMs = agg?.maxUpdated ? new Date(agg.maxUpdated).getTime() : 0;
    return { rev: `${total}:${maxUpdatedMs}` };
  },
});
