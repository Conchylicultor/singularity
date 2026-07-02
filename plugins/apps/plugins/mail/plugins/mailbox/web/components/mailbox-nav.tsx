import type { ReactElement, ReactNode } from "react";
import { MdMoveToInbox, MdLabelOutline, MdLabel } from "react-icons/md";
import {
  MAIL_SYSTEM_VIEWS,
  labelViewId,
  type MailLabel,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailboxViewPane } from "@plugins/apps/plugins/mail/plugins/thread-list/web";
import {
  mailLabelsResource,
  mailViewCountsResource,
} from "../../core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { systemViewIcon } from "../internal/view-icons";
import { useSelectedMailView } from "../internal/use-selected-mail-view";

/**
 * The whole mailbox left-rail nav: a "Mailboxes" section (the fixed system
 * views) above a "Labels" section (the account's live user labels). Each row
 * navigates the list column by opening `mailboxViewPane` as a fresh root, is
 * highlighted when it is the open view, and carries a live unread-count badge.
 *
 * A single `Mail.Sidebar` contribution renders this — the sidebar is one nav,
 * not one contribution per section.
 */
export function MailboxNav(): ReactElement {
  const selected = useSelectedMailView();

  return (
    <>
      <SidebarPaneSection title="Mailboxes" icon={MdMoveToInbox}>
        <Scroll axis="y" fill>
          {MAIL_SYSTEM_VIEWS.map((view) => {
            const Icon = systemViewIcon(view.id);
            return (
              <MailboxRow
                key={view.id}
                icon={<Icon />}
                title={view.title}
                view={view.id}
                selected={selected === view.id}
              />
            );
          })}
        </Scroll>
      </SidebarPaneSection>

      <LabelsSection selected={selected} />
    </>
  );
}

function LabelsSection({
  selected,
}: {
  selected: string | undefined;
}): ReactElement {
  const labelsResult = useResource(mailLabelsResource);

  return (
    <SidebarPaneSection title="Labels" icon={MdLabel}>
      <Scroll axis="y" fill>
        {labelsResult.pending ? (
          <Loading variant="rows" />
        ) : labelsResult.data.length === 0 ? (
          <Placeholder tone="muted">No labels</Placeholder>
        ) : (
          labelsResult.data.map((label) => {
            const view = labelViewId(label.id);
            return (
              <MailboxRow
                key={label.id}
                icon={<LabelGlyph label={label} />}
                title={label.name}
                view={view}
                selected={selected === view}
              />
            );
          })
        )}
      </Scroll>
    </SidebarPaneSection>
  );
}

function MailboxRow({
  icon,
  title,
  view,
  selected,
}: {
  icon: ReactNode;
  title: string;
  view: string;
  selected: boolean;
}): ReactElement {
  const openPane = useOpenPane();
  return (
    <Row
      icon={icon}
      selected={selected}
      title={title}
      onClick={() => openPane(mailboxViewPane, { view }, { mode: "root" })}
      actions={<UnreadBadge viewId={view} />}
      actionsAlwaysVisible
    >
      {title}
    </Row>
  );
}

/**
 * The live unread-count badge for one view. Reads the shared counts resource and
 * renders nothing while it is still loading (a genuine "unknown yet" state, not a
 * fake zero) or when the view has no unread — so the resource's `pending` is
 * never collapsed into a default. Every row shares the one refcounted resource
 * subscription.
 */
function UnreadBadge({ viewId }: { viewId: string }): ReactNode {
  const result = useResource(mailViewCountsResource);
  if (result.pending) return null;
  const count = result.data[viewId] ?? 0;
  if (count === 0) return null;
  return (
    <Badge variant="muted" shape="pill">
      {count}
    </Badge>
  );
}

/**
 * The leading glyph for a user label: Gmail's own label color as a filled swatch
 * when the label has one (an arbitrary hex the token scale can't express, so an
 * inline background is the honest choice), else the neutral outline label icon.
 */
function LabelGlyph({ label }: { label: MailLabel }): ReactElement {
  if (label.color) {
    return (
      <MdLabel className="icon-auto" style={{ color: label.color }} />
    );
  }
  return <MdLabelOutline className="icon-auto" />;
}
