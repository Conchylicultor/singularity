import { type ReactElement } from "react";
import { MdStar, MdStarBorder } from "react-icons/md";
import {
  useResource,
  matchResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  Pane,
  PaneChrome,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import {
  DataView,
  defineDataView,
} from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { threadPane } from "@plugins/apps/plugins/mail/plugins/reading-pane/web";
import { mailApp } from "@plugins/apps/plugins/mail/plugins/shell/core";
import type { MailThread } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailThreadsRevisionResource, queryThreads } from "../core";
import { useMailThreadFieldDefs } from "./internal/fields";
import { ThreadRow } from "./components/thread-row";

const MAIL_THREADS_VIEW = defineDataView("mail-threads");

const mailThreadsRoute = defineRoute({
  id: "mail-threads",
  segment: "threads",
});

/**
 * The one mail surface: ONE url, ONE DataView, the mailboxes as its TABS.
 *
 * Every mailbox is an authored view instance in
 * `config/apps/mail/threads/mail-threads.jsonc`, and its scope is that view's
 * ordinary `filter` — so switching mailbox is switching tab, and the scope is an
 * editable chip in the Filter pill that the user owns. There is no route param
 * and no server-derived scope: the active view's tree travels the standard
 * `filter` → `FilterGroup` → `compileWhere` path like every other rule, and an
 * edit persists straight back into the config row.
 */
export const mailThreadsPane = Pane.define({
  route: mailThreadsRoute,
  app: mailApp,
  component: MailThreadsPaneView,
  width: 520,
});

function MailThreadsPaneView(): ReactElement {
  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // paginated SQL query is the source of truth. While pending, hand a null tick
  // (no refetch) — the first settled `rev` then refreshes once.
  const tick = useResource(mailThreadsRevisionResource);
  const openPane = useOpenPane();
  const fields = useMailThreadFieldDefs();
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  // The open thread, straight off the reading pane's own route param — so the
  // list highlights the row the user is reading without holding selection state.
  const selectedRowId = threadPane.useRouteEntry()?.params.threadId;

  return (
    <PaneChrome pane={mailThreadsPane} title="Mail">
      <DataView<MailThread>
        storageKey={MAIL_THREADS_VIEW}
        rows={[]}
        fields={fields}
        rowKey={(t) => t.id}
        views={["list"]}
        selectedRowId={selectedRowId}
        viewOptions={{
          list: {
            size: "md",
            leading: (t: MailThread) =>
              t.starred ? (
                <MdStar className="icon-auto text-warning" />
              ) : (
                <MdStarBorder className="icon-auto text-muted-foreground" />
              ),
            renderRow: (t: MailThread) => <ThreadRow thread={t} />,
          },
        }}
        dataSource={{
          changeTick,
          // Only the declared body fields — `args` also carries `dataViewId`,
          // which this endpoint has no use for.
          fetchPage: ({ sort, filter, query, cursor, limit }) =>
            fetchEndpoint(
              queryThreads,
              {},
              { body: { sort, filter, query, cursor, limit } },
            ),
        }}
        onRowActivate={(t) =>
          openPane(threadPane, { threadId: t.id }, { mode: "push" })
        }
      />
    </PaneChrome>
  );
}
