import { type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { mailApp } from "../core";
import { MailRoot } from "./components/mail-root";

export const mailRootPane = Pane.define({
  id: "mail-root",
  app: mailApp,
  // The Mail app's index/landing pane — what bare `/mail` resolves to, instead
  // of the global agent-manager welcome pane. It is a capability-driven
  // empty-state that explains how to connect Gmail, and redirects to
  // `/mail/threads` (the one mail surface) the moment the mailbox is ready.
  appIndex: true,
  component: MailRootPane,
});

function MailRootPane(): ReactElement {
  return (
    <PaneChrome pane={mailRootPane} title="Mail">
      <MailRoot />
    </PaneChrome>
  );
}
