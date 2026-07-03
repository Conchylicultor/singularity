export { MAIL_INBOX_FIELDS } from "./internal/fields";
export type { MailThreadFieldSpec, MailThreadFieldType } from "./internal/fields";
export {
  queryInbox,
  SortRuleSchema,
  QueryInboxBodySchema,
  QueryInboxResponseSchema,
} from "./internal/endpoints";
export type { QueryInboxBody } from "./internal/endpoints";
export { inboxRevisionResource } from "./internal/resources";
