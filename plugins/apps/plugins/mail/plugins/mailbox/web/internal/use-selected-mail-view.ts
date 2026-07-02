import { mailboxViewPane } from "@plugins/apps/plugins/mail/plugins/thread-list/web";

// The mailbox view currently open in the list column, read straight off the
// `mailboxViewPane`'s own route param — so the sidebar highlights the active
// mailbox/label without holding any selection state of its own. Undefined when
// no view pane is open (bare `/mail` landing).
export function useSelectedMailView(): string | undefined {
  return mailboxViewPane.useRouteEntry()?.params.view;
}
