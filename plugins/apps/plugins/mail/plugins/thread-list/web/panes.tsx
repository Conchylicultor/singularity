import { type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { MailThreadList } from "./components/thread-list";
import { mailViewTitle } from "./internal/view-title";

// The thread-list column (Miller column 1 of the Mail app). `segment: "v/:view"`
// makes `/mail/v/<view>` resolve here as a fresh root; selecting a row pushes
// `threadPane` (`t/:threadId`) as the next column. `width` is the default column
// width the Miller layout reads.
export const mailboxViewPane = Pane.define({
  id: "mail-view",
  segment: "v/:view",
  component: MailboxViewPane,
  width: 440,
  // No existence gate: an unknown view string simply falls back to the inbox
  // filter server-side, so there is nothing to 404 on.
  resolve: false,
});

function MailboxViewPane(): ReactElement {
  const { view } = mailboxViewPane.useParams();
  return (
    <PaneChrome pane={mailboxViewPane} title={mailViewTitle(view)}>
      <MailThreadList view={view} />
    </PaneChrome>
  );
}
