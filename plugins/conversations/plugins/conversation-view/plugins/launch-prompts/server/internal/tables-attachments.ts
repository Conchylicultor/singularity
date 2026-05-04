import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { launchPromptsTable } from "./tables";

export const launchPromptAttachments = Attachments.defineLink(launchPromptsTable);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _launchPromptAttachmentsTable = launchPromptAttachments.table;
