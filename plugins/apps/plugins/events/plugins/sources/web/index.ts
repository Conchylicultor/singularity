import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSource } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Events } from "@plugins/apps/plugins/events/plugins/shell/web";
import { eventSourcesPane, eventSourceDetailPane } from "./panes";
import { EventSourceActions } from "./slots";
import { SourceDeleteAction } from "./components/source-delete-action";

export { eventSourcesPane, eventSourceDetailPane } from "./panes";
export { EventSourceDetail, EventSourceActions } from "./slots";
export { SourceConfigForm } from "./components/source-config-form";
export type { SourceConfigFormProps } from "./components/source-config-form";
export { useEventSource } from "./internal/use-source";
export type { SourceLookup } from "./internal/use-source";
export {
  useEventSourceType,
  useEventSourceTypes,
} from "./internal/source-types";
export type {
  EventSourceTypeContribution,
  SourceTypeLookup,
} from "./internal/source-types";
export {
  initialConfigValues,
  readConfigValues,
} from "./internal/config-values";
export type { ConfigValues } from "./internal/config-values";
export {
  CADENCE_LABEL,
  CADENCE_OPTIONS,
  SOURCE_STATUS_LABEL,
  SOURCE_STATUS_OPTIONS,
  SOURCE_STATUS_VARIANT,
  RUN_OUTCOME_LABEL,
  RUN_OUTCOME_OPTIONS,
  RUN_OUTCOME_VARIANT,
  describeRun,
  formatDuration,
} from "./internal/format";

export default {
  description:
    "The Events app's Sources surface: the sidebar entry, the sources DataView with a registry-driven `+` menu, and the per-source side-pane whose sections are contributions. Renders every source type's configuration form generically from its `configFields`, so a source type ships no form code.",
  contributions: [
    Pane.Register({ pane: eventSourcesPane }),
    Pane.Register({ pane: eventSourceDetailPane }),
    Events.Sidebar({
      id: "sources",
      ...sidebarNavItem({
        title: "Sources",
        icon: MdSource,
        onClick: () => openPane(eventSourcesPane, {}, { mode: "root" }),
      }),
    }),
    EventSourceActions({ id: "delete", component: SourceDeleteAction }),
  ],
} satisfies PluginDefinition;
