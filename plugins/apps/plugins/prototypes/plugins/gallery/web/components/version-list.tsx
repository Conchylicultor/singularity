import { createContext, useContext } from "react";
import { MdOpenInNew } from "react-icons/md";
import {
  DataView,
  defineDataView,
  type FieldDef,
  type FieldOption,
  type ItemActionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { linkGestureProps } from "@plugins/primitives/plugins/link-gesture/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import type {
  PrototypeHistory,
  PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { PrototypeVersionActions } from "../slots";

const VERSIONS_VIEW = defineDataView("prototypes.versions");

/**
 * Closes the popover the version list sits in. Set by {@link VersionList};
 * `null` outside one.
 */
const CloseVersionListContext = createContext<(() => void) | null>(null);

/**
 * For a row action that takes the reader somewhere on the pane (Compare's
 * "compare with latest"): close the list so it stops covering the stage. A row
 * action is only ever rendered inside the list, so a missing one throws.
 */
export function useCloseVersionList(): () => void {
  const close = useContext(CloseVersionListContext);
  if (close === null) {
    throw new Error("useCloseVersionList must be used within a VersionList");
  }
  return close;
}

/**
 * How each kind of version reads. Keyed by the store's closed kind set, so a
 * kind added there is a type error here until it is given a label.
 */
const KIND_LABELS: Record<PrototypeVersion["kind"], FieldOption> = {
  baseline: { value: "baseline", label: "Baseline", variant: "muted" },
  turn: { value: "turn", label: "Agent turn", variant: "muted" },
  restore: { value: "restore", label: "Restore", variant: "info" },
  manual: { value: "manual", label: "Checkpoint", variant: "primary" },
};

// The request line is the title: it is what the user remembers asking for.
// The number and kind are the muted run after it; when it was made trails.
const FIELDS: FieldDef<PrototypeVersion>[] = [
  {
    id: "subject",
    label: "Request",
    type: "text",
    primary: true,
    value: (v) => v.subject,
  },
  {
    id: "n",
    label: "Version",
    type: "int",
    value: (v) => v.n,
    cell: (v) => `v${v.n}`,
  },
  {
    id: "kind",
    label: "Kind",
    type: "enum",
    value: (v) => v.kind,
    options: Object.values(KIND_LABELS),
  },
  {
    id: "at",
    label: "When",
    type: "date",
    value: (v) => new Date(v.at),
    cell: (v) => <RelativeTime date={new Date(v.at)} />,
    align: "end",
  },
];

/**
 * Every recorded version of one prototype, as a list (newest first, by its
 * config's sort). Picking a row shows that version; `selected` is the one on
 * screen, when it is a recorded one (the "unsaved changes" stop is not a
 * version, so nothing is highlighted there).
 */
export function VersionList({
  history,
  selected,
  onPick,
  onClose,
}: {
  history: PrototypeHistory;
  selected: string | undefined;
  onPick: (version: PrototypeVersion) => void;
  /** Close the popover the list sits in (for row actions). */
  onClose: () => void;
}) {
  return (
    <CloseVersionListContext.Provider value={onClose}>
      <DataView<PrototypeVersion>
        storageKey={VERSIONS_VIEW}
        // The compact toolbar is one bar whose only control (search, in the
        // options popover) appears on hover — without a title the bar reads as an
        // empty band above the rows.
        title={
          history.versions.length === 1
            ? "1 version"
            : `${history.versions.length} versions`
        }
        rows={history.versions}
        fields={FIELDS}
        rowKey={(v) => v.sha}
        views={["list"]}
        defaultView="all"
        density="compact"
        selectedRowId={selected}
        onRowActivate={onPick}
        itemActions={PrototypeVersionActions}
        searchAccessor={(v) => `v${v.n} ${v.subject}`}
        emptyState="No version matches."
      />
    </CloseVersionListContext.Provider>
  );
}

/**
 * The version list's one shipped row action: open the conversation whose turn
 * recorded this version. Nothing for a version no conversation made (the
 * baseline, a hand checkpoint, a restore from the CLI). A link, so ⌘-click opens
 * it in a new tab and leaves the prototype where it is.
 */
export function OpenVersionConversation({
  row,
}: ItemActionProps<PrototypeVersion>) {
  const convId = row.conversationId;
  if (convId === null) return null;
  return (
    <IconButton
      icon={MdOpenInNew}
      label="Open the conversation that made it"
      {...linkGestureProps(({ newTab }) =>
        navigate(conversationRoute.link(agentManagerApp, { convId }), {
          newTab,
        }),
      )}
    />
  );
}
