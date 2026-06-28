import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// Scalar invalidation tick: a cheap `{ rev }` hash the server pushes only when a
// real change lands (new conversation / status flip / ended). The All-conversations
// DataView keeps it OUT of its query key and instead refetches the loaded window
// in place when `rev` changes. Browser-safe descriptor; the server half (loader +
// push mode) is built from it via `defineResource`.
export const conversationsRevisionResource = resourceDescriptor<{ rev: string }>(
  "conversations-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);
