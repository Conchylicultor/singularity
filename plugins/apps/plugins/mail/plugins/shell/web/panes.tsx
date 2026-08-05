import { type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { MailRoot } from "./components/mail-root";
import { MAIL_APP_PATH } from "./slots";

export const mailRootPane = Pane.define({
  id: "mail-root",
  // Empty segment + `appPath` makes this the Mail app's index pane: bare
  // `/mail` (basePath-stripped to "/") resolves here instead of the global
  // agent-manager welcome pane. It is a capability-driven empty-state that
  // explains how to connect Gmail, and redirects to `/mail/threads` (the one
  // mail surface) the moment the mailbox is ready.
  segment: "",
  appPath: MAIL_APP_PATH,
  component: MailRootPane,
});

function MailRootPane(): ReactElement {
  return (
    <PaneChrome pane={mailRootPane} title="Mail">
      <MailRoot />
    </PaneChrome>
  );
}
