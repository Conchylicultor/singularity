import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { quickPromptsTable } from "./tables";

// Quick-prompt ↔ attachment link. Attachments referenced from a prompt body
// (`![](/api/attachments/<id>)`) are linked here so they survive the orphan
// sweep; deleting the prompt cascades the link rows away.
export const _quickPromptAttachments = Attachments.defineLink(quickPromptsTable);
