import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { MailSyncStateSchema } from "./fields";
import type { MailSyncState } from "./types";

// One row per connected account's sync-engine watermark + error state. The
// server resource (`sync` plugin) loads the whole `mail_sync_state` table; table
// writes auto-push via the DB change-feed, so the UI sees failures/progress live.
export const mailSyncStateResource = resourceDescriptor<MailSyncState[]>(
  "mail-sync-state",
  z.array(MailSyncStateSchema),
  [],
);
