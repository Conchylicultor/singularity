import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { promptTemplatesTable } from "./tables";

export const promptTemplateAttachments = Attachments.defineLink(promptTemplatesTable);
export const _promptTemplateAttachmentsTable = promptTemplateAttachments.table;
