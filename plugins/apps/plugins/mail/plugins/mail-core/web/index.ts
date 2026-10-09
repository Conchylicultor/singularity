import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { IdKinds } from "@plugins/ids/web";
import {
  mailAccountIdKind,
  mailAttachmentIdKind,
  mailDraftIdKind,
  mailOutboxIdKind,
} from "../core";

export default {
  description:
    "Registers the mail app's own id kinds (mailacct, mailatt, maildraft, mailout) with the web id registry — the server barrel registers the same kinds.",
  contributions: [
    IdKinds.Kind({ kind: mailAccountIdKind }),
    IdKinds.Kind({ kind: mailAttachmentIdKind }),
    IdKinds.Kind({ kind: mailDraftIdKind }),
    IdKinds.Kind({ kind: mailOutboxIdKind }),
  ],
} satisfies PluginDefinition;
