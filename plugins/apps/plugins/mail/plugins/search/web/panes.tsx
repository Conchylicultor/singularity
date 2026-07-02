import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { MailSearchBody } from "./components/mail-search-body";
import { MailMessageBody } from "./components/mail-message-reader";

/**
 * On-demand mail search surface. `segment: "search"` resolves relative to the
 * Mail app's base path (`/mail/search`); it is opened as the surface root from
 * the sidebar entry (mode `"root"`). No `appPath` — the app's index landing
 * pane already owns bare `/mail`.
 */
export const mailSearchPane = Pane.define({
  id: "mail-search",
  segment: "search",
  width: 480,
  component: MailSearchBody,
  chrome: { title: () => "Search" },
});

/**
 * The reading pane for a single message. Opened to the right of a search row
 * (`mode: "push"`, `side: "right"`) with the row's envelope handed in as
 * `input` for an instant optimistic header; the body hydrates the full message
 * lazily on mount (self-fetch by `messageId`). Static prefix `m/` before the
 * `:messageId` param satisfies the pane router's "params need a static prefix"
 * rule.
 *
 * `resolve: false` opts out of route-resolution: the pane self-fetches by
 * `messageId` and owns its own loading / not-found / error states in the body,
 * so there is no live-state resource to gate reload/deep-link against. Mirrors
 * `code-explorer`'s `globalFileTreePane` (`segment: "code/:worktree"`,
 * `resolve: false`).
 */
export const mailMessagePane = Pane.define({
  id: "mail-message",
  defaultAncestors: [mailSearchPane],
  segment: "m/:messageId",
  width: 640,
  input: type<MailMessage>(),
  resolve: false,
  component: MailMessageBody,
});
