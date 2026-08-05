export { MAIL_THREAD_FIELDS } from "./internal/fields";
export type { MailThreadFieldSpec, MailThreadFieldType } from "./internal/fields";
export {
  queryThreads,
  SortRuleSchema,
  QueryThreadsBodySchema,
  QueryThreadsResponseSchema,
} from "./internal/endpoints";
export type { QueryThreadsBody } from "./internal/endpoints";
export { mailThreadsRevisionResource } from "./internal/resources";
