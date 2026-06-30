import { type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { MailRoot } from "./components/mail-root";
import { MAIL_APP_PATH } from "./slots";

export const mailRootPane = Pane.define({
  id: "mail-root",
  // Empty segment + `appPath` makes this the Mail app's index pane: bare
  // `/mail` (basePath-stripped to "/") resolves here instead of the global
  // agent-manager welcome pane. The mailbox list lives in the sidebar slot, so
  // this pane is the landing surface shown before a thread is opened — a
  // capability-driven empty-state that explains how to connect Gmail.
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
