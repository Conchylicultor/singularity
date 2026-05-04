import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { quickPromptsTable } from "./tables";

// Quick-prompt ↔ attachment link. Attachments referenced from a prompt body
// (`![](/api/attachments/<id>)`) are linked here so they survive the orphan
// sweep; deleting the prompt cascades the link rows away.
export const quickPromptAttachments = Attachments.defineLink(quickPromptsTable);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _quickPromptAttachmentsTable = quickPromptAttachments.table;
