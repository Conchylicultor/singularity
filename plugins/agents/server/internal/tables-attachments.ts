import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { _agents } from "./tables";

// Agent ↔ attachment link. Agent description and prompt can both carry pasted
// images via `![](/api/attachments/<id>)` markdown refs. Reconciled on update;
// cascade-deleted with the agent row.
export const _agentAttachments = Attachments.defineLink(_agents);
