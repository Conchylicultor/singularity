import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// Scalar invalidation tick for the inbox DataView: a cheap `{ rev }` string the
// server pushes only when a real `mail_threads` change lands. The DataView keeps
// it OUT of its query key and instead refetches the loaded window in place when
// `rev` changes. Browser-safe descriptor; the server half (loader + push mode)
// is built from it via `defineResource`.
//
// DISTINCT id from thread-list's `"mail-threads-revision"` — a fresh independent
// tick, so this plugin never couples to the (to-be-removed) thread-list.
export const inboxRevisionResource = resourceDescriptor<{ rev: string }>(
  "mail-inbox-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);
