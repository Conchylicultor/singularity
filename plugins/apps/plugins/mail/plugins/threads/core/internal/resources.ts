import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// Scalar invalidation tick for the threads DataView: a cheap `{ rev }` string the
// server pushes only when a real `mail_threads` change lands. The DataView keeps
// it OUT of its query key and instead refetches the loaded window in place when
// `rev` changes. Browser-safe descriptor; the server half (loader + push mode)
// is built from it via `defineResource`.
//
// One tick for every mailbox: it is a coarse table-level revision, so it is
// deliberately view-independent — a write in Spam refetches an open Inbox window
// too, which is correct (a thread can move between mailboxes) and costs one
// bounded refetch of the already-loaded pages.
export const mailThreadsRevisionResource = resourceDescriptor<{ rev: string }>(
  "mail-threads-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);
