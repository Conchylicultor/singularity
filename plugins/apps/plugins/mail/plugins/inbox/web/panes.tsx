import type { ReactElement } from "react";
import { MdStar, MdStarBorder } from "react-icons/md";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { threadPane } from "@plugins/apps/plugins/mail/plugins/reading-pane/web";
import type { MailThread } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { inboxRevisionResource, queryInbox } from "../core";
import { inboxFieldDefs } from "./internal/fields";
import { InboxRow } from "./components/inbox-row";

const MAIL_INBOX_VIEW = defineDataView("mail-inbox");

export const inboxPane = Pane.define({
  id: "mail-inbox",
  segment: "mailbox",
  component: InboxPaneView,
  width: 520,
});

function InboxPaneView(): ReactElement {
  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // paginated SQL query is the source of truth. While pending, hand a null tick
  // (no refetch) — the first settled `rev` then refreshes once.
  const tick = useResource(inboxRevisionResource);
  const openPane = useOpenPane();
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <PaneChrome pane={inboxPane} title="Inbox">
      <DataView<MailThread>
        storageKey={MAIL_INBOX_VIEW}
        rows={[]}
        fields={inboxFieldDefs}
        rowKey={(t) => t.id}
        views={["list"]}
        viewOptions={{
          list: {
            size: "md",
            leading: (t: MailThread) =>
              t.starred ? (
                <MdStar className="icon-auto text-warning" />
              ) : (
                <MdStarBorder className="icon-auto text-muted-foreground" />
              ),
            renderRow: (t: MailThread) => <InboxRow thread={t} />,
          },
        }}
        dataSource={{
          changeTick,
          fetchPage: (args) => fetchEndpoint(queryInbox, {}, { body: args }),
        }}
        onRowActivate={(t) =>
          openPane(threadPane, { threadId: t.id }, { mode: "push" })
        }
      />
    </PaneChrome>
  );
}
