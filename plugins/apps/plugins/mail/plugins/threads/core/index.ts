export {
  MAIL_THREAD_FIELDS,
  MAIL_THREAD_FILTERABLE,
  MAIL_THREAD_SEARCHABLE,
} from "./internal/fields";
export type {
  MailThreadFieldSpec,
  MailThreadFieldType,
} from "./internal/fields";
export {
  queryThreads,
  SortRuleSchema,
  QueryThreadsBodySchema,
  QueryThreadsResponseSchema,
} from "./internal/endpoints";
export type { QueryThreadsBody } from "./internal/endpoints";
export { mailThreadsRevisionResource } from "./internal/resources";
