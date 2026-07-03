export {
  mailSyncEndpoint,
  mailHydrateMessageEndpoint,
  mailSearchEndpoint,
  MailSearchResultSchema,
  type MailSearchResult,
} from "./endpoints";
export {
  BACKFILL_WINDOW_DAYS,
  MAX_BACKFILL_MESSAGES,
  ATTACHMENT_SCAN_DELTA_WINDOW_DAYS,
  MAX_ATTACHMENT_SCAN_PAGES,
} from "./config";
