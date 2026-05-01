import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { launchPromptsTable } from "./tables";

export const _launchPromptAttachments = Attachments.defineLink(launchPromptsTable);
