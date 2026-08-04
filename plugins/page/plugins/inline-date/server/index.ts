import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { blocksChanged, Editor } from "@plugins/page/plugins/editor/server";
import { MENTION_TOKEN_PATTERN } from "../core";
import { reminderReconcileJob } from "./internal/reconcile-job";
import { reminderFireJob } from "./internal/fire-job";

export default {
  description:
    "Schedules and fires reminder notifications for inline `[[reminder:<id>:<iso>]]` tokens; reconciled from block text on every page.blocksChanged.",
  register: [reminderReconcileJob, reminderFireJob],
  contributions: [
    // Reconcile a page's reminders whenever its blocks change. Declared (not
    // imperatively bound) so the events plugin makes it idempotent across
    // reboots. Match-any on pageId — the per-emit pageId reaches the job via
    // the event payload.
    Trigger({ on: blocksChanged, do: reminderReconcileJob, with: {}, oneShot: false }),
    // The same combined date/reminder pattern the web extension deserializes
    // with, so server-side markdown serialization leaves `[[date:…]]` /
    // `[[reminder:…]]` bytes alone.
    Editor.InlineToken({ pattern: MENTION_TOKEN_PATTERN }),
  ],
} satisfies ServerPluginDefinition;
